import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow } from '../../shared/types';
import { WorkflowOutputChannel } from '../output/WorkflowOutputChannel';
import { ExecutionStateManager } from '../execution/ExecutionStateManager';
import { NodeConfigManager } from '../config/NodeConfigManager';
import { ExecutionEngine } from '../execution/ExecutionEngine';

export class WorkflowEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'workflowAgent.editor';
    private outputChannel: WorkflowOutputChannel;
    private executionStateManager: ExecutionStateManager;
    private nodeConfigManager: NodeConfigManager;

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
    ) {
        this.outputChannel = WorkflowOutputChannel.getInstance();
        this.executionStateManager = ExecutionStateManager.getInstance();
        this.nodeConfigManager = new NodeConfigManager(context);
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const workflowId = path.basename(document.fileName, '.workflow.json');
        
        // 注册 webview 到执行状态管理器
        this.executionStateManager.registerWebviewPanel(workflowId, webviewPanel);

        // 设置 Webview 选项
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview'))
            ]
        };

        // 加载工作流数据（包含外部配置）
        let workflow: Workflow;
        try {
            const baseWorkflow = JSON.parse(document.getText());
            workflow = await this.loadWorkflowWithExternalConfigs(document.fileName, baseWorkflow);
        } catch {
            workflow = this.createDefaultWorkflow(document.fileName);
        }

        // 设置 HTML 内容
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, workflow);

        // 处理消息
        this.setupMessageHandling(webviewPanel, document, workflow);

        // 监听面板关闭
        webviewPanel.onDidDispose(() => {
            this.executionStateManager.unregisterWebviewPanel(workflowId);
        });

        // 监听文档变化
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.handleDocumentChange(e, webviewPanel);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private async loadWorkflowWithExternalConfigs(filePath: string, baseWorkflow: Workflow): Promise<Workflow> {
        const workflow = { ...baseWorkflow };
        
        // 为每个节点加载外部配置
        if (workflow.nodes) {
            workflow.nodes = await Promise.all(
                workflow.nodes.map(async (node) => {
                    const externalConfig = await this.nodeConfigManager.loadNodeConfig(filePath, node);
                    return {
                        ...node,
                        data: { ...node.data, ...externalConfig }
                    };
                })
            );
        }
        
        return workflow;
    }

    private createDefaultWorkflow(fileName: string): Workflow {
        return {
            id: `wf_${Date.now()}`,
            name: path.basename(fileName, '.workflow.json'),
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

    private handleDocumentChange(
        e: vscode.TextDocumentChangeEvent,
        webviewPanel: vscode.WebviewPanel
    ): void {
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
                    await this.runWorkflow(document.fileName, message.payload);
                    break;
                
                case 'workflow:debug':
                    await this.debugWorkflow(document.fileName, message.payload);
                    break;
                
                case 'node:add':
                case 'node:update':
                    // 保存节点时同时保存外部配置
                    await this.saveNodeWithExternalConfig(document.fileName, message.payload.node);
                    await this.saveWorkflow(document, message.payload.workflow);
                    break;
                
                case 'node:delete':
                    await this.deleteNodeExternalConfig(document.fileName, message.payload.nodeId, message.payload.nodeType);
                    await this.saveWorkflow(document, message.payload.workflow);
                    break;
                
                case 'edge:add':
                case 'edge:delete':
                    await this.saveWorkflow(document, message.payload.workflow);
                    break;

                case 'node:openConfig':
                    await this.openNodeConfig(document.fileName, message.payload.node);
                    break;
                
                case 'error':
                    vscode.window.showErrorMessage(message.payload.message);
                    break;
            }
        });
    }

    private async saveWorkflow(document: vscode.TextDocument, workflow: Workflow): Promise<void> {
        // 创建简化版工作流（不包含大段代码或配置）
        const simplifiedWorkflow = this.simplifyWorkflowForSave(workflow);
        
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        
        edit.replace(document.uri, fullRange, JSON.stringify(simplifiedWorkflow, null, 2));
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    private simplifyWorkflowForSave(workflow: Workflow): Workflow {
        return {
            ...workflow,
            nodes: workflow.nodes.map(node => {
                const { data, ...rest } = node;
                // 只保留基本数据，大段配置在外部文件
                const simplifiedData: any = {};
                
                if (node.type === 'code') {
                    simplifiedData.code = '// 代码保存在外部文件: ' + node.id + '.py';
                } else if (node.type === 'switch') {
                    simplifiedData.conditions = data.conditions || [];
                    simplifiedData.defaultTarget = data.defaultTarget;
                } else if (node.type === 'llm') {
                    simplifiedData.model = data.model;
                    simplifiedData.temperature = data.temperature;
                    simplifiedData.maxTokens = data.maxTokens;
                    // 提示词保存在外部文件
                } else {
                    // 其他节点保留原始数据
                    Object.assign(simplifiedData, data);
                }
                
                return { ...rest, data: simplifiedData };
            })
        };
    }

    private async saveNodeWithExternalConfig(workflowPath: string, node: any): Promise<void> {
        await this.nodeConfigManager.saveNodeConfig(workflowPath, node);
    }

    private async deleteNodeExternalConfig(workflowPath: string, nodeId: string, nodeType: string): Promise<void> {
        await this.nodeConfigManager.deleteNodeConfig(workflowPath, nodeId, nodeType);
    }

    private async openNodeConfig(workflowPath: string, node: any): Promise<void> {
        await this.nodeConfigManager.openNodeConfigFile(workflowPath, node);
    }

    private async runWorkflow(filePath: string, workflow: Workflow): Promise<void> {
        const workflowId = path.basename(filePath, '.workflow.json');
        
        // 设置 workflowDir 用于加载外部配置
        (workflow as any).workflowDir = path.dirname(filePath);
        
        // 显示输出面板
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.logWorkflowStart(workflowId, workflow.name);
        
        // 开始执行状态跟踪
        this.executionStateManager.startExecution(workflowId);
        
        // 创建执行引擎
        const engine = new ExecutionEngine(workflow);
        
        // 监听执行事件
        engine.on('node:started', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeRunning(workflowId, data.nodeId);
            this.outputChannel.logNodeStart(data.nodeId, node?.type || 'unknown', node?.metadata?.name || data.nodeId);
        });
        
        engine.on('node:completed', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeSuccess(workflowId, data.nodeId, data.outputs);
            this.outputChannel.logNodeComplete(data.nodeId, node?.type || 'unknown', 0, data.outputs);
        });
        
        engine.on('node:failed', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeError(workflowId, data.nodeId, data.error?.message || 'Unknown error');
            this.outputChannel.logNodeError(data.nodeId, node?.type || 'unknown', data.error?.message || 'Unknown error');
        });
        
        // 执行工作流
        const result = await engine.start();
        
        // 完成执行
        this.executionStateManager.completeExecution(workflowId, result.success);
        this.outputChannel.logWorkflowComplete(workflowId, result.success, result.duration);
    }

    private async debugWorkflow(filePath: string, workflow: Workflow): Promise<void> {
        const workflowId = path.basename(filePath, '.workflow.json');
        
        // 设置 workflowDir 用于加载外部配置
        (workflow as any).workflowDir = path.dirname(filePath);
        
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.log(`🔍 调试工作流: ${workflow.name}`);
        this.outputChannel.log(`节点数量: ${workflow.nodes.length}`);
        this.outputChannel.log(`边数量: ${workflow.edges.length}`);
        this.outputChannel.log('─'.repeat(50));
        
        // 开始执行状态跟踪
        this.executionStateManager.startExecution(workflowId);
        
        // 创建执行引擎
        const engine = new ExecutionEngine(workflow);
        
        // 为所有节点设置断点（调试模式）
        for (const node of workflow.nodes) {
            engine.setBreakpoint(node.id);
        }
        
        // 监听执行事件
        engine.on('node:started', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeRunning(workflowId, data.nodeId);
            this.outputChannel.logNodeStart(data.nodeId, node?.type || 'unknown', node?.metadata?.name || data.nodeId);
        });
        
        engine.on('node:completed', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeSuccess(workflowId, data.nodeId, data.outputs);
            this.outputChannel.logNodeComplete(data.nodeId, node?.type || 'unknown', 0, data.outputs);
        });
        
        engine.on('node:failed', (data: any) => {
            const node = workflow.nodes.find(n => n.id === data.nodeId);
            this.executionStateManager.setNodeError(workflowId, data.nodeId, data.error?.message || 'Unknown error');
            this.outputChannel.logNodeError(data.nodeId, node?.type || 'unknown', data.error?.message || 'Unknown error');
        });
        
        engine.on('breakpoint:hit', (data: any) => {
            this.outputChannel.log(`⏸️ 断点命中: ${data.nodeId}`);
        });
        
        // 执行工作流（调试模式需要手动 step）
        const result = await engine.start();
        
        // 完成执行
        this.executionStateManager.completeExecution(workflowId, result.success);
        this.outputChannel.logWorkflowComplete(workflowId, result.success, result.duration);
    }

    private getHtmlForWebview(webview: vscode.Webview, workflow: Workflow): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview', 'assets', 'index.js'))
        );
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
    <title>Workflow Editor</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.__WORKFLOW_DATA__ = ${JSON.stringify(workflow)};
        window.__EXECUTION_STATE__ = null;
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
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
