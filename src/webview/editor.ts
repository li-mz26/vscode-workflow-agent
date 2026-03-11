/**
 * 工作流编辑器 - 自定义编辑器实现
 */

import * as vscode from 'vscode';
import { Workflow, WorkflowNode, WorkflowEdge, NodeType } from '../engine/types';
import { WorkflowLoader } from '../engine/loader';

export class WorkflowEditorProvider implements vscode.CustomEditorProvider<WorkflowDocument> {
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<WorkflowDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<WorkflowDocument> {
    const content = await vscode.workspace.fs.readFile(uri);
    const workflow: Workflow = JSON.parse(Buffer.from(content).toString('utf-8'));
    return new WorkflowDocument(uri, workflow);
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
            workflow: document.workflow
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
    const content = JSON.stringify(document.workflow, null, 2);
    await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
  }

  private handleAddNode(document: WorkflowDocument, node: WorkflowNode, webview: vscode.Webview): void {
    document.workflow.nodes.push(node);
    webview.postMessage({ type: 'nodeAdded', node });
  }

  private handleRemoveNode(document: WorkflowDocument, nodeId: string, webview: vscode.Webview): void {
    document.workflow.nodes = document.workflow.nodes.filter(n => n.id !== nodeId);
    document.workflow.edges = document.workflow.edges.filter(
      e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
    );
    webview.postMessage({ type: 'nodeRemoved', nodeId });
  }

