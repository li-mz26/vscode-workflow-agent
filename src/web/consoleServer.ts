import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowLoader, WorkflowEngine } from '../engine';
import { NodeConfig, Workflow } from '../engine/types';

interface JsonResponse {
  success: boolean;
  data?: any;
  error?: string;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: JsonResponse): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload));
}

function safeResolvePath(baseDir: string, targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(baseDir);
  if (!resolved.startsWith(root)) {
    throw new Error(`路径超出允许范围: ${targetPath}`);
  }
  return resolved;
}

function findWorkflowDirs(rootPath: string): string[] {
  const dirs: string[] = [];

  const walk = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    let hasWorkflow = false;

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.workflow.json')) {
        hasWorkflow = true;
      }
    }

    if (hasWorkflow) {
      dirs.push(current);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(path.join(current, entry.name));
    }
  };

  walk(rootPath);
  return dirs.sort();
}

interface ConsoleServerOptions {
  host?: string;
  port?: number;
  workspaceRoot?: string;
  mcp?: { host: string; port: number; transport: "sse" | "streamable-http" };
}

function getConsoleHtml(defaultRoot: string, mcpInfo?: { host: string; port: number; transport: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow 控制台</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #f7f7fb; color: #1f2937; }
    .row { display: flex; gap: 8px; margin-bottom: 12px; }
    input, button, select, textarea { padding: 8px; font-size: 14px; }
    button { cursor: pointer; }
    #workflowList { min-width: 420px; }
    pre { background: #111827; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow: auto; max-height: 45vh; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Workflow 控制台（Web）</h1>
  <p>MCP 服务：${mcpInfo ? `http://${mcpInfo.host}:${mcpInfo.port}/mcp (${mcpInfo.transport})` : "未配置"}</p>

  <div class="card">
    <div class="row">
      <input id="rootPath" style="width: 520px;" value="${defaultRoot}" />
      <button onclick="scanWorkflows()">扫描工作流</button>
    </div>
    <div class="row">
      <select id="workflowList"></select>
      <button onclick="loadWorkflow()">加载</button>
      <button onclick="runWorkflow()">运行</button>
    </div>
    <div class="row">
      <textarea id="initialInput" style="width: 720px; height: 80px;" placeholder='运行输入 JSON，例如 {"score": 90}'>{}</textarea>
    </div>
  </div>

  <div class="card">
    <h3>工作流定义</h3>
    <pre id="workflowContent">尚未加载</pre>
  </div>

  <div class="card">
    <h3>执行结果</h3>
    <pre id="runResult">尚未运行</pre>
  </div>

  <script>
    const workflowList = document.getElementById('workflowList');
    const workflowContent = document.getElementById('workflowContent');
    const runResult = document.getElementById('runResult');

    async function callApi(url, options = {}) {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }
      return data.data;
    }

    async function scanWorkflows() {
      const rootPath = document.getElementById('rootPath').value;
      const data = await callApi('/api/workflows/scan?root=' + encodeURIComponent(rootPath));
      workflowList.innerHTML = '';
      for (const dir of data.directories) {
        const option = document.createElement('option');
        option.value = dir;
        option.textContent = dir;
        workflowList.appendChild(option);
      }
      if (!data.directories.length) {
        workflowContent.textContent = '未发现工作流';
      }
    }

    async function loadWorkflow() {
      const dir = workflowList.value;
      if (!dir) return;
      const data = await callApi('/api/workflows/load?path=' + encodeURIComponent(dir));
      workflowContent.textContent = JSON.stringify(data.workflow, null, 2);
    }

    async function runWorkflow() {
      const dir = workflowList.value;
      if (!dir) return;
      const inputRaw = document.getElementById('initialInput').value || '{}';
      const input = JSON.parse(inputRaw);
      const data = await callApi('/api/workflows/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: dir, input })
      });
      runResult.textContent = JSON.stringify(data.result, null, 2);
    }

    scanWorkflows().catch(err => {
      workflowContent.textContent = '扫描失败: ' + err.message;
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export async function runWorkflowConsoleServer(options: ConsoleServerOptions = {}): Promise<void> {
  const host = options.host || process.env.WORKFLOW_WEB_HOST || '127.0.0.1';
  const port = options.port || Number(process.env.WORKFLOW_WEB_PORT || 3030);
  const workspaceRoot = options.workspaceRoot || process.env.WORKFLOW_WEB_ROOT || process.cwd();
  const engine = new WorkflowEngine();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { success: false, error: 'Empty url' });
      return;
    }

    const requestUrl = new URL(req.url, `http://${host}:${port}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(getConsoleHtml(workspaceRoot, options.mcp));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/workflows/scan') {
        const rootParam = requestUrl.searchParams.get('root') || workspaceRoot;
        const root = safeResolvePath(workspaceRoot, rootParam);
        const directories = findWorkflowDirs(root);
        sendJson(res, 200, { success: true, data: { root, directories } });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/workflows/load') {
        const pathParam = requestUrl.searchParams.get('path');
        if (!pathParam) throw new Error('缺少 path 参数');

        const workflowPath = safeResolvePath(workspaceRoot, pathParam);
        const result = await WorkflowLoader.loadFromDirectory(workflowPath);
        if (!result.success || !result.workflow) {
          throw new Error(result.error || '工作流加载失败');
        }

        sendJson(res, 200, {
          success: true,
          data: {
            path: workflowPath,
            workflow: result.workflow,
            nodeConfigs: Object.fromEntries(result.nodeConfigs || new Map())
          }
        });
        return;
      }


      if (req.method === 'POST' && requestUrl.pathname === '/api/workflows/save') {
        const body = await readJsonBody(req);
        if (!body.path) throw new Error('缺少 path 参数');
        if (!body.workflow) throw new Error('缺少 workflow 参数');

        const workflowPath = safeResolvePath(workspaceRoot, body.path);
        const workflow = body.workflow as Workflow;
        const nodeConfigs = new Map<string, NodeConfig>(Object.entries((body.nodeConfigs || {}) as Record<string, NodeConfig>));

        const saveResult = await WorkflowLoader.saveToDirectory(workflowPath, workflow, nodeConfigs);
        if (!saveResult.success) {
          throw new Error(saveResult.error || '工作流保存失败');
        }

        sendJson(res, 200, { success: true, data: { path: workflowPath } });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/workflows/run') {
        const body = await readJsonBody(req);
        if (!body.path) throw new Error('缺少 path 参数');

        const workflowPath = safeResolvePath(workspaceRoot, body.path);
        const loaded = await WorkflowLoader.loadFromDirectory(workflowPath);
        if (!loaded.success || !loaded.workflow || !loaded.nodeConfigs) {
          throw new Error(loaded.error || '工作流加载失败');
        }

        const result = await engine.execute(loaded.workflow, loaded.nodeConfigs, body.input || {});
        sendJson(res, 200, { success: true, data: { result } });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/mcp/status') {
        sendJson(res, 200, { success: true, data: options.mcp || null });
        return;
      }

      sendJson(res, 404, { success: false, error: 'Not found' });
    } catch (error) {
      sendJson(res, 400, { success: false, error: String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`Workflow Web Console running at http://${host}:${port} (root=${workspaceRoot})`);
}

if (require.main === module) {
  runWorkflowConsoleServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
