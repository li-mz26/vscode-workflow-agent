/**
 * 工作流编辑器 - 自定义编辑器实现
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Workflow, WorkflowNode, WorkflowEdge, NodeType, NodeConfig } from '../engine/types';
import { WorkflowLoader } from '../engine/loader';

/**
 * 生成节点默认配置
 */
function createDefaultNodeConfig(type: NodeType): NodeConfig {
  switch (type) {
    case 'start':
      return { triggerType: 'manual' };
    case 'end':
      return { outputMode: 'last' };
    case 'code':
      return {
        language: 'python',
        code: `# 在此编写代码
# input: 输入数据
# 返回值将作为输出

def main(input):
    print(f"Input: {input}")
    return {"result": input}`,
        timeout: 30000
      };
    case 'llm':
      return {
        model: { provider: 'openai', model: 'gpt-4' },
        systemPrompt: '你是一个有帮助的助手。',
        userPrompt: '{{input}}',
        temperature: 0.7,
        maxTokens: 2000
      };
    case 'switch':
      return {
        branches: [
          { id: 'branch_1', name: '是', condition: 'data.value > 0' },
          { id: 'branch_default', name: '否', condition: 'true' }
        ],
        defaultBranch: 'branch_default',
        evaluationMode: 'first-match'
      };
    case 'parallel':
      return {
        branches: [
          { id: 'parallel_1', name: '分支 1' },
          { id: 'parallel_2', name: '分支 2' }
        ],
        waitMode: 'all',
        failMode: 'stop'
      };
    default:
      return {} as NodeConfig;
  }
}

/**
 * 生成节点详细信息（用于可视化显示）
 */
function createDefaultNodeDetail(type: NodeType, config: NodeConfig): any {
  if (type === 'switch' && 'branches' in config) {
    const switchConfig = config as any;
    return {
      branches: switchConfig.branches,
      defaultBranch: switchConfig.defaultBranch
    };
  }
  if (type === 'parallel' && 'branches' in config) {
    const parallelConfig = config as any;
    return {
      parallelBranches: parallelConfig.branches
    };
  }
  return undefined;
}

/**
 * 获取配置文件扩展名
 */
function getConfigExtension(type: NodeType, config: NodeConfig): string {
  if ('language' in config && 'code' in config) {
    return config.language === 'python' ? '.py' : 
           config.language === 'typescript' ? '.ts' : '.js';
  }
  return '.json';
}

class WorkflowDocument implements vscode.CustomDocument {
  public workflow: Workflow;
  public nodeConfigs: Map<string, NodeConfig>;
  public workflowDir: string;

  constructor(
    public readonly uri: vscode.Uri, 
    workflow: Workflow,
    nodeConfigs: Map<string, NodeConfig> = new Map()
  ) {
    this.workflow = workflow;
    this.nodeConfigs = nodeConfigs;
    this.workflowDir = path.dirname(uri.fsPath);
  }

  dispose(): void {}
}

export class WorkflowEditorProvider implements vscode.CustomEditorProvider<WorkflowDocument> {
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<WorkflowDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<WorkflowDocument> {
    const workflowDir = path.dirname(uri.fsPath);
    const result = await WorkflowLoader.loadFromDirectory(workflowDir);
    
    if (result.success && result.workflow) {
      return new WorkflowDocument(uri, result.workflow, result.nodeConfigs);
    }
    
    const content = await vscode.workspace.fs.readFile(uri);
    const workflow: Workflow = JSON.parse(Buffer.from(content).toString('utf-8'));
    return new WorkflowDocument(uri, workflow, new Map());
  }

  async resolveCustomEditor(
    document: WorkflowDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, document.workflow);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webviewPanel.webview.postMessage({
            type: 'init',
            workflow: document.workflow,
            nodeConfigs: Object.fromEntries(document.nodeConfigs)
          });
          break;

        case 'save':
          document.workflow = message.workflow;
          document.nodeConfigs = new Map(Object.entries(message.nodeConfigs || {}));
          await this.saveDocument(document);
          webviewPanel.webview.postMessage({ type: 'saved' });
          break;

        case 'addNode':
          this.handleAddNode(document, message.node, webviewPanel.webview);
          break;

        case 'removeNode':
          this.handleRemoveNode(document, message.nodeId, webviewPanel.webview);
          break;

        case 'updateNodeConfig':
          this.handleUpdateNodeConfig(document, message.nodeId, message.config);
          break;
          
        case 'syncNodeConfigs':
          // 同步 nodeConfigs 并更新配置文件
          await this.syncNodeConfigFiles(document, message.nodeConfigs);
          break;
          