  private handleUpdateNode(document: WorkflowDocument, node: WorkflowNode, webview: vscode.Webview): void {
    const index = document.workflow.nodes.findIndex(n => n.id === node.id);
    if (index >= 0) {
      document.workflow.nodes[index] = node;
      webview.postMessage({ type: 'nodeUpdated', node });
    }
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
    }
    #canvas {
      width: 100%;
      height: 100%;
      position: relative;
      background-image: 
        linear-gradient(var(--vscode-editorRuler-foreground) 1px, transparent 1px),
        linear-gradient(90deg, var(--vscode-editorRuler-foreground) 1px, transparent 1px);
      background-size: 20px 20px;
      background-position: -1px -1px;
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
    }
    .node:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .node.selected {
      border-color: var(--vscode-button-background);
    }
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
    }
    .node-type-start .node-type-icon { background: #4caf50; }
    .node-type-end .node-type-icon { background: #f44336; }
    .node-type-code .node-type-icon { background: #2196f3; }
    .node-type-llm .node-type-icon { background: #9c27b0; }
    .node-type-switch .node-type-icon { background: #ff9800; }
    .node-type-parallel .node-type-icon { background: #00bcd4; }
    
    .node-body {
      padding: 10px 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    /* 端口 */
    .port {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--vscode-button-background);
      border-radius: 50%;
      cursor: crosshair;
    }
    .port:hover {
      transform: scale(1.3);
    }
    .port-input { left: -6px; top: 50%; transform: translateY(-50%); }
    .port-output { right: -6px; top: 50%; transform: translateY(-50%); }
    
    /* 边（连线） */
    .edge {
      position: absolute;
      pointer-events: none;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .edge path {
      fill: none;
      stroke: var(--vscode-editor-foreground);
      stroke-width: 2;
      opacity: 0.6;
    }
    .edge.selected path {
      stroke: var(--vscode-button-background);
      stroke-width: 3;
    }
    
    /* 顶部工具栏 */
    .top-bar {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 10px;
      z-index: 100;
    }
    .top-bar button {
      padding: 6px 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .top-bar button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    /* 右侧属性面板 */
    .properties-panel {
      width: 280px;
      background: var(--vscode-sideBar-background);
      border-left: 1px solid var(--vscode-sideBar-border);
      padding: 15px;
      overflow-y: auto;
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
    
    <div class="canvas-container">
      <div class="top-bar">
        <button id="btn-run">▶ 运行</button>
        <button id="btn-save">💾 保存</button>
        <button id="btn-zoom-in">+</button>
        <button id="btn-zoom-out">-</button>
        <button id="btn-fit">适应</button>
      </div>
      <div id="canvas">
        <svg class="edge" id="edges-svg"></svg>
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
    let workflow = null;
    let selectedNode = null;
    let selectedEdge = null;
    let scale = 1;
    let offset = { x: 0, y: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let connectingPort = null;
    
    // 初始化
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          workflow = message.workflow;
          render();
          break;
        case 'saved':
          console.log('Workflow saved');
          break;
      }
    });
    
    // 通知 VSCode 准备好了
    vscode.postMessage({ type: 'ready' });
    
    // 工具栏按钮
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        addNode(type);
      });
    });
    
    // 添加节点
    function addNode(type) {
      const id = 'node_' + Date.now();
      const node = {
        id,
        type,
        position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 100 },
        metadata: {
          name: getNodeName(type),
          description: ''
        },
        data: {}
      };
      workflow.nodes.push(node);
      render();
      selectNode(node);
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
    
    // 渲染
    function render() {
      const canvas = document.getElementById('canvas');
      const nodesHtml = workflow.nodes.map(node => renderNode(node)).join('');
      canvas.innerHTML = '<svg class="edge" id="edges-svg"></svg>' + nodesHtml;
      
      renderEdges();
      attachNodeEvents();
    }
    
    function renderNode(node) {
      return \`
        <div class="node node-type-\${node.type}" data-id="\${node.id}" style="left: \${node.position.x}px; top: \${node.position.y}px;">
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
      \`;
    }
    
    function getNodeIcon(type) {
      const icons = {
        start: '▶',
        end: '⏹',
        code: '</>',
        llm: '🤖',
        switch: '⑂',
        parallel: '∥',
        http: '🌐',
        transform: '⟲'
      };
      return icons[type] || '?';
    }
    
    function renderEdges() {
      const svg = document.getElementById('edges-svg');
      const paths = workflow.edges.map(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
        const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
        if (!sourceNode || !targetNode) return '';
        
        const x1 = sourceNode.position.x + 150;
        const y1 = sourceNode.position.y + 40;
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y + 40;
        
        const cx1 = x1 + 50;
        const cx2 = x2 - 50;
        
        return \`<path d="M \${x1} \${y1} C \${cx1} \${y1}, \${cx2} \${y2}, \${x2} \${y2}" stroke-linecap="round"/>\`;
      }).join('');
      
      svg.innerHTML = paths;
    }
    
    // 节点事件
    function attachNodeEvents() {
      document.querySelectorAll('.node').forEach(el => {
        const nodeId = el.dataset.id;
        
        el.addEventListener('mousedown', e => {
          if (e.target.classList.contains('port')) return;
          selectNode(workflow.nodes.find(n => n.id === nodeId));
          isDragging = true;
          dragStart = { x: e.clientX, y: e.clientY };
          e.preventDefault();
        });
        
        el.addEventListener('dblclick', () => {
          editNode(nodeId);
        });
      });
      
      // 端口事件
      document.querySelectorAll('.port').forEach(port => {
        port.addEventListener('mousedown', e => {
          const nodeEl = port.closest('.node');
          const nodeId = nodeEl.dataset.id;
          const portType = port.dataset.port;
          connectingPort = { nodeId, portType, el: port };
          e.stopPropagation();
        });
      });
    }
    
    // 画布拖拽
    document.addEventListener('mousemove', e => {
      if (isDragging && selectedNode) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        selectedNode.position.x += dx;
        selectedNode.position.y += dy;
        dragStart = { x: e.clientX, y: e.clientY };
        render();
        selectNode(selectedNode);
      }
    });
    
    document.addEventListener('mouseup', e => {
      if (connectingPort && e.target.classList.contains('port')) {
        const targetNodeEl = e.target.closest('.node');
        const targetNodeId = targetNodeEl.dataset.id;
        const targetPort = e.target.dataset.port;
        
        if (connectingPort.portType === 'output' && targetPort === 'input') {
          const edge = {
            id: 'edge_' + Date.now(),
            source: { nodeId: connectingPort.nodeId, portId: 'output' },
            target: { nodeId: targetNodeId, portId: 'input' }
          };
          workflow.edges.push(edge);
          render();
        }
      }
      
      isDragging = false;
      connectingPort = null;
    });
    
    // 选择节点
    function selectNode(node) {
      document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
      selectedNode = node;
      if (node) {
        document.querySelector(\`.node[data-id="\${node.id}"]\`)?.classList.add('selected');
        showProperties(node);
      }
    }
    
    // 显示属性
    function showProperties(node) {
      const panel = document.getElementById('properties-content');
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
          <textarea id="prop-desc" rows="3">\${node.metadata.description || ''}</textarea>
        </div>
        <div class="property-group">
          <label>位置</label>
          <div style="display: flex; gap: 10px;">
            <input type="number" id="prop-x" value="\${node.position.x}" style="width: 50%">
            <input type="number" id="prop-y" value="\${node.position.y}" style="width: 50%">
          </div>
        </div>
        <button id="btn-delete-node" style="width: 100%; margin-top: 20px; padding: 8px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
          删除节点
        </button>
      \`;
      
      // 属性修改事件
      document.getElementById('prop-name').addEventListener('change', e => {
        node.metadata.name = e.target.value;
        render();
      });
      
      document.getElementById('prop-desc').addEventListener('change', e => {
        node.metadata.description = e.target.value;
        render();
      });
      
      document.getElementById('prop-x').addEventListener('change', e => {
        node.position.x = parseInt(e.target.value);
        render();
      });
      
      document.getElementById('prop-y').addEventListener('change', e => {
        node.position.y = parseInt(e.target.value);
        render();
      });
      
      document.getElementById('btn-delete-node').addEventListener('click', () => {
        workflow.nodes = workflow.nodes.filter(n => n.id !== node.id);
        workflow.edges = workflow.edges.filter(e => e.source.nodeId !== node.id && e.target.nodeId !== node.id);
        selectedNode = null;
        render();
        showEmptyProperties();
      });
    }
    
    function showEmptyProperties() {
      document.getElementById('properties-content').innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-size: 12px;">选择一个节点查看其属性</p>';
    }
    
    // 编辑节点
    function editNode(nodeId) {
      vscode.postMessage({
        type: 'editNode',
        nodeId
      });
    }
    
    // 保存
    document.getElementById('btn-save').addEventListener('click', () => {
      vscode.postMessage({
        type: 'save',
        workflow
      });
    });
    
    // 运行
    document.getElementById('btn-run').addEventListener('click', () => {
      vscode.postMessage({
        type: 'run',
        workflow
      });
    });
  </script>
</body>
</html>`;
  }
}

class WorkflowDocument implements vscode.CustomDocument {
  public workflow: Workflow;

  constructor(public readonly uri: vscode.Uri, workflow: Workflow) {
    this.workflow = workflow;
  }

  dispose(): void {}
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