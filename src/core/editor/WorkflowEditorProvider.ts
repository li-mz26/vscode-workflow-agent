import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow } from '../../shared/types';

export class WorkflowEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'workflowAgent.editor';

    public static register(
        context: vscode.ExtensionContext,
        workflowManager: WorkflowManager
    ): vscode.Disposable {
        const provider = new WorkflowEditorProvider(context, workflowManager);
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

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly workflowManager: WorkflowManager
    ) {}

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // 设置 Webview 选项
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview'))
            ]
        };

        // 加载工作流数据
        let workflow: Workflow;
        try {
            workflow = JSON.parse(document.getText());
        } catch {
            // 如果解析失败，创建新工作流
            workflow = {
                id: `wf_${Date.now()}`,
                name: path.basename(document.fileName, '.workflow.json'),
                description: '',
                version: '1.0.0',
                nodes: [],
                edges: [],
                variables: [],
                settings: { timeout: 30, logLevel: 'info' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        // 设置 HTML 内容
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, workflow);

        // 处理消息
        this.setupMessageHandling(webviewPanel, document, workflow);

        // 监听文档变化
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                // 文档外部变化，通知 Webview
                try {
                    const updatedWorkflow = JSON.parse(e.document.getText());
                    webviewPanel.webview.postMessage({
                        type: 'workflow:update',
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

    private setupMessageHandling(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        workflow: Workflow
    ): void {
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'workflow:save':
                    await this.saveWorkflow(document, message.payload);
                    break;
                
                case 'workflow:run':
                    vscode.window.showInformationMessage('Running workflow...');
                    break;
                
                case 'workflow:debug':
                    vscode.window.showInformationMessage('Starting debug...');
                    break;
                
                case 'node:add':
                case 'node:update':
                case 'node:delete':
                case 'edge:add':
                case 'edge:delete':
                    // 处理画布操作，自动保存
                    await this.saveWorkflow(document, message.payload.workflow);
                    break;
                
                case 'error':
                    vscode.window.showErrorMessage(message.payload.message);
                    break;
            }
        });
    }

    private async saveWorkflow(document: vscode.TextDocument, workflow: Workflow): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        
        edit.replace(document.uri, fullRange, JSON.stringify(workflow, null, 2));
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    private getHtmlForWebview(webview: vscode.Webview, workflow: Workflow): string {
        // 简化的 HTML，实际应该加载构建后的 React/Vue 应用
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Workflow Editor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
        }
        #root {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            height: 40px;
            display: flex;
            align-items: center;
            padding: 0 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 8px;
        }
        .toolbar button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .main {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        .sidebar {
            width: 250px;
            border-right: 1px solid var(--vscode-panel-border);
            padding: 16px;
            overflow-y: auto;
        }
        .canvas {
            flex: 1;
            position: relative;
            background: var(--vscode-editor-background);
            background-image: radial-gradient(circle, var(--vscode-panel-border) 1px, transparent 1px);
            background-size: 20px 20px;
        }
        .node-palette {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .node-item {
            padding: 12px;
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            cursor: grab;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .node-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .node-item .icon {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        .properties {
            width: 300px;
            border-left: 1px solid var(--vscode-panel-border);
            padding: 16px;
            display: none;
        }
        .properties.visible {
            display: block;
        }
        .placeholder {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="toolbar">
            <button onclick="runWorkflow()">▶ Run</button>
            <button onclick="debugWorkflow()">🐛 Debug</button>
            <button onclick="saveWorkflow()">💾 Save</button>
            <span style="margin-left: auto;">${workflow.name}</span>
        </div>
        <div class="main">
            <div class="sidebar">
                <h3>Nodes</h3>
                <div class="node-palette">
                    <div class="node-item" draggable="true" data-type="start">
                        <div class="icon" style="background: #4CAF50;">▶</div>
                        <span>Start</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="end">
                        <div class="icon" style="background: #F44336;">■</div>
                        <span>End</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="code">
                        <div class="icon" style="background: #2196F3;">{ }</div>
                        <span>Code</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="llm">
                        <div class="icon" style="background: #9C27B0;">✨</div>
                        <span>LLM</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="switch">
                        <div class="icon" style="background: #FF9800;">◆</div>
                        <span>Switch</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="parallel">
                        <div class="icon" style="background: #00BCD4;">⚡</div>
                        <span>Parallel</span>
                    </div>
                    <div class="node-item" draggable="true" data-type="merge">
                        <div class="icon" style="background: #795548;">⚹</div>
                        <span>Merge</span>
                    </div>
                </div>
            </div>
            
            <div class="canvas" id="canvas">
                <div class="placeholder">
                    <p>Drag nodes here to build your workflow</p>
                    <p style="font-size: 12px; margin-top: 8px;">${workflow.nodes.length} nodes, ${workflow.edges.length} edges</p>
                </div>
            </div>
            
            <div class="properties" id="properties">
                <h3>Properties</h3>
                <p>Select a node to edit properties</p>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const workflow = ${JSON.stringify(workflow)};
        
        // 拖拽功能
        document.querySelectorAll('.node-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('nodeType', item.dataset.type);
            });
        });
        
        const canvas = document.getElementById('canvas');
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('nodeType');
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            addNode(nodeType, x, y);
        });
        
        function addNode(type, x, y) {
            const node = {
                id: 'node_' + Date.now(),
                type: type,
                position: { x, y },
                data: {},
                inputs: [],
                outputs: []
            };
            
            workflow.nodes.push(node);
            vscode.postMessage({
                type: 'node:add',
                payload: { workflow, node }
            });
            
            updatePlaceholder();
        }
        
        function updatePlaceholder() {
            const placeholder = document.querySelector('.placeholder p:last-child');
            if (placeholder) {
                placeholder.textContent = workflow.nodes.length + ' nodes, ' + workflow.edges.length + ' edges';
            }
        }
        
        function runWorkflow() {
            vscode.postMessage({ type: 'workflow:run' });
        }
        
        function debugWorkflow() {
            vscode.postMessage({ type: 'workflow:debug' });
        }
        
        function saveWorkflow() {
            vscode.postMessage({
                type: 'workflow:save',
                payload: workflow
            });
        }
        
        // 监听来自扩展的消息
        window.addEventListener('message', (e) => {
            const message = e.data;
            switch (message.type) {
                case 'workflow:update':
                    // 更新工作流数据
                    Object.assign(workflow, message.payload);
                    updatePlaceholder();
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
