import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow } from '../../shared/types';
import { WorkflowOutputChannel } from '../output/WorkflowOutputChannel';
import { ExecutionStateManager } from '../execution/ExecutionStateManager';
import { NodeConfigManager } from '../config/NodeConfigManager';

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
        
        // 显示输出面板
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.logWorkflowStart(workflowId, workflow.name);
        
        // 开始执行状态跟踪
        this.executionStateManager.startExecution(workflowId);
        
        // 模拟执行流程（实际应调用 ExecutionEngine）
        await this.simulateExecution(filePath, workflow, workflowId);
    }

    private async debugWorkflow(filePath: string, workflow: Workflow): Promise<void> {
        const workflowId = path.basename(filePath, '.workflow.json');
        
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.log(`🔍 调试工作流: ${workflow.name}`);
        this.outputChannel.log(`节点数量: ${workflow.nodes.length}`);
        this.outputChannel.log(`边数量: ${workflow.edges.length}`);
        this.outputChannel.log('─'.repeat(50));
        
        // 开始执行状态跟踪（带调试标志）
        this.executionStateManager.startExecution(workflowId);
        
        // 模拟调试执行
        await this.simulateExecution(filePath, workflow, workflowId, true);
    }

    private async simulateExecution(
        filePath: string,
        workflow: Workflow,
        workflowId: string,
        isDebug: boolean = false
    ): Promise<void> {
        // 按拓扑排序执行节点（简化版）
        const executedNodes = new Set<string>();
        const nodeOutputs = new Map<string, any>();
        
        for (const node of workflow.nodes) {
            if (isDebug) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 调试时放慢速度
            }
            
            // 设置节点为运行中
            this.executionStateManager.setNodeRunning(workflowId, node.id);
            this.outputChannel.logNodeStart(node.id, node.type, node.metadata?.name || node.type);
            
            try {
                // 获取输入数据（来自上游节点）
                const inputs = this.getNodeInputs(node.id, workflow.edges, nodeOutputs);
                
                // 加载节点配置
                const config = await this.nodeConfigManager.loadNodeConfig(filePath, node);
                
                // 模拟执行节点
                const startTime = Date.now();
                const output = await this.executeNode(node, config, inputs);
                const duration = Date.now() - startTime;
                
                // 保存输出
                nodeOutputs.set(node.id, output);
                executedNodes.add(node.id);
                
                // 更新节点状态为成功
                this.executionStateManager.setNodeSuccess(workflowId, node.id, output);
                this.outputChannel.logNodeComplete(node.id, node.type, duration, output);
                
                // 记录数据流
                const outgoingEdges = workflow.edges.filter(e => e.source.nodeId === node.id);
                for (const edge of outgoingEdges) {
                    this.outputChannel.logDataFlow(node.id, edge.target.nodeId, output);
                }
                
            } catch (error: any) {
                this.executionStateManager.setNodeError(workflowId, node.id, error.message);
                this.outputChannel.logNodeError(node.id, node.type, error.message);
                this.executionStateManager.completeExecution(workflowId, false);
                this.outputChannel.logWorkflowComplete(workflowId, false, Date.now() - 
                    (this.executionStateManager.getExecutionState(workflowId)?.startTime || Date.now()));
                return;
            }
        }
        
        this.executionStateManager.completeExecution(workflowId, true);
        const totalDuration = Date.now() - 
            (this.executionStateManager.getExecutionState(workflowId)?.startTime || Date.now());
        this.outputChannel.logWorkflowComplete(workflowId, true, totalDuration);
    }

    private getNodeInputs(
        nodeId: string,
        edges: any[],
        nodeOutputs: Map<string, any>
    ): any {
        const inputs: any = {};
        const incomingEdges = edges.filter(e => e.target.nodeId === nodeId);
        
        for (const edge of incomingEdges) {
            const sourceOutput = nodeOutputs.get(edge.source.nodeId);
            if (sourceOutput !== undefined) {
                inputs[edge.source.portId || 'output'] = sourceOutput;
            }
        }
        
        // 所有输入合并为一个 JSON 对象
        if (incomingEdges.length === 1) {
            return nodeOutputs.get(incomingEdges[0].source.nodeId);
        }
        
        return inputs;
    }

    private async executeNode(node: any, config: any, inputs: any): Promise<any> {
        // 简化版节点执行，实际应调用相应的执行器
        switch (node.type) {
            case 'start':
                return { trigger: 'manual', timestamp: new Date().toISOString() };
            
            case 'code':
                // 实际应调用 PythonSandbox
                return { result: 'code_executed', input: inputs };
            
            case 'llm':
                // 实际应调用 LLM API
                return { content: 'LLM response', usage: { tokens: 100 } };
            
            case 'switch':
                // 根据条件返回分支
                return { branch: 'default', condition: inputs };
            
            case 'http':
                // 实际应发起 HTTP 请求
                return { status: 200, body: '{}', json: {} };
            
            case 'webhook':
                // 实际应发送 webhook
                return { sent: true };
            
            case 'end':
                return { result: inputs };
            
            default:
                return { ...inputs, processed: true };
        }
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