        case 'run':
          // 运行工作流
          await this.runWorkflow(document, webviewPanel.webview);
          break;
      }
    });
  }

  private async saveDocument(document: WorkflowDocument): Promise<void> {
    const result = await WorkflowLoader.saveToDirectory(
      document.workflowDir,
      document.workflow,
      document.nodeConfigs
    );
    
    if (!result.success) {
      vscode.window.showErrorMessage(`保存失败: ${result.error}`);
    } else {
      vscode.window.showInformationMessage('工作流保存成功！');
    }
  }

  private handleAddNode(document: WorkflowDocument, node: WorkflowNode, webview: vscode.Webview): void {
    const config = createDefaultNodeConfig(node.type as NodeType);
    document.nodeConfigs.set(node.id, config);
    
    // 设置 detail 字段（用于可视化显示分支）
    node.detail = createDefaultNodeDetail(node.type as NodeType, config);
    
    const ext = getConfigExtension(node.type as NodeType, config);
    node.configRef = ext === '.json' 
      ? `nodes/${node.id}_${node.type}.json`
      : `nodes/${node.id}_${node.type}${ext}`;
    
    this.createNodeConfigFile(document, node, config);
    webview.postMessage({ type: 'nodeAdded', node, config });
  }
  
  private async createNodeConfigFile(document: WorkflowDocument, node: WorkflowNode, config: NodeConfig): Promise<void> {
    const path = await import('path');
    const fs = await import('fs');
    
    const nodesDir = path.join(document.workflowDir, 'nodes');
    if (!fs.existsSync(nodesDir)) {
      await fs.promises.mkdir(nodesDir, { recursive: true });
    }
    
    const ext = getConfigExtension(node.type as NodeType, config);
    const filePath = path.join(nodesDir, `${node.id}_${node.type}${ext}`);
    await fs.promises.writeFile(filePath, '', 'utf-8');
  }

  private async handleRemoveNode(document: WorkflowDocument, nodeId: string, webview: vscode.Webview): Promise<void> {
    const fs = await import('fs');
    
    // 删除配置文件 - 直接查找 nodes 目录下匹配 {nodeId}_* 的文件
    const nodesDir = path.join(document.workflowDir, 'nodes');
    if (fs.existsSync(nodesDir)) {
      const files = await fs.promises.readdir(nodesDir);
      for (const file of files) {
        // 匹配 {nodeId}_{type}.{ext} 格式
        if (file.startsWith(`${nodeId}_`)) {
          const filePath = path.join(nodesDir, file);
          await fs.promises.unlink(filePath);
          console.log('[Editor] Deleted config file:', file);
        }
      }
    }
    
    // 更新内存状态
    document.workflow.nodes = document.workflow.nodes.filter(n => n.id !== nodeId);
    document.workflow.edges = document.workflow.edges.filter(
      e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
    );
    document.nodeConfigs.delete(nodeId);
    
    webview.postMessage({ type: 'nodeRemoved', nodeId });
  }

  private handleUpdateNodeConfig(document: WorkflowDocument, nodeId: string, config: NodeConfig): void {
    document.nodeConfigs.set(nodeId, config);
  }
  
  /**
   * 同步节点配置文件（撤销/重做时调用）
   */
  private async syncNodeConfigFiles(document: WorkflowDocument, nodeConfigsObj: Record<string, NodeConfig>): Promise<void> {
    const fs = await import('fs');
    
    // 更新内存中的 nodeConfigs
    document.nodeConfigs = new Map(Object.entries(nodeConfigsObj));
    
    const nodesDir = path.join(document.workflowDir, 'nodes');
    
    // 确保 nodes 目录存在
    if (!fs.existsSync(nodesDir)) {
      await fs.promises.mkdir(nodesDir, { recursive: true });
    }
    
    // 获取当前应该存在的配置文件列表
    const expectedFiles = new Set<string>();
    for (const [nodeId, config] of document.nodeConfigs) {
      const node = document.workflow.nodes.find(n => n.id === nodeId);
      if (node) {
        const ext = getConfigExtension(node.type as NodeType, config);
        const fileName = `${nodeId}_${node.type}${ext}`;
        expectedFiles.add(fileName);
      }
    }
    
    // 删除不需要的配置文件
    if (fs.existsSync(nodesDir)) {
      const existingFiles = await fs.promises.readdir(nodesDir);
      for (const file of existingFiles) {
        if (!expectedFiles.has(file) && (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.py'))) {
          const filePath = path.join(nodesDir, file);
          await fs.promises.unlink(filePath);
        }
      }
    }
    
    // 创建缺失的配置文件
    for (const [nodeId, config] of document.nodeConfigs) {
      const node = document.workflow.nodes.find(n => n.id === nodeId);
      if (node) {
        const ext = getConfigExtension(node.type as NodeType, config);
        const fileName = `${nodeId}_${node.type}${ext}`;
        const filePath = path.join(nodesDir, fileName);
        
        // 如果文件不存在，创建空文件
        if (!fs.existsSync(filePath)) {
          await fs.promises.writeFile(filePath, '', 'utf-8');
        }
      }
    }
  }
  
  /**
   * 运行工作流
   */
  private async runWorkflow(document: WorkflowDocument, webview: vscode.Webview): Promise<void> {
    const { WorkflowEngine } = await import('../engine');
    
    // 重置所有节点状态
    webview.postMessage({ type: 'executionStart', nodeIds: document.workflow.nodes.map(n => n.id) });
    
    vscode.window.showInformationMessage('开始运行工作流...');
    
    const engine = new WorkflowEngine();
    
    // 监听执行事件，实时推送到 webview
    engine.on((event) => {
      if (event.type === 'node:start') {
        webview.postMessage({ 
          type: 'nodeStatus', 
          nodeId: event.nodeId, 
          status: 'running' 
        });
      } else if (event.type === 'node:end') {
        const result = event.result;
        webview.postMessage({ 
          type: 'nodeStatus', 
          nodeId: result.nodeId, 
          status: result.status,
          edgeId: findEdgeEndingAt(document.workflow, result.nodeId)
        });
      } else if (event.type === 'workflow:end') {
        webview.postMessage({ 
          type: 'executionEnd', 
          status: event.result.status,
          error: event.result.error
        });
      }
    });
    
    try {
      const result = await engine.execute(document.workflow, document.nodeConfigs);
      
      if (result.status === 'success') {
        vscode.window.showInformationMessage('工作流运行成功！');
      } else {
        vscode.window.showErrorMessage(`工作流运行失败: ${result.error || '未知错误'}`);
      }
      
      // 输出详细结果
      const outputChannel = vscode.window.createOutputChannel('Workflow Execution');
      outputChannel.clear();
      outputChannel.appendLine('=== Workflow Execution Result ===');
      outputChannel.appendLine(`Status: ${result.status}`);
      outputChannel.appendLine(`Duration: ${result.duration}ms`);
      outputChannel.appendLine('');
      outputChannel.appendLine('=== Node Results ===');
      for (const nodeResult of result.nodeResults) {
        outputChannel.appendLine(`\n[${nodeResult.nodeId}] ${nodeResult.status}`);
        outputChannel.appendLine(`  Duration: ${nodeResult.duration}ms`);
        if (nodeResult.output) {
          outputChannel.appendLine(`  Output: ${JSON.stringify(nodeResult.output, null, 2)}`);
        }
        if (nodeResult.error) {
          outputChannel.appendLine(`  Error: ${nodeResult.error}`);
        }
      }
      outputChannel.show();
      
    } catch (error) {
      vscode.window.showErrorMessage(`运行错误: ${error}`);
      webview.postMessage({ type: 'executionEnd', status: 'failed', error: String(error) });
    }
  }

  saveCustomDocument(document: WorkflowDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return this.saveDocument(document);
  }

  saveCustomDocumentAs(document: WorkflowDocument, destination: vscode.Uri, _cancellation: vscode.CancellationToken): Thenable<void> {
    const content = JSON.stringify(document.workflow, null, 2);
    return vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
  }

  revertCustomDocument(document: WorkflowDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return vscode.workspace.fs.readFile(document.uri).then(content => {
      document.workflow = JSON.parse(Buffer.from(content).toString('utf-8'));
    });
  }

  backupCustomDocument(document: WorkflowDocument, context: vscode.CustomDocumentBackupContext, _cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
    const content = JSON.stringify(document.workflow, null, 2);
    return vscode.workspace.fs.writeFile(context.destination, Buffer.from(content, 'utf-8')).then(() => ({
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination)
    }));
  }

  private getHtml(webview: vscode.Webview, workflow: Workflow): string {
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Workflow Editor - ${workflow.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      overflow: hidden;
    }
    #app { height: 100%; display: flex; flex-direction: column; }
    
    /* 视图切换标签 */
    .view-tabs {
      display: flex;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder);
      padding: 0 10px;
    }
    .view-tab {
      padding: 8px 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .view-tab:hover { color: var(--vscode-foreground); }
    .view-tab.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-button-background);
    }
    .view-tab .icon { font-size: 14px; }
    
    /* 撤销重做按钮 */
    .history-buttons {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }
    .history-btn {
      padding: 4px 8px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border);
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.7;
    }
    .history-btn:hover:not(:disabled) {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }
    .history-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    
    /* 主内容区域 */
    .main-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .main-content.hidden { display: none; }
    
    /* 左侧工具栏 */
    .toolbar {
      width: 60px;
      background: var(--vscode-sideBar-background);
      border-right: 1px solid var(--vscode-sideBar-border);
      padding: 10px 5px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 10;
    }
    .toolbar-btn {
      width: 50px;
      height: 50px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .toolbar-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .toolbar-btn .icon { font-size: 18px; margin-bottom: 2px; }
    
    /* 画布区域 */
    .canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: default;
    }
    .canvas-container.panning { cursor: grab; }
    .canvas-container.panning.active { cursor: grabbing; }
    
    #canvas {
      width: 100%;
      height: 100%;
      position: relative;
      transform-origin: 0 0;
    }
    
    .canvas-bg {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: radial-gradient(circle, var(--vscode-editorRuler-foreground) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
    }
    
    .nodes-container {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
    }
    
    /* 节点样式 */
    .node {
      position: absolute;
      min-width: 150px;
      background: var(--vscode-editorWidget-background);
      border: 2px solid var(--vscode-panel-border);
      border-radius: 8px;
      cursor: move;
      user-select: none;
      transition: box-shadow 0.2s;
    }
    .node:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .node.selected {
      border-color: var(--vscode-button-background);
      box-shadow: 0 0 0 2px var(--vscode-button-background);
    }
    .node.dragging { opacity: 0.8; }
    .node-header {
      padding: 8px 12px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-radius: 6px 6px 0 0;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .node-type-icon {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: white;
    }
    .node-type-start .node-type-icon { background: #4caf50; }
    .node-type-end .node-type-icon { background: #f44336; }
    .node-type-code .node-type-icon { background: #2196f3; }
    .node-type-llm .node-type-icon { background: #9c27b0; }
    .node-type-switch .node-type-icon { background: #ff9800; }
    .node-type-parallel .node-type-icon { background: #00bcd4; }
    
    /* 节点执行状态 */
    .node-status-badge {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: white;
      z-index: 10;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .node-status-badge.running {
      display: flex;
      background: #2196f3;
      animation: pulse 1s infinite;
    }
    .node-status-badge.success {
      display: flex;
      background: #4caf50;
    }
    .node-status-badge.failed {
      display: flex;
      background: #f44336;
    }
    .node-status-badge.pending {
      display: flex;
      background: #9e9e9e;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }
    
    /* 节点状态边框 */
    .node.status-running {
      border-color: #2196f3 !important;
      box-shadow: 0 0 12px rgba(33, 150, 243, 0.5);
    }
    .node.status-success {
      border-color: #4caf50 !important;
    }
    .node.status-failed {
      border-color: #f44336 !important;
    }
    .node.status-pending {
      border-color: #9e9e9e !important;
    }
    
    .node-body {
      padding: 10px 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    /* 端口 */
    .port {
      position: absolute;
      width: 14px;
      height: 14px;
      background: var(--vscode-button-background);
      border: 2px solid var(--vscode-editorWidget-background);
      border-radius: 50%;
      cursor: crosshair;
      z-index: 5;
    }
    .port:hover {
      transform: scale(1.4);
      background: var(--vscode-button-hoverBackground);
    }
    .port-input { left: -7px; top: 50%; margin-top: -7px; }
    .port-output { right: -7px; top: 50%; margin-top: -7px; }
    
    /* 分支端口样式 */
    .port-branch {
      background: #ff9800;
    }
    .port-branch:hover {
      background: #f57c00;
    }
    
    /* 节点分支标签 */
    .node-branch-labels {
      position: absolute;
      right: -70px;
      top: 0;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    .node-branch-label {
      position: absolute;
      right: 0;
      padding: 2px 4px;
      background: var(--vscode-editorWidget-background);
      border-radius: 2px;
    }
    
    /* 边（连线） */
    #edges-svg {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    }
    #edges-svg path {
      fill: none;
      stroke: var(--vscode-editor-foreground);
      stroke-width: 2;
      opacity: 0.5;
      transition: stroke 0.3s, opacity 0.3s, stroke-width 0.3s;
    }
    #edges-svg path.active {
      stroke: #4caf50;
      stroke-width: 3;
      opacity: 1;
    }
    
    #temp-edge {
      stroke: var(--vscode-button-background);
      stroke-width: 2;
      stroke-dasharray: 5, 5;
      opacity: 0.8;
    }
    
    /* 顶部工具栏 */
    .top-bar {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }
    .top-bar button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .top-bar button:hover { background: var(--vscode-button-hoverBackground); }
    .zoom-display {
      padding: 6px 12px;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-foreground);
      border-radius: 4px;
      font-size: 12px;
      min-width: 60px;
      text-align: center;
    }
    
    /* 右侧属性面板 */
    .properties-panel {
      width: 300px;
      background: var(--vscode-sideBar-background);
      border-left: 1px solid var(--vscode-sideBar-border);
      padding: 15px;
      overflow-y: auto;
      z-index: 10;
    }
    .properties-panel h3 {
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .property-group { margin-bottom: 15px; }
    .property-group label {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .property-group input, .property-group textarea, .property-group select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 12px;
    }
    .property-group input:focus, .property-group textarea:focus, .property-group select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    .btn-danger {
      width: 100%;
      margin-top: 20px;
      padding: 8px;
      background: #d32f2f;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn-danger:hover { background: #b71c1c; }
    
    .config-section {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px dashed var(--vscode-sideBar-border);
    }
    .config-section h4 {
      margin-bottom: 10px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .hint {
      position: absolute;
      bottom: 10px;
      left: 10px;
      padding: 8px 12px;
      background: var(--vscode-editorWidget-background);
      border-radius: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      z-index: 100;
    }
    
    /* JSON 编辑器 */
    .json-editor-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .json-toolbar {
      display: flex;
      gap: 8px;
      padding: 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    
    .json-toolbar button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .json-toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    .json-toolbar button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    .json-error {
      padding: 8px 12px;
      background: #5a1d1d;
      color: #ff6b6b;
      font-size: 12px;
      display: none;
    }
    .json-error.visible { display: block; }
    
    #json-editor {
      flex: 1;
      width: 100%;
      padding: 10px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      border: none;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
      tab-size: 2;
    }
    
    .json-status {
      padding: 6px 10px;
      background: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      font-size: 11px;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- 视图切换标签 -->
    <div class="view-tabs">
      <div class="view-tab active" data-view="visual">
        <span class="icon">🎨</span>
        <span>可视化</span>
      </div>
      <div class="view-tab" data-view="json">
        <span class="icon">{ }</span>
        <span>JSON</span>
      </div>
      <div class="history-buttons">
        <button class="history-btn" id="btn-undo" title="撤销 (Ctrl+Z)">↶ 撤销</button>
        <button class="history-btn" id="btn-redo" title="重做 (Ctrl+Y)">↷ 重做</button>
      </div>
    </div>
    
    <!-- 可视化视图 -->
    <div class="main-content" id="visual-view">
      <div class="toolbar">
        <button class="toolbar-btn" data-type="start" title="开始节点"><span class="icon">▶</span><span>开始</span></button>
        <button class="toolbar-btn" data-type="end" title="结束节点"><span class="icon">⏹</span><span>结束</span></button>
        <button class="toolbar-btn" data-type="code" title="代码节点"><span class="icon">&lt;/&gt;</span><span>代码</span></button>
        <button class="toolbar-btn" data-type="llm" title="LLM 节点"><span class="icon">🤖</span><span>LLM</span></button>
        <button class="toolbar-btn" data-type="switch" title="条件分支"><span class="icon">⑂</span><span>分支</span></button>
        <button class="toolbar-btn" data-type="parallel" title="并行执行"><span class="icon">∥</span><span>并行</span></button>
      </div>
      
      <div class="canvas-container" id="canvas-container">
        <div class="top-bar">
          <div class="zoom-display" id="zoom-display">100%</div>
          <button id="btn-zoom-in" title="放大">+</button>
          <button id="btn-zoom-out" title="缩小">-</button>
          <button id="btn-fit" title="适应画布">⊡</button>
          <button id="btn-run">▶ 运行</button>
          <button id="btn-save">💾 保存</button>
        </div>
        
        <div id="canvas">
          <div class="canvas-bg"></div>
          <svg id="edges-svg"><path id="temp-edge" style="display: none;"/></svg>
          <div class="nodes-container" id="nodes-container"></div>
        </div>
        
        <div class="hint">中键拖动画布 | 滚轮缩放 | Delete 删除节点 | Ctrl+Z 撤销 | Ctrl+Y 重做</div>
      </div>
      
      <div class="properties-panel">
        <h3>属性</h3>
        <div id="properties-content">
          <p style="color: var(--vscode-descriptionForeground); font-size: 12px;">选择一个节点查看其属性</p>
        </div>
      </div>
    </div>
    
    <!-- JSON 编辑器视图 -->
    <div class="main-content hidden" id="json-view">
      <div class="json-editor-container">
        <div class="json-toolbar">
          <button id="btn-format" title="格式化">📐 格式化</button>
          <button id="btn-minify" title="压缩">压缩</button>
          <button id="btn-copy" title="复制">📋 复制</button>
          <button id="btn-apply-json" title="应用到可视化视图">✓ 应用</button>
          <button class="secondary" id="btn-reset-json" title="重置">↺ 重置</button>
        </div>
        <div class="json-error" id="json-error"></div>
        <textarea id="json-editor" spellcheck="false"></textarea>
        <div class="json-status">
          <span id="json-lines">0 行</span>
          <span id="json-size">0 字符</span>
        </div>
      </div>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    // ========== 历史记录管理 ==========
    class HistoryManager {
      constructor(maxSize = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
        this.isRecording = true;
      }
      
      // 保存状态：包含 workflow 和 nodeConfigs
      push(workflow, nodeConfigs, description = '') {
        if (!this.isRecording) return;
        
        // 深拷贝状态
        const snapshot = {
          workflow: JSON.parse(JSON.stringify(workflow)),
          nodeConfigs: JSON.parse(JSON.stringify(nodeConfigs))
        };
        this.undoStack.push({ state: snapshot, description, timestamp: Date.now() });
        
        // 限制大小
        if (this.undoStack.length > this.maxSize) {
          this.undoStack.shift();
        }
        
        // 清空重做栈
        this.redoStack = [];
        this.updateButtons();
      }
      
      undo() {
        if (this.undoStack.length <= 1) return null;
        
        // 当前状态保存到重做栈
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        
        // 返回上一个状态
        const previous = this.undoStack[this.undoStack.length - 1];
        this.updateButtons();
        return {
          workflow: JSON.parse(JSON.stringify(previous.state.workflow)),
          nodeConfigs: JSON.parse(JSON.stringify(previous.state.nodeConfigs))
        };
      }
      
      redo() {
        if (this.redoStack.length === 0) return null;
        
        const next = this.redoStack.pop();
        this.undoStack.push(next);
        this.updateButtons();
        return {
          workflow: JSON.parse(JSON.stringify(next.state.workflow)),
          nodeConfigs: JSON.parse(JSON.stringify(next.state.nodeConfigs))
        };
      }
      
      canUndo() { return this.undoStack.length > 1; }
      canRedo() { return this.redoStack.length > 0; }
      
      pause() { this.isRecording = false; }
      resume() { this.isRecording = true; }
      
      updateButtons() {
        document.getElementById('btn-undo').disabled = !this.canUndo();
        document.getElementById('btn-redo').disabled = !this.canRedo();
      }
      
      getCurrentState() {
        if (this.undoStack.length === 0) return null;
        const latest = this.undoStack[this.undoStack.length - 1];
        return {
          workflow: JSON.parse(JSON.stringify(latest.state.workflow)),
          nodeConfigs: JSON.parse(JSON.stringify(latest.state.nodeConfigs))
        };
      }
    }
    
    // ========== 全局状态 ==========
    let workflow = null;
    let nodeConfigs = {};
    let selectedNode = null;
    let currentView = 'visual';
    let history = new HistoryManager(50);
    let executionStatus = {}; // 节点执行状态
    let executedEdges = new Set(); // 已执行的边
    
    let scale = 1;
    let offset = { x: 0, y: 0 };
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.1;
    
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let isDraggingNode = false;
    let dragStart = { x: 0, y: 0 };
    let nodeStartPos = { x: 0, y: 0 };
    let connectingPort = null;
    
    // DOM 元素
    const visualView = document.getElementById('visual-view');
    const jsonView = document.getElementById('json-view');
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('canvas');
    const nodesContainer = document.getElementById('nodes-container');
    const edgesSvg = document.getElementById('edges-svg');
    const tempEdge = document.getElementById('temp-edge');
    const zoomDisplay = document.getElementById('zoom-display');
    const jsonEditor = document.getElementById('json-editor');
    const jsonError = document.getElementById('json-error');
    const jsonLines = document.getElementById('json-lines');
    const jsonSize = document.getElementById('json-size');
    
    // ========== 初始化 ==========
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          workflow = message.workflow;
          nodeConfigs = message.nodeConfigs || {};
          
          // 初始化历史记录
          history.push(workflow, nodeConfigs, '初始状态');
          
          render();
          fitToScreen();
          updateJsonEditor();
          history.updateButtons();
          break;
        case 'saved':
          console.log('Workflow saved');
          break;
        case 'nodeAdded':
          if (message.node) {
            workflow.nodes.push(message.node);
            if (message.config) {
              nodeConfigs[message.node.id] = message.config;
            }
            render();
            selectNode(workflow.nodes[workflow.nodes.length - 1]);
            updateJsonEditor();
            pushHistory('添加节点: ' + message.node.metadata.name);
          }
          break;
        case 'nodeRemoved':
          break;
        // 执行事件处理
        case 'executionStart':
          // 重置所有节点状态为 pending
          executionStatus = {};
          message.nodeIds.forEach(id => {
            executionStatus[id] = 'pending';
          });
          executedEdges = new Set();
          renderNodes();
          renderEdges();
          break;
        case 'nodeStatus':
          // 更新节点状态
          executionStatus[message.nodeId] = message.status;
          if (message.edgeId) {
            executedEdges.add(message.edgeId);
          }
          renderNodes();
          renderEdges();
          break;
        case 'executionEnd':
          // 执行结束
          if (message.status === 'failed') {
            // 标记所有 pending 节点为 failed
            Object.keys(executionStatus).forEach(id => {
              if (executionStatus[id] === 'pending' || executionStatus[id] === 'running') {
                executionStatus[id] = 'failed';
              }
            });
            renderNodes();
          }
          break;
      }
    });
    
    vscode.postMessage({ type: 'ready' });
    
    // ========== 历史记录操作 ==========
    function pushHistory(description) {
      history.push(workflow, nodeConfigs, description);
      updateJsonEditor();
    }
    
    function applyHistoryState(state) {
      workflow = state.workflow;
      nodeConfigs = state.nodeConfigs;
      render();
      updateJsonEditor();
      selectNode(null);
      
      // 同步配置文件到后端
      vscode.postMessage({ 
        type: 'syncNodeConfigs', 
        nodeConfigs: nodeConfigs 
      });
    }
    
    document.getElementById('btn-undo').addEventListener('click', () => {
      const state = history.undo();
      if (state) applyHistoryState(state);
    });
    
    document.getElementById('btn-redo').addEventListener('click', () => {
      const state = history.redo();
      if (state) applyHistoryState(state);
    });
    
    // ========== 视图切换 ==========
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    
    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
      
      if (view === 'visual') {
        visualView.classList.remove('hidden');
        jsonView.classList.add('hidden');
      } else {
        visualView.classList.add('hidden');
        jsonView.classList.remove('hidden');
        updateJsonEditor();
      }
    }
    
    // ========== JSON 编辑器 ==========
    function updateJsonEditor() {
      if (!workflow) return;
      jsonEditor.value = JSON.stringify(workflow, null, 2);
      updateJsonStatus();
    }
    
    function updateJsonStatus() {
      const text = jsonEditor.value;
      jsonLines.textContent = text.split('\\n').length + ' 行';
      jsonSize.textContent = text.length + ' 字符';
    }
    
    function showJsonError(msg) {
      jsonError.textContent = msg;
      jsonError.classList.add('visible');
    }
    
    function hideJsonError() {
      jsonError.classList.remove('visible');
    }
    
    function validateJson() {
      try {
        const parsed = JSON.parse(jsonEditor.value);
        hideJsonError();
        return parsed;
      } catch (e) {
        showJsonError('JSON 语法错误: ' + e.message);
        return null;
      }
    }
    
    jsonEditor.addEventListener('input', () => {
      updateJsonStatus();
      validateJson();
    });
    
    document.getElementById('btn-format').addEventListener('click', () => {
      const parsed = validateJson();
      if (parsed) {
        jsonEditor.value = JSON.stringify(parsed, null, 2);
        updateJsonStatus();
      }
    });
    
    document.getElementById('btn-minify').addEventListener('click', () => {
      const parsed = validateJson();
      if (parsed) {
        jsonEditor.value = JSON.stringify(parsed);
        updateJsonStatus();
      }
    });
    
    document.getElementById('btn-copy').addEventListener('click', async () => {
      await navigator.clipboard.writeText(jsonEditor.value);
    });
    
    document.getElementById('btn-apply-json').addEventListener('click', () => {
      const parsed = validateJson();
      if (parsed) {
        workflow = parsed;
        pushHistory('从 JSON 应用更改');
        render();
        fitToScreen();
        switchView('visual');
      }
    });
    
    document.getElementById('btn-reset-json').addEventListener('click', updateJsonEditor);
    
    // ========== 画布变换 ==========
    function updateTransform() {
      canvas.style.transform = \`translate(\${offset.x}px, \${offset.y}px) scale(\${scale})\`;
      zoomDisplay.textContent = Math.round(scale * 100) + '%';
    }
    
    function screenToCanvas(screenX, screenY) {
      const rect = canvasContainer.getBoundingClientRect();
      return {
        x: (screenX - rect.left - offset.x) / scale,
        y: (screenY - rect.top - offset.y) / scale
      };
    }
    
    function setScale(newScale, centerX, centerY) {
      const oldScale = scale;
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      if (centerX !== undefined && centerY !== undefined) {
        offset.x = centerX - (centerX - offset.x) * (scale / oldScale);
        offset.y = centerY - (centerY - offset.y) * (scale / oldScale);
      }
      updateTransform();
    }
    
    function fitToScreen() {
      if (!workflow || workflow.nodes.length === 0) return;
      const rect = canvasContainer.getBoundingClientRect();
      const padding = 50;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      workflow.nodes.forEach(node => {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + 150);
        maxY = Math.max(maxY, node.position.y + 80);
      });
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const availableWidth = rect.width - padding * 2;
      const availableHeight = rect.height - padding * 2;
      scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1);
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      offset.x = (availableWidth - contentWidth * scale) / 2 - minX * scale + padding;
      offset.y = (availableHeight - contentHeight * scale) / 2 - minY * scale + padding;
      updateTransform();
    }
    
    // ========== 鼠标事件 ==========
    canvasContainer.addEventListener('mousedown', e => {
      if (e.button === 1) {
        isPanning = true;
        panStart = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        canvasContainer.classList.add('panning', 'active');
        e.preventDefault();
      } else if (e.button === 0 && (e.target === canvas || e.target.classList.contains('canvas-bg'))) {
        selectNode(null);
      }
    });
    
    document.addEventListener('mousemove', e => {
      if (isPanning) {
        offset.x = e.clientX - panStart.x;
        offset.y = e.clientY - panStart.y;
        updateTransform();
      }
      
      if (isDraggingNode && selectedNode) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        selectedNode.position.x = nodeStartPos.x + (canvasPos.x - dragStart.x);
        selectedNode.position.y = nodeStartPos.y + (canvasPos.y - dragStart.y);
        renderNodes();
        renderEdges();
      }
      
      if (connectingPort) {
        const nodeEl = document.querySelector(\`.node[data-id="\${connectingPort.nodeId}"]\`);
        if (nodeEl) {
          const rect = nodeEl.getBoundingClientRect();
          const startX = (rect.right - canvasContainer.getBoundingClientRect().left - offset.x) / scale;
          const startY = (rect.top + rect.height / 2 - canvasContainer.getBoundingClientRect().top - offset.y) / scale;
          const canvasPos = screenToCanvas(e.clientX, e.clientY);
          tempEdge.setAttribute('d', \`M \${startX} \${startY} L \${canvasPos.x} \${canvasPos.y}\`);
          tempEdge.style.display = 'block';
        }
      }
    });
    
    document.addEventListener('mouseup', e => {
      if (isPanning) {
        isPanning = false;
        canvasContainer.classList.remove('active');
      }
      
      if (isDraggingNode) {
        isDraggingNode = false;
        if (selectedNode) {
          document.querySelector(\`.node[data-id="\${selectedNode.id}"]\`)?.classList.remove('dragging');
          // 记录位置变化到历史
          pushHistory('移动节点: ' + selectedNode.metadata.name);
        }
      }
      
      if (connectingPort) {
        tempEdge.style.display = 'none';
        
        const targetPort = e.target.closest('.port-input');
        if (targetPort) {
          const targetNodeEl = targetPort.closest('.node');
          const targetNodeId = targetNodeEl?.dataset.id;
          
          if (targetNodeId && targetNodeId !== connectingPort.nodeId) {
            // 检查是否已存在相同的边
            const exists = workflow.edges.some(e => 
              e.source.nodeId === connectingPort.nodeId && 
              e.target.nodeId === targetNodeId &&
              (e.branchId === connectingPort.branchId || (!e.branchId && !connectingPort.branchId))
            );
            
            if (!exists) {
              const edge: any = {
                id: 'edge_' + Date.now(),
                source: { nodeId: connectingPort.nodeId, portId: 'output' },
                target: { nodeId: targetNodeId, portId: 'input' }
              };
              
              // 如果是从分支端口拉出的线，添加 branchId
              if (connectingPort.branchId) {
                edge.branchId = connectingPort.branchId;
              }
              
              workflow.edges.push(edge);
              renderEdges();
              pushHistory('添加连线');
            }
          }
        }
        connectingPort = null;
      }
    });
    
    canvasContainer.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = canvasContainer.getBoundingClientRect();
      setScale(scale + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP), e.clientX - rect.left, e.clientY - rect.top);
    });
    
    // ========== 键盘事件 ==========
    document.addEventListener('keydown', e => {
      // 撤销 Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const state = history.undo();
        if (state) applyHistoryState(state);
      }
      // 重做 Ctrl+Y 或 Ctrl+Shift+Z
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        const state = history.redo();
        if (state) applyHistoryState(state);
      }
      // 删除节点
      if ((e.key === 'Delete' || e.key === 'Backspace') && 
          selectedNode && 
          document.activeElement.tagName !== 'INPUT' && 
          document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        deleteNode(selectedNode.id);
      }
    });
    
    // ========== 工具栏 ==========
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
      btn.addEventListener('click', () => addNode(btn.dataset.type));
    });
    
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      const rect = canvasContainer.getBoundingClientRect();
      setScale(scale + SCALE_STEP * 2, rect.width / 2, rect.height / 2);
    });
    
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      const rect = canvasContainer.getBoundingClientRect();
      setScale(scale - SCALE_STEP * 2, rect.width / 2, rect.height / 2);
    });
    
    document.getElementById('btn-fit').addEventListener('click', fitToScreen);
    
    document.getElementById('btn-save').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', workflow });
    });
    
    document.getElementById('btn-run').addEventListener('click', () => {
      vscode.postMessage({ type: 'run', workflow });
    });
    
    // ========== 节点操作 ==========
    function addNode(type) {
      const id = 'node_' + Date.now();
      const canvasCenter = screenToCanvas(
        canvasContainer.getBoundingClientRect().width / 2,
        canvasContainer.getBoundingClientRect().height / 2
      );
      
      const node = {
        id,
        type,
        position: { x: canvasCenter.x - 75, y: canvasCenter.y - 40 },
        metadata: { name: getNodeName(type), description: '' },
        data: {}
      };
      
      vscode.postMessage({ type: 'addNode', node });
    }
    
    function deleteNode(nodeId) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      const nodeName = node?.metadata?.name || nodeId;
      
      vscode.postMessage({ type: 'removeNode', nodeId });
      workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
      workflow.edges = workflow.edges.filter(e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId);
      delete nodeConfigs[nodeId];
      selectedNode = null;
      render();
      showEmptyProperties();
      updateJsonEditor();
      pushHistory('删除节点: ' + nodeName);
    }
    
    function getNodeName(type) {
      const names = {
        start: '开始', end: '结束', code: '代码执行', llm: 'LLM 调用',
        switch: '条件分支', parallel: '并行执行'
      };
      return names[type] || type;
    }
    
    function getNodeIcon(type) {
      const icons = {
        start: '▶', end: '⏹', code: '</>', llm: '🤖',
        switch: '⑂', parallel: '∥'
      };
      return icons[type] || '?';
    }
    
    // ========== 渲染 ==========
    function render() {
      renderNodes();
      renderEdges();
    }
    
    function renderNodes() {
      nodesContainer.innerHTML = workflow.nodes.map(node => {
        const status = executionStatus[node.id];
        const statusClass = status ? \`status-\${status}\` : '';
        const statusIcon = {
          'running': '⚙',
          'success': '✓',
          'failed': '✗',
          'pending': '○'
        }[status] || '';
        
        // 生成输出端口
        let outputPorts = '';
        if (node.type === 'switch' && node.detail?.branches) {
          // switch 节点显示多个分支端口
          const branches = node.detail.branches;
          const portHeight = 100; // 节点高度
          const step = portHeight / (branches.length + 1);
          outputPorts = branches.map((branch, i) => {
            const topOffset = 20 + step * (i + 1);
            return \`<div class="port port-output port-branch" data-port="output" data-branch-id="\${branch.id}" style="top: \${topOffset}px;" title="\${branch.name}: \${branch.condition}"></div>\`;
          }).join('');
        } else if (node.type === 'parallel' && node.detail?.parallelBranches) {
          // parallel 节点显示多个分支端口
          const branches = node.detail.parallelBranches;
          const portHeight = 100;
          const step = portHeight / (branches.length + 1);
          outputPorts = branches.map((branch, i) => {
            const topOffset = 20 + step * (i + 1);
            return \`<div class="port port-output port-branch" data-port="output" data-branch-id="\${branch.id}" style="top: \${topOffset}px;" title="\${branch.name}"></div>\`;
          }).join('');
        } else if (node.type !== 'end') {
          // 普通节点单一输出端口
          outputPorts = '<div class="port port-output" data-port="output"></div>';
        }
        
        return \`
        <div class="node node-type-\${node.type} \${selectedNode?.id === node.id ? 'selected' : ''} \${statusClass}" 
             data-id="\${node.id}" 
             style="left: \${node.position.x}px; top: \${node.position.y}px;">
          <div class="node-status-badge \${status || ''}">\${statusIcon}</div>
          <div class="node-header">
            <span class="node-type-icon">\${getNodeIcon(node.type)}</span>
            <span>\${node.metadata.name}</span>
          </div>
          <div class="node-body">\${node.metadata.description || '双击编辑'}</div>
          \${node.type !== 'start' ? '<div class="port port-input" data-port="input"></div>' : ''}
          \${outputPorts}
        </div>
      \`}).join('');
      attachNodeEvents();
    }
    
    function renderEdges() {
      const paths = workflow.edges.map(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
        const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
        if (!sourceNode || !targetNode) return '';
        
        // 计算源端口位置
        let x1 = sourceNode.position.x + 150;
        let y1 = sourceNode.position.y + 40;
        
        // 如果有 branchId，计算分支端口位置
        if (edge.branchId && (sourceNode.type === 'switch' || sourceNode.type === 'parallel')) {
          const branches = sourceNode.detail?.branches || sourceNode.detail?.parallelBranches || [];
          const branchIndex = branches.findIndex(b => b.id === edge.branchId);
          if (branchIndex >= 0) {
            const portHeight = 100;
            const step = portHeight / (branches.length + 1);
            y1 = sourceNode.position.y + 20 + step * (branchIndex + 1);
          }
        }
        
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y + 40;
        
        const isActive = executedEdges.has(edge.id) ? 'active' : '';
        return \`<path class="\${isActive}" data-edge-id="\${edge.id}" d="M \${x1} \${y1} C \${x1 + 50} \${y1}, \${x2 - 50} \${y2}, \${x2} \${y2}" stroke-linecap="round"/>\`;
      }).join('');
      edgesSvg.innerHTML = paths + '<path id="temp-edge" style="display: none;"/>';
    }
    
    function attachNodeEvents() {
      document.querySelectorAll('.node').forEach(el => {
        const nodeId = el.dataset.id;
        
        el.addEventListener('mousedown', e => {
          if (e.target.classList.contains('port') || e.button !== 0) return;
          const node = workflow.nodes.find(n => n.id === nodeId);
          selectNode(node);
          isDraggingNode = true;
          const canvasPos = screenToCanvas(e.clientX, e.clientY);
          dragStart = canvasPos;
          nodeStartPos = { ...node.position };
          el.classList.add('dragging');
          e.stopPropagation();
        });
      });
      
      document.querySelectorAll('.port-output').forEach(port => {
        port.addEventListener('mousedown', e => {
          const nodeEl = port.closest('.node');
          const branchId = port.dataset.branchId || null;
          connectingPort = { 
            nodeId: nodeEl.dataset.id, 
            portType: 'output',
            branchId: branchId
          };
          e.stopPropagation();
          e.preventDefault();
        });
      });
    }
    
    // ========== 选择与属性 ==========
    function selectNode(node) {
      document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
      selectedNode = node;
      if (node) {
        document.querySelector(\`.node[data-id="\${node.id}"]\`)?.classList.add('selected');
        showProperties(node);
      } else {
        showEmptyProperties();
      }
    }
    
    function showProperties(node) {
      const config = nodeConfigs[node.id] || {};
      const panel = document.getElementById('properties-content');
      
      let configHtml = '';
      switch (node.type) {
        case 'start':
          configHtml = \`
            <div class="config-section">
              <h4>触发配置</h4>
              <div class="property-group">
                <label>触发方式</label>
                <select id="config-triggerType">
                  <option value="manual" \${config.triggerType === 'manual' ? 'selected' : ''}>手动触发</option>
                  <option value="api" \${config.triggerType === 'api' ? 'selected' : ''}>API 调用</option>
                </select>
              </div>
            </div>
          \`;
          break;
        case 'code':
          configHtml = \`
            <div class="config-section">
              <h4>代码配置</h4>
              <div class="property-group">
                <label>语言</label>
                <select id="config-language">
                  <option value="javascript" \${config.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
                  <option value="typescript" \${config.language === 'typescript' ? 'selected' : ''}>TypeScript</option>
                  <option value="python" \${config.language === 'python' ? 'selected' : ''}>Python</option>
                </select>
              </div>
            </div>
          \`;
          break;
        case 'llm':
          configHtml = \`
            <div class="config-section">
              <h4>LLM 配置</h4>
              <div class="property-group">
                <label>模型</label>
                <input type="text" id="config-model" value="\${config.model?.model || 'gpt-4'}">
              </div>
              <div class="property-group">
                <label>Temperature</label>
                <input type="number" id="config-temperature" value="\${config.temperature || 0.7}" step="0.1" min="0" max="2">
              </div>
            </div>
          \`;
          break;
      }
      
      panel.innerHTML = \`
        <div class="property-group">
          <label>ID</label>
          <input type="text" value="\${node.id}" disabled>
        </div>
        <div class="property-group">
          <label>名称</label>
          <input type="text" id="prop-name" value="\${node.metadata.name}">
        </div>
        <div class="property-group">
          <label>描述</label>
          <textarea id="prop-desc" rows="2">\${node.metadata.description || ''}</textarea>
        </div>
        <div class="property-group">
          <label>位置</label>
          <div style="display: flex; gap: 10px;">
            <input type="number" id="prop-x" value="\${Math.round(node.position.x)}" style="width: 50%">
            <input type="number" id="prop-y" value="\${Math.round(node.position.y)}" style="width: 50%">
          </div>
        </div>
        \${configHtml}
        <button class="btn-danger" id="btn-delete-node">🗑️ 删除节点</button>
      \`;
      
      // 属性修改事件 - 实时更新 JSON
      document.getElementById('prop-name').addEventListener('input', e => {
        node.metadata.name = e.target.value;
        renderNodes();
        updateJsonEditor();
      });
      
      document.getElementById('prop-name').addEventListener('change', e => {
        pushHistory('修改节点名称');
      });
      
      document.getElementById('prop-desc').addEventListener('input', e => {
        node.metadata.description = e.target.value;
        renderNodes();
        updateJsonEditor();
      });
      
      document.getElementById('prop-desc').addEventListener('change', e => {
        pushHistory('修改节点描述');
      });
      
      document.getElementById('prop-x').addEventListener('change', e => {
        node.position.x = parseInt(e.target.value) || 0;
        render();
        updateJsonEditor();
        pushHistory('修改节点位置');
      });
      
      document.getElementById('prop-y').addEventListener('change', e => {
        node.position.y = parseInt(e.target.value) || 0;
        render();
        updateJsonEditor();
        pushHistory('修改节点位置');
      });
      
      document.getElementById('btn-delete-node').addEventListener('click', () => deleteNode(node.id));
    }
    
    function showEmptyProperties() {
      document.getElementById('properties-content').innerHTML = 
        '<p style="color: var(--vscode-descriptionForeground); font-size: 12px;">选择一个节点查看其属性</p>';
    }
  </script>
</body>
</html>`;
  }
}

/**
 * 查找指向目标节点的边 ID
 */
function findEdgeEndingAt(workflow: Workflow, targetNodeId: string): string | undefined {
  const edge = workflow.edges.find(e => e.target.nodeId === targetNodeId);
  return edge?.id;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export default WorkflowEditorProvider;