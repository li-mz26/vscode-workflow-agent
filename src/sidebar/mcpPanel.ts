import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as path from 'path';

interface MCPServerConfig {
  cwd: string;
  host: string;
  port: number;
}

type MCPStatus = 'stopped' | 'starting' | 'running' | 'error';

export class MCPControlPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'workflowAgent.mcpPanel';

  private view?: vscode.WebviewView;
  private process?: ChildProcessWithoutNullStreams;
  private status: MCPStatus = 'stopped';
  private outputBuffer = '';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this.postState();
          break;
        case 'saveConfig':
          await this.saveConfig(message.config as MCPServerConfig);
          this.postState();
          vscode.window.showInformationMessage('MCP 配置已保存。');
          break;
        case 'start':
          await this.startServer();
          break;
        case 'stop':
          this.stopServer();
          break;
      }
    });
  }

  async startServer(): Promise<void> {
    if (this.process) {
      vscode.window.showWarningMessage('MCP Server 已在运行。');
      return;
    }

    const config = this.getConfig();
    const entryFile = this.context.asAbsolutePath(path.join('out', 'mcp', 'server.js'));
    const args = ['-e', `require('${entryFile.replace(/\\/g, '\\\\')}').runMCPServer()`];

    this.status = 'starting';
    this.appendOutput(`[info] starting mcp server at http://${config.host}:${config.port}\n`);
    this.postState();

    try {
      this.process = spawn(process.execPath, args, {
        cwd: config.cwd || this.context.extensionPath,
        env: {
          ...process.env,
          WORKFLOW_MCP_HOST: config.host,
          WORKFLOW_MCP_PORT: String(config.port),
          WORKFLOW_MCP_CWD: config.cwd || this.context.extensionPath
        },
        stdio: 'pipe'
      });

      this.process.stdout.on('data', (data: Buffer) => {
        this.appendOutput(data.toString('utf-8'));
      });

      this.process.stderr.on('data', (data: Buffer) => {
        this.appendOutput(data.toString('utf-8'));
      });

      this.process.once('spawn', () => {
        this.status = 'running';
        this.postState();
      });

      this.process.once('error', (error) => {
        this.status = 'error';
        this.appendOutput(`[error] ${String(error)}\n`);
        this.process = undefined;
        this.postState();
      });

      this.process.once('exit', (code, signal) => {
        this.appendOutput(`[info] process exited (code=${code}, signal=${signal})\n`);
        this.process = undefined;
        this.status = 'stopped';
        this.postState();
      });
    } catch (error) {
      this.status = 'error';
      this.appendOutput(`[error] ${String(error)}\n`);
      this.process = undefined;
      this.postState();
    }
  }

  stopServer(): void {
    if (!this.process) {
      return;
    }

    this.appendOutput('[info] stopping MCP server...\n');
    this.process.kill();
    this.process = undefined;
    this.status = 'stopped';
    this.postState();
  }

  dispose(): void {
    this.stopServer();
  }

  private getConfig(): MCPServerConfig {
    const defaultConfig = this.getDefaultConfig();
    const saved = this.context.workspaceState.get<Partial<MCPServerConfig>>('workflowAgent.mcpConfig', {});

    return {
      cwd: saved.cwd || defaultConfig.cwd,
      host: saved.host || defaultConfig.host,
      port: saved.port || defaultConfig.port
    };
  }

  private async saveConfig(config: MCPServerConfig): Promise<void> {
    await this.context.workspaceState.update('workflowAgent.mcpConfig', config);
  }

  private getDefaultConfig(): MCPServerConfig {
    return {
      cwd: this.context.extensionPath,
      host: '127.0.0.1',
      port: 8765
    };
  }

  private appendOutput(text: string): void {
    this.outputBuffer += text;
    if (this.outputBuffer.length > 12000) {
      this.outputBuffer = this.outputBuffer.slice(-12000);
    }
    this.postState();
  }

  private postState(): void {
    if (!this.view) return;
    this.view.webview.postMessage({
      type: 'state',
      status: this.status,
      config: this.getConfig(),
      output: this.outputBuffer,
      running: Boolean(this.process)
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
    .row { margin-bottom: 10px; }
    label { font-size: 12px; display:block; margin-bottom:4px; color: var(--vscode-descriptionForeground); }
    input, select { width: 100%; box-sizing: border-box; padding: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .actions { display: flex; gap: 8px; margin: 12px 0; }
    button { flex: 1; padding: 6px; border: none; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .status { font-size: 12px; margin: 6px 0; }
    pre { margin-top: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); padding: 8px; white-space: pre-wrap; font-size: 11px; max-height: 240px; overflow: auto; }
  </style>
</head>
<body>
  <div class="row"><label>工作目录</label><input id="cwd" /></div>
  <div class="row"><label>监听地址</label>
    <select id="host">
      <option value="127.0.0.1">127.0.0.1 (本机)</option>
      <option value="0.0.0.0">0.0.0.0 (局域网可访问)</option>
    </select>
  </div>
  <div class="row"><label>端口</label><input id="port" type="number" min="1" max="65535" /></div>
  <div class="actions">
    <button id="save">保存配置</button>
    <button id="start">启动</button>
    <button class="secondary" id="stop">停止</button>
  </div>
  <div class="status" id="status">状态: stopped</div>
  <pre id="output"></pre>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type !== 'state') return;
      byId('cwd').value = msg.config.cwd || '';
      byId('host').value = msg.config.host || '127.0.0.1';
      byId('port').value = msg.config.port || 8765;
      byId('status').textContent = '状态: ' + msg.status;
      byId('output').textContent = msg.output || '';
    });

    byId('save').addEventListener('click', () => {
      vscode.postMessage({
        type: 'saveConfig',
        config: {
          cwd: byId('cwd').value,
          host: byId('host').value,
          port: Number(byId('port').value) || 8765
        }
      });
    });

    byId('start').addEventListener('click', () => vscode.postMessage({ type: 'start' }));
    byId('stop').addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

export default MCPControlPanelProvider;
