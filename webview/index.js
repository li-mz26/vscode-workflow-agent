// Workflow Editor WebView
// 支持可视化编辑和 JSON 编辑两种模式

const vscode = acquireVsCodeApi();

// 状态管理
let workflow = null;
let viewMode = 'visual'; // 'visual' | 'json'
let selectedNode = null;

// 初始化
function init() {
    const root = document.getElementById('root');
    
    // 创建布局
    root.innerHTML = `
        <div class="toolbar">
            <div class="toolbar-left">
                <button id="btn-add-node" class="btn">+ 添加节点</button>
                <button id="btn-validate" class="btn">验证</button>
                <button id="btn-execute" class="btn btn-primary">▶ 执行</button>
            </div>
            <div class="toolbar-right">
                <button id="btn-toggle-view" class="btn">📄 JSON</button>
            </div>
        </div>
        <div class="main-container">
            <div id="visual-view" class="view">
                <div id="canvas"></div>
                <div id="node-palette" class="panel">
                    <h3>节点类型</h3>
                    <div class="node-types">
                        <div class="node-type" data-type="start">
                            <span class="dot" style="background:#4CAF50"></span>开始
                        </div>
                        <div class="node-type" data-type="end">
                            <span class="dot" style="background:#f44336"></span>结束
                        </div>
                        <div class="node-type" data-type="code">
                            <span class="dot" style="background:#2196F3"></span>代码
                        </div>
                        <div class="node-type" data-type="llm">
                            <span class="dot" style="background:#9C27B0"></span>LLM
                        </div>
                        <div class="node-type" data-type="switch">
                            <span class="dot" style="background:#FF9800"></span>分支
                        </div>
                        <div class="node-type" data-type="parallel">
                            <span class="dot" style="background:#00BCD4"></span>并行
                        </div>
                    </div>
                </div>
            </div>
            <div id="json-view" class="view hidden">
                <textarea id="json-editor"></textarea>
            </div>
        </div>
        <div id="properties-panel" class="panel hidden">
            <h3>属性</h3>
            <div id="properties-content">选择节点查看属性</div>
        </div>
    `;
    
    // 添加样式
    addStyles();
    
    // 绑定事件
    bindEvents();
    
    // 请求工作流数据
    vscode.postMessage({ type: 'getWorkflow' });
}

