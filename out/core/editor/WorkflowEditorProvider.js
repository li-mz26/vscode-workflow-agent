"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class WorkflowEditorProvider {
    static register(context, workflowManager) {
        const provider = new WorkflowEditorProvider(context, workflowManager);
        const providerRegistration = vscode.window.registerCustomEditorProvider(WorkflowEditorProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        });
        return providerRegistration;
    }
    constructor(context, workflowManager) {
        this.context = context;
        this.workflowManager = workflowManager;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        // 设置 Webview 选项
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview'))
            ]
        };
        // 加载工作流数据
        let workflow;
        try {
            workflow = JSON.parse(document.getText());
        }
        catch {
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
                }
                catch {
                    // 忽略解析错误
                }
            }
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }
    setupMessageHandling(webviewPanel, document, workflow) {
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
    async saveWorkflow(document, workflow) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        edit.replace(document.uri, fullRange, JSON.stringify(workflow, null, 2));
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }
    getHtmlForWebview(webview, workflow) {
        // 加载构建后的 React 应用
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview', 'assets', 'main.js')));
        const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview', 'assets', 'main.css')));
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
    <title>Workflow Editor</title>
    <link rel="stylesheet" type="text/css" href="${cssUri}">
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.__WORKFLOW_DATA__ = ${JSON.stringify(workflow)};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
exports.WorkflowEditorProvider = WorkflowEditorProvider;
WorkflowEditorProvider.viewType = 'workflowAgent.editor';
//# sourceMappingURL=WorkflowEditorProvider.js.map