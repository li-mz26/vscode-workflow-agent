import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowEngine, Workflow, WorkflowChangeEvent, WebViewMessage } from '../engine';

/**
 * Workflow Editor Custom Editor Provider
 * 提供可视化的工作流编辑器界面
 */
export class WorkflowEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'workflowAgent.workflowEditor';
  
  private webviewPanels: Map<string, vscode.WebviewPanel> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly engine: WorkflowEngine
  ) {}

  /**
   * 注册 provider
   */
  public static register(
    context: vscode.ExtensionContext,
    engine: WorkflowEngine
  ): vscode.Disposable {
    const provider = new WorkflowEditorProvider(context, engine);
    
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      WorkflowEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    );

    return providerRegistration;
  }

  /**
   * 打开自定义编辑器
   */
  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const workflowPath = document.uri.fsPath;
    
    // 存储 webview 引用
    this.webviewPanels.set(workflowPath, webviewPanel);

    // 加载工作流
    let workflow: Workflow;
    try {
      workflow = await this.engine.loadWorkflow(workflowPath);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load workflow: ${error}`);
      workflow = this.engine.createWorkflow('Untitled');
    }

    // 配置 webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'webview-ui', 'dist'))
      ]
    };

    // 设置 HTML 内容
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // 处理消息
    this.setupMessageHandling(webviewPanel, document);

    // 发送初始工作流数据
    webviewPanel.webview.postMessage({
      type: 'workflowLoaded',
      payload: workflow
    });

    // 监听工作流变更
    const changeDisposable = this.engine.onChange((event: WorkflowChangeEvent) => {
      webviewPanel.webview.postMessage({
        type: 'workflowChanged',
        payload: event
      });
    });

    // 清理
    webviewPanel.onDidDispose(() => {
      this.webviewPanels.delete(workflowPath);
      changeDisposable.dispose();
    });

    // 监听文档变更
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        // 文档被外部修改，同步到 webview
        try {
          const updatedWorkflow = JSON.parse(e.document.getText()) as Workflow;
          webviewPanel.webview.postMessage({
            type: 'workflowUpdated',
            payload: updatedWorkflow
          });
        } catch {
          // 忽略解析错误
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }

  /**
   * 设置消息处理
   */
  private setupMessageHandling(
    webviewPanel: vscode.WebviewPanel,
    document: vscode.TextDocument
  ): void {
    webviewPanel.webview.onDidReceiveMessage(async (message: WebViewMessage) => {
      try {
        switch (message.type) {
          case 'addNode':
            this.handleAddNode(message.payload as { type: string; position: { x: number; y: number } });
            break;

          case 'removeNode':
            this.handleRemoveNode(message.payload as { nodeId: string });
            break;

          case 'updateNode':
            this.handleUpdateNode(message.payload as { nodeId: string; data: any });
            break;

          case 'addEdge':
            this.handleAddEdge(message.payload as { source: any; target: any; condition?: string });
            break;

          case 'removeEdge':
            this.handleRemoveEdge(message.payload as { edgeId: string });
            break;

          case 'updateNodePosition':
            this.handleUpdateNodePosition(message.payload as { nodeId: string; position: { x: number; y: number } });
            break;

          case 'saveWorkflow':
            await this.handleSaveWorkflow(document);
            break;

          case 'executeWorkflow':
            await this.handleExecuteWorkflow();
            break;

          case 'exportWorkflow':
            this.handleExportWorkflow();
            break;

          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        webviewPanel.webview.postMessage({
          type: 'error',
          payload: { message: (error as Error).message }
        });
      }
    });
  }

  /**
   * 处理添加节点
   */
  private handleAddNode(payload: { type: string; position: { x: number; y: number } }): void {
    const node = this.engine.createNode(payload.type as any, payload.position);
    this.engine.addNode(node);
  }

  /**
   * 处理移除节点
   */
  private handleRemoveNode(payload: { nodeId: string }): void {
    this.engine.removeNode(payload.nodeId);
  }

  /**
   * 处理更新节点
   */
  private handleUpdateNode(payload: { nodeId: string; data: any }): void {
    this.engine.updateNode(payload.nodeId, payload.data);
  }

  /**
   * 处理添加边
   */
  private handleAddEdge(payload: { source: any; target: any; condition?: string }): void {
    const edge = {
      id: `edge_${Date.now()}`,
      source: payload.source,
      target: payload.target,
      condition: payload.condition
    };
    this.engine.addEdge(edge);
  }

  /**
   * 处理移除边
   */
  private handleRemoveEdge(payload: { edgeId: string }): void {
    this.engine.removeEdge(payload.edgeId);
  }

  /**
   * 处理更新节点位置
   */
  private handleUpdateNodePosition(payload: { nodeId: string; position: { x: number; y: number } }): void {
    this.engine.updateNode(payload.nodeId, { position: payload.position });
  }

  /**
   * 处理保存工作流
   */
  private async handleSaveWorkflow(document: vscode.TextDocument): Promise<void> {
    const workflow = this.engine.getCurrentWorkflow();
    if (!workflow) {
      throw new Error('No workflow to save');
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      JSON.stringify(workflow, null, 2)
    );

    await vscode.workspace.applyEdit(edit);
    await document.save();

    vscode.window.showInformationMessage('Workflow saved successfully');
  }

  /**
   * 处理执行工作流
   */
  private async handleExecuteWorkflow(): Promise<void> {
    // 通过命令执行工作流
    await vscode.commands.executeCommand('workflowAgent.executeWorkflow');
  }

  /**
   * 处理导出工作流
   */
  private handleExportWorkflow(): void {
    const workflow = this.engine.getCurrentWorkflow();
    if (!workflow) {
      return;
    }

    vscode.env.clipboard.writeText(JSON.stringify(workflow, null, 2));
    vscode.window.showInformationMessage('Workflow JSON copied to clipboard');
  }

  /**
   * 生成 Webview HTML
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // 在开发模式下使用本地开发服务器
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Editor</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`;
    }

    // 生产模式：使用构建后的文件
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.css'))
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">
    <link rel="stylesheet" href="${styleUri}">
    <title>Workflow Editor</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * 向所有活动的 webview 发送消息
   */
  public postMessageToAll(message: WebViewMessage): void {
    for (const panel of this.webviewPanels.values()) {
      panel.webview.postMessage(message);
    }
  }
}