// 添加样式
function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            background: var(--vscode-panel-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .toolbar-left, .toolbar-right {
            display: flex;
            gap: 8px;
        }
        .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            border-radius: 4px;
            font-size: 13px;
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-primary {
            background: var(--vscode-button-background);
        }
        .main-container {
            display: flex;
            height: calc(100vh - 45px);
        }
        .view {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        .view.hidden {
            display: none;
        }
        #visual-view {
            position: relative;
        }
        #canvas {
            flex: 1;
            position: relative;
            background: var(--vscode-editor-background);
            background-image: 
                radial-gradient(circle, var(--vscode-panel-border) 1px, transparent 1px);
            background-size: 20px 20px;
        }
        .panel {
            width: 200px;
            background: var(--vscode-panel-background);
            border-left: 1px solid var(--vscode-panel-border);
            padding: 16px;
        }
        .panel h3 {
            font-size: 13px;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .node-types {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .node-type {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 13px;
        }
        .node-type:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        #json-editor {
            width: 100%;
            height: 100%;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: none;
            padding: 16px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            resize: none;
        }
        #properties-panel {
            position: fixed;
            right: 0;
            top: 45px;
            bottom: 0;
            width: 250px;
            z-index: 100;
        }
        #properties-panel.hidden {
            display: none;
        }
        .node {
            position: absolute;
            width: 140px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            cursor: move;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .node.selected {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px var(--vscode-focusBorder);
        }
        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .node-title {
            font-size: 13px;
            font-weight: 600;
        }
        .node-type-label {
            font-size: 11px;
            opacity: 0.7;
        }
        .node-ports {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .port {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--vscode-panel-border);
            cursor: pointer;
        }
        .port:hover {
            background: var(--vscode-focusBorder);
        }
        .edge {
            stroke: var(--vscode-panel-border);
            stroke-width: 2;
            fill: none;
        }
        .form-group {
            margin-bottom: 12px;
        }
        .form-label {
            display: block;
            font-size: 11px;
            margin-bottom: 4px;
            color: var(--vscode-descriptionForeground);
        }
        .form-input, .form-textarea {
            width: 100%;
            padding: 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
        }
        .form-textarea {
            min-height: 100px;
            resize: vertical;
        }
    `;
    document.head.appendChild(style);
}

// 绑定事件
function bindEvents() {
    // 切换视图
    document.getElementById('btn-toggle-view').addEventListener('click', () => {
        viewMode = viewMode === 'visual' ? 'json' : 'visual';
        updateView();
    });
    
    // 添加节点
    document.getElementById('btn-add-node').addEventListener('click', () => {
        vscode.postMessage({
            type: 'addNode',
            payload: { type: 'code', position: { x: 200, y: 200 } }
        });
    });
    
    // 验证
    document.getElementById('btn-validate').addEventListener('click', () => {
        vscode.postMessage({ type: 'validateWorkflow' });
    });
    
    // 执行
    document.getElementById('btn-execute').addEventListener('click', () => {
        vscode.postMessage({ type: 'executeWorkflow' });
    });
    
    // JSON 编辑器变化
    const jsonEditor = document.getElementById('json-editor');
    jsonEditor.addEventListener('change', () => {
        try {
            const newWorkflow = JSON.parse(jsonEditor.value);
            vscode.postMessage({
                type: 'updateWorkflow',
                payload: newWorkflow
            });
        } catch (e) {
            // 忽略 JSON 解析错误
        }
    });
    
    // 节点类型点击
    document.querySelectorAll('.node-type').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            const canvas = document.getElementById('canvas');
            const rect = canvas.getBoundingClientRect();
            vscode.postMessage({
                type: 'addNode',
                payload: {
                    type,
                    position: { x: rect.width / 2 - 70, y: rect.height / 2 - 40 }
                }
            });
        });
    });
    
    // 监听 VSCode 消息
    window.addEventListener('message', handleMessage);
}

// 更新视图
function updateView() {
    const visualView = document.getElementById('visual-view');
    const jsonView = document.getElementById('json-view');
    const toggleBtn = document.getElementById('btn-toggle-view');
    
    if (viewMode === 'visual') {
        visualView.classList.remove('hidden');
        jsonView.classList.add('hidden');
        toggleBtn.textContent = '📄 JSON';
        renderVisual();
    } else {
        visualView.classList.add('hidden');
        jsonView.classList.remove('hidden');
        toggleBtn.textContent = '🎨 可视化';
        updateJsonEditor();
    }
}

// 渲染可视化视图
function renderVisual() {
    if (!workflow) return;
    
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = '';
    
    // 渲染边（连接线）
    workflow.edges.forEach(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
        const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
        if (sourceNode && targetNode) {
            renderEdge(canvas, sourceNode, targetNode, edge);
        }
    });
    
    // 渲染节点
    workflow.nodes.forEach(node => {
        renderNode(canvas, node);
    });
}

// 渲染单个节点
function renderNode(canvas, node) {
    const el = document.createElement('div');
    el.className = 'node';
    el.id = `node-${node.id}`;
    el.style.left = `${node.position.x}px`;
    el.style.top = `${node.position.y}px`;
    if (selectedNode === node.id) {
        el.classList.add('selected');
    }
    
    const colors = {
        start: '#4CAF50',
        end: '#f44336',
        code: '#2196F3',
        llm: '#9C27B0',
        switch: '#FF9800',
        parallel: '#00BCD4'
    };
    
    el.innerHTML = `
        <div class="node-header">
            <span class="dot" style="background:${colors[node.type] || '#888'}"></span>
            <span class="node-title">${node.metadata.name}</span>
        </div>
        <div class="node-type-label">${node.type}</div>
    `;
    
    // 点击选择
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node.id);
    });
    
    // 拖拽
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    el.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = node.position.x;
        startTop = node.position.y;
        el.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newX = Math.max(0, startLeft + dx);
        const newY = Math.max(0, startTop + dy);
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            el.style.cursor = 'move';
            const finalX = parseInt(el.style.left);
            const finalY = parseInt(el.style.top);
            vscode.postMessage({
                type: 'updateNodePosition',
                payload: { nodeId: node.id, position: { x: finalX, y: finalY } }
            });
        }
    });
    
    canvas.appendChild(el);
}

// 渲染边（简单实现，用 SVG）
function renderEdge(canvas, sourceNode, targetNode, edge) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '0';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('edge');
    
    // 简单的直线连接（从节点中心到节点中心）
    const x1 = sourceNode.position.x + 70;
    const y1 = sourceNode.position.y + 40;
    const x2 = targetNode.position.x + 70;
    const y2 = targetNode.position.y + 40;
    
    // 贝塞尔曲线
    const midX = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    path.setAttribute('d', d);
    
    svg.appendChild(path);
    canvas.appendChild(svg);
}

// 选择节点
function selectNode(nodeId) {
    selectedNode = nodeId;
    const node = workflow.nodes.find(n => n.id === nodeId);
    
    // 更新选中样式
    document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById(`node-${nodeId}`);
    if (el) el.classList.add('selected');
    
    // 显示属性面板
    const panel = document.getElementById('properties-panel');
    const content = document.getElementById('properties-content');
    panel.classList.remove('hidden');
    
    if (node) {
        content.innerHTML = `
            <div class="form-group">
                <label class="form-label">ID</label>
                <input class="form-input" value="${node.id}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">类型</label>
                <input class="form-input" value="${node.type}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">名称</label>
                <input class="form-input" id="prop-name" value="${node.metadata.name}">
            </div>
            <div class="form-group">
                <label class="form-label">描述</label>
                <textarea class="form-textarea" id="prop-desc">${node.metadata.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">配置 (JSON)</label>
                <textarea class="form-textarea" id="prop-data">${JSON.stringify(node.data, null, 2)}</textarea>
            </div>
            <button class="btn" id="btn-save-props">保存</button>
            <button class="btn" id="btn-delete-node">删除节点</button>
        `;
        
        // 保存属性
        document.getElementById('btn-save-props').addEventListener('click', () => {
            const name = document.getElementById('prop-name').value;
            const desc = document.getElementById('prop-desc').value;
            let data = {};
            try {
                data = JSON.parse(document.getElementById('prop-data').value);
            } catch (e) {
                alert('JSON 格式错误');
                return;
            }
            
            vscode.postMessage({
                type: 'updateNode',
                payload: {
                    nodeId,
                    data: {
                        metadata: { name, description: desc },
                        data
                    }
                }
            });
        });
        
        // 删除节点
        document.getElementById('btn-delete-node').addEventListener('click', () => {
            vscode.postMessage({
                type: 'removeNode',
                payload: { nodeId }
            });
            panel.classList.add('hidden');
        });
    }
}

// 更新 JSON 编辑器
function updateJsonEditor() {
    const editor = document.getElementById('json-editor');
    if (workflow) {
        editor.value = JSON.stringify(workflow, null, 2);
    }
}

// 处理来自 VSCode 的消息
function handleMessage(event) {
    const message = event.data;
    
    switch (message.type) {
        case 'workflowLoaded':
        case 'workflowUpdated':
            workflow = message.payload;
            if (viewMode === 'visual') {
                renderVisual();
            } else {
                updateJsonEditor();
            }
            break;
            
        case 'workflowChanged':
            // 增量更新，重新请求完整数据
            vscode.postMessage({ type: 'getWorkflow' });
            break;
            
        case 'error':
            console.error('Error:', message.payload.message);
            break;
    }
}

// 启动
init();
