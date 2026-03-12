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
      return {
        triggerType: 'manual'
      };
    case 'end':
      return {
        outputMode: 'last'
      };
    case 'code':
      return {
        language: 'javascript',
        code: `// 在此编写代码
// input: 输入数据
// 返回值将作为输出

module.exports = async function(input) {
  console.log('Input:', input);
  return { result: input };
};`,
        timeout: 30000
      };
    case 'llm':
      return {
        model: {
          provider: 'openai',
          model: 'gpt-4'
        },
        systemPrompt: '你是一个有帮助的助手。',
        userPrompt: '{{input}}',
        temperature: 0.7,
        maxTokens: 2000
      };
    case 'switch':
      return {
        branches: [
          { id: 'branch_1', name: '分支 1', condition: 'data.value > 0' }
        ],
        defaultBranch: 'default',
        evaluationMode: 'first-match'
      };
    case 'parallel':
      return {
        branches: [
          { id: 'parallel_1', name: '并行分支 1' }
        ],
        waitMode: 'all',
        failMode: 'stop'
      };
    case 'http':
      return {
        url: 'https://api.example.com/endpoint',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };
    case 'transform':
      return {
        mapping: {
          'output': 'input'
        }
      };
    case 'delay':
      return {
        duration: 1,
        unit: 'seconds'
      };
    default:
      return {} as NodeConfig;
  }
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
    
    // 使用 WorkflowLoader 加载工作流和配置
    const result = await WorkflowLoader.loadFromDirectory(workflowDir);
    
    if (result.success && result.workflow) {
      return new WorkflowDocument(uri, result.workflow, result.nodeConfigs);
    }
    
    // 如果加载失败，尝试直接读取文件
    const content = await vscode.workspace.fs.readFile(uri);
    const workflow: Workflow = JSON.parse(Buffer.from(content).toString('utf-8'));
    return new WorkflowDocument(uri, workflow, new Map());
  }

  async resolveCustomEditor(
    document: WorkflowDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, document.workflow);

    // 处理来自 webview 的消息
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
          await this.saveDocument(document);
          webviewPanel.webview.postMessage({ type: 'saved' });
          break;

        case 'addNode':
          this.handleAddNode(document, message.node, webviewPanel.webview);
          break;

        case 'removeNode':
          this.handleRemoveNode(document, message.nodeId, webviewPanel.webview);
          break;

        case 'updateNode':
          this.handleUpdateNode(document, message.node, webviewPanel.webview);
          break;

        case 'updateNodeConfig':
          this.handleUpdateNodeConfig(document, message.nodeId, message.config);
          break;

        case 'addEdge':
          this.handleAddEdge(document, message.edge, webviewPanel.webview);
          break;

        case 'removeEdge':
          this.handleRemoveEdge(document, message.edgeId, webviewPanel.webview);
          break;

        case 'updateEdge':
          this.handleUpdateEdge(document, message.edge, webviewPanel.webview);
          break;

        case 'updatePosition':
          this.handleUpdatePosition(document, message.nodeId, message.position);
          break;
      }
    });
  }

  private async saveDocument(document: WorkflowDocument): Promise<void> {
    // 使用 WorkflowLoader 保存工作流和配置文件
    const result = await WorkflowLoader.saveToDirectory(
      document.workflowDir,
      document.workflow,
      document.nodeConfigs
    );
    
    if (!result.success) {
      vscode.window.showErrorMessage(`保存失败: ${result.error}`);
    }
  }

  private handleAddNode(document: WorkflowDocument, node: WorkflowNode, webview: vscode.Webview): void {
    // 生成默认配置
    const config = createDefaultNodeConfig(node.type as NodeType);
    document.nodeConfigs.set(node.id, config);
    
    // 设置 configRef
    const ext = getConfigExtension(node.type as NodeType, config);
    if (ext === '.json') {
      node.configRef = `nodes/${node.id}_${node.type}.json`;
    } else {
      node.configRef = `nodes/${node.id}_${node.type}${ext}`;
    }
    
    document.workflow.nodes.push(node);
    webview.postMessage({ type: 'nodeAdded', node, config });
  }

  private handleRemoveNode(document: WorkflowDocument, nodeId: string, webview: vscode.Webview): void {
    document.workflow.nodes = document.workflow.nodes.filter(n => n.id !== nodeId);
    document.workflow.edges = document.workflow.edges.filter(
      e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
    );
    // 删除对应的配置
    document.nodeConfigs.delete(nodeId);
    webview.postMessage({ type: 'nodeRemoved', nodeId });
  }

  private handleUpdateNode(document: WorkflowDocument, node: WorkflowNode, webview: vscode.Webview): void {
    const index = document.workflow.nodes.findIndex(n => n.id === node.id);
    if (index >= 0) {
      document.workflow.nodes[index] = node;
      webview.postMessage({ type: 'nodeUpdated', node });
    }
  }

  private handleUpdateNodeConfig(document: WorkflowDocument, nodeId: string, config: NodeConfig): void {
    document.nodeConfigs.set(nodeId, config);
  }

  private handleAddEdge(document: WorkflowDocument, edge: WorkflowEdge, webview: vscode.Webview): void {
    document.workflow.edges.push(edge);
    webview.postMessage({ type: 'edgeAdded', edge });
  }

  private handleRemoveEdge(document: WorkflowDocument, edgeId: string, webview: vscode.Webview): void {
    document.workflow.edges = document.workflow.edges.filter(e => e.id !== edgeId);
    webview.postMessage({ type: 'edgeRemoved', edgeId });
  }

  private handleUpdateEdge(document: WorkflowDocument, edge: WorkflowEdge, webview: vscode.Webview): void {
    const index = document.workflow.edges.findIndex(e => e.id === edge.id);
    if (index >= 0) {
      document.workflow.edges[index] = edge;
      webview.postMessage({ type: 'edgeUpdated', edge });
    }
  }

  private handleUpdatePosition(document: WorkflowDocument, nodeId: string, position: { x: number; y: number }): void {
    const node = document.workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      node.position = position;
    }
  }

  saveCustomDocument(document: WorkflowDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return this.saveDocument(document);
  }

  saveCustomDocumentAs(
    document: WorkflowDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Thenable<void> {
    const content = JSON.stringify(document.workflow, null, 2);
    return vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
  }

  revertCustomDocument(document: WorkflowDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return vscode.workspace.fs.readFile(document.uri).then(content => {
      document.workflow = JSON.parse(Buffer.from(content).toString('utf-8'));
    });
  }

  backupCustomDocument(
    document: WorkflowDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Thenable<vscode.CustomDocumentBackup> {
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
    #app { height: 100%; display: flex; }
    
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
    .toolbar-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
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
    .node-type-http .node-type-icon { background: #607d8b; }
    .node-type-transform .node-type-icon { background: #795548; }
    
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
    }
    #edges-svg path:hover {
      stroke: var(--vscode-button-background);
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
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .top-bar button:hover {
      background: var(--vscode-button-hoverBackground);
    }
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
    .property-group {
      margin-bottom: 15px;
    }
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
    
    /* 提示信息 */
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
  </style>
</head>
<body>
  <div id="app">
    <div class="toolbar">
      <button class="toolbar-btn" data-type="start" title="开始节点">
        <span class="icon">▶</span>
        <span>开始</span>
      </button>
      <button class="toolbar-btn" data-type="end" title="结束节点">
        <span class="icon">⏹</span>
        <span>结束</span>
      </button>
      <button class="toolbar-btn" data-type="code" title="代码节点">
        <span class="icon">&lt;/&gt;</span>
        <span>代码</span>
      </button>
      <button class="toolbar-btn" data-type="llm" title="LLM 节点">
        <span class="icon">🤖</span>
        <span>LLM</span>
      </button>
      <button class="toolbar-btn" data-type="switch" title="条件分支">
        <span class="icon">⑂</span>
        <span>分支</span>
      </button>
      <button class="toolbar-btn" data-type="parallel" title="并行执行">
        <span class="icon">∥</span>
        <span>并行</span>
      </button>
      <button class="toolbar-btn" data-type="http" title="HTTP 请求">
        <span class="icon">🌐</span>
        <span>HTTP</span>
      </button>
      <button class="toolbar-btn" data-type="transform" title="数据转换">
        <span class="icon">⟲</span>
        <span>转换</span>
      </button>
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
        <svg id="edges-svg">
          <path id="temp-edge" style="display: none;"/>
        </svg>
        <div class="nodes-container" id="nodes-container"></div>
      </div>
      
      <div class="hint">
        中键拖动画布 | 滚轮缩放 | Delete 删除节点
      </div>
    </div>
    
    <div class="properties-panel">
      <h3>属性</h3>
      <div id="properties-content">
        <p style="color: var(--vscode-descriptionForeground); font-size: 12px;">
          选择一个节点查看其属性
        </p>
      </div>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    // 状态
    let workflow = null;
    let nodeConfigs = {};
    let selectedNode = null;
    let scale = 1;
    let offset = { x: 0, y: 0 };
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.1;
    
    // 拖拽状态
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let isDraggingNode = false;
    let dragStart = { x: 0, y: 0 };
    let nodeStartPos = { x: 0, y: 0 };
    let connectingPort = null;
    
    // DOM 元素
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('canvas');
    const nodesContainer = document.getElementById('nodes-container');
    const edgesSvg = document.getElementById('edges-svg');
    const tempEdge = document.getElementById('temp-edge');
    const zoomDisplay = document.getElementById('zoom-display');
    
    // 初始化
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          workflow = message.workflow;
          nodeConfigs = message.nodeConfigs || {};
          render();
          fitToScreen();
          break;
        case 'saved':
          console.log('Workflow saved');
          break;
        case 'nodeAdded':
          // 更新本地配置
          if (message.config) {
            nodeConfigs[message.node.id] = message.config;
          }
          break;
      }
    });
    
    vscode.postMessage({ type: 'ready' });
    
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
        }
      }
      
      if (connectingPort) {
        tempEdge.style.display = 'none';
        
        const targetPort = e.target.closest('.port-input');
        if (targetPort) {
          const targetNodeEl = targetPort.closest('.node');
          const targetNodeId = targetNodeEl?.dataset.id;
          
          if (targetNodeId && targetNodeId !== connectingPort.nodeId) {
            const exists = workflow.edges.some(e => 
              e.source.nodeId === connectingPort.nodeId && e.target.nodeId === targetNodeId
            );
            
            if (!exists) {
              const edge = {
                id: 'edge_' + Date.now(),
                source: { nodeId: connectingPort.nodeId, portId: 'output' },
                target: { nodeId: targetNodeId, portId: 'input' }
              };
              workflow.edges.push(edge);
              renderEdges();
            }
          }
        }
        
        connectingPort = null;
      }
    });
    
    canvasContainer.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = canvasContainer.getBoundingClientRect();
      const centerX = e.clientX - rect.left;
      const centerY = e.clientY - rect.top;
      
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setScale(scale + delta, centerX, centerY);
    });
    
    // ========== 键盘事件 ==========
    
    document.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          deleteNode(selectedNode.id);
        }
      }
    });
    
    // ========== 工具栏 ==========
    
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        addNode(type);
      });
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
        position: { 
          x: canvasCenter.x - 75 + Math.random() * 50, 
          y: canvasCenter.y - 40 + Math.random() * 50 
        },
        metadata: {
          name: getNodeName(type),
          description: ''
        },
        data: {}
      };
      
      vscode.postMessage({ type: 'addNode', node });
      workflow.nodes.push(node);
      render();
      selectNode(node);
    }
    
    function deleteNode(nodeId) {
      vscode.postMessage({ type: 'removeNode', nodeId });
      workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
      workflow.edges = workflow.edges.filter(e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId);
      delete nodeConfigs[nodeId];
      selectedNode = null;
      render();
      showEmptyProperties();
    }
    
    function getNodeName(type) {
      const names = {
        start: '开始',
        end: '结束',
        code: '代码执行',
        llm: 'LLM 调用',
        switch: '条件分支',
        parallel: '并行执行',
        http: 'HTTP 请求',
        transform: '数据转换'
      };
      return names[type] || type;
    }
    
    function getNodeIcon(type) {
      const icons = {
        start: '▶', end: '⏹', code: '</>', llm: '🤖',
        switch: '⑂', parallel: '∥', http: '🌐', transform: '⟲'
      };
      return icons[type] || '?';
    }
    
    // ========== 渲染 ==========
    
    function render() {
      renderNodes();
      renderEdges();
    }
    
    function renderNodes() {
      nodesContainer.innerHTML = workflow.nodes.map(node => \`
        <div class="node node-type-\${node.type} \${selectedNode?.id === node.id ? 'selected' : ''}" 
             data-id="\${node.id}" 
             style="left: \${node.position.x}px; top: \${node.position.y}px;">
          <div class="node-header">
            <span class="node-type-icon">\${getNodeIcon(node.type)}</span>
            <span>\${node.metadata.name}</span>
          </div>
          <div class="node-body">
            \${node.metadata.description || '双击编辑'}
          </div>
          \${node.type !== 'start' ? '<div class="port port-input" data-port="input"></div>' : ''}
          \${node.type !== 'end' ? '<div class="port port-output" data-port="output"></div>' : ''}
        </div>
      \`).join('');
      
      attachNodeEvents();
    }
    
    function renderEdges() {
      const paths = workflow.edges.map(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
        const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
        if (!sourceNode || !targetNode) return '';
        
        const x1 = sourceNode.position.x + 150;
        const y1 = sourceNode.position.y + 40;
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y + 40;
        
        const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
        const cx2 = x2 - Math.abs(x2 - x1) * 0.4;
        
        return \`<path d="M \${x1} \${y1} C \${cx1} \${y1}, \${cx2} \${y2}, \${x2} \${y2}" stroke-linecap="round"/>\`;
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
        
        el.addEventListener('dblclick', e => {
          if (e.target.classList.contains('port')) return;
          vscode.postMessage({ type: 'editNode', nodeId });
        });
      });
      
      document.querySelectorAll('.port-output').forEach(port => {
        port.addEventListener('mousedown', e => {
          const nodeEl = port.closest('.node');
          const nodeId = nodeEl.dataset.id;
          connectingPort = { nodeId, portType: 'output' };
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
      
      // 根据节点类型显示不同的配置项
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
                  <option value="schedule" \${config.triggerType === 'schedule' ? 'selected' : ''}>定时触发</option>
                  <option value="webhook" \${config.triggerType === 'webhook' ? 'selected' : ''}>Webhook</option>
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
              <div class="property-group">
                <label>超时 (ms)</label>
                <input type="number" id="config-timeout" value="\${config.timeout || 30000}">
              </div>
            </div>
          \`;
          break;
          
        case 'llm':
          configHtml = \`
            <div class="config-section">
              <h4>LLM 配置</h4>
              <div class="property-group">
                <label>Provider</label>
                <select id="config-provider">
                  <option value="openai" \${config.model?.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                  <option value="anthropic" \${config.model?.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                  <option value="azure" \${config.model?.provider === 'azure' ? 'selected' : ''}>Azure</option>
                </select>
              </div>
              <div class="property-group">
                <label>模型</label>
                <input type="text" id="config-model" value="\${config.model?.model || 'gpt-4'}">
              </div>
              <div class="property-group">
                <label>Temperature</label>
                <input type="number" id="config-temperature" value="\${config.temperature || 0.7}" step="0.1" min="0" max="2">
              </div>
              <div class="property-group">
                <label>系统提示词</label>
                <textarea id="config-systemPrompt" rows="3">\${config.systemPrompt || ''}</textarea>
              </div>
            </div>
          \`;
          break;
          
        case 'http':
          configHtml = \`
            <div class="config-section">
              <h4>HTTP 配置</h4>
              <div class="property-group">
                <label>URL</label>
                <input type="text" id="config-url" value="\${config.url || ''}">
              </div>
              <div class="property-group">
                <label>方法</label>
                <select id="config-method">
                  <option value="GET" \${config.method === 'GET' ? 'selected' : ''}>GET</option>
                  <option value="POST" \${config.method === 'POST' ? 'selected' : ''}>POST</option>
                  <option value="PUT" \${config.method === 'PUT' ? 'selected' : ''}>PUT</option>
                  <option value="DELETE" \${config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                </select>
              </div>
              <div class="property-group">
                <label>超时 (ms)</label>
                <input type="number" id="config-timeout" value="\${config.timeout || 30000}">
              </div>
            </div>
          \`;
          break;
          
        case 'switch':
          configHtml = \`
            <div class="config-section">
              <h4>分支配置</h4>
              <div class="property-group">
                <label>评估模式</label>
                <select id="config-evaluationMode">
                  <option value="first-match" \${config.evaluationMode === 'first-match' ? 'selected' : ''}>首个匹配</option>
                  <option value="all-match" \${config.evaluationMode === 'all-match' ? 'selected' : ''}>全部匹配</option>
                </select>
              </div>
              <div class="property-group">
                <label>分支数量</label>
                <input type="number" value="\${(config.branches || []).length}" disabled>
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
          <label>类型</label>
          <input type="text" value="\${node.type}" disabled>
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
      
      // 基本属性事件
      document.getElementById('prop-name').addEventListener('change', e => {
        node.metadata.name = e.target.value;
        renderNodes();
      });
      
      document.getElementById('prop-desc').addEventListener('change', e => {
        node.metadata.description = e.target.value;
        renderNodes();
      });
      
      document.getElementById('prop-x').addEventListener('change', e => {
        node.position.x = parseInt(e.target.value) || 0;
        render();
      });
      
      document.getElementById('prop-y').addEventListener('change', e => {
        node.position.y = parseInt(e.target.value) || 0;
        render();
      });
      
      // 配置更新事件
      const configInputs = panel.querySelectorAll('[id^="config-"]');
      configInputs.forEach(input => {
        input.addEventListener('change', () => {
          updateNodeConfig(node.id);
        });
      });
      
      document.getElementById('btn-delete-node').addEventListener('click', () => {
        deleteNode(node.id);
      });
    }
    
    function updateNodeConfig(nodeId) {
      const config = nodeConfigs[nodeId] || {};
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) return;
      
      // 根据类型读取配置
      switch (node.type) {
        case 'start':
          config.triggerType = document.getElementById('config-triggerType')?.value || 'manual';
          break;
          
        case 'code':
          config.language = document.getElementById('config-language')?.value || 'javascript';
          config.timeout = parseInt(document.getElementById('config-timeout')?.value) || 30000;
          break;
          
        case 'llm':
          config.model = config.model || {};
          config.model.provider = document.getElementById('config-provider')?.value || 'openai';
          config.model.model = document.getElementById('config-model')?.value || 'gpt-4';
          config.temperature = parseFloat(document.getElementById('config-temperature')?.value) || 0.7;
          config.systemPrompt = document.getElementById('config-systemPrompt')?.value || '';
          break;
          
        case 'http':
          config.url = document.getElementById('config-url')?.value || '';
          config.method = document.getElementById('config-method')?.value || 'GET';
          config.timeout = parseInt(document.getElementById('config-timeout')?.value) || 30000;
          break;
          
        case 'switch':
          config.evaluationMode = document.getElementById('config-evaluationMode')?.value || 'first-match';
          break;
      }
      
      nodeConfigs[nodeId] = config;
      vscode.postMessage({ type: 'updateNodeConfig', nodeId, config });
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

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export default WorkflowEditorProvider;