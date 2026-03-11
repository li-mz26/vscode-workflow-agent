import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow, NodeConfig } from '../../shared/types';
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
        const workflowDir = path.dirname(document.fileName);

        // 注册 webview 到执行状态管理器
        this.executionStateManager.registerWebviewPanel(workflowId, webviewPanel);

        // 设置 Webview 选项
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview')),
                vscode.Uri.file(workflowDir) // 允许访问工作流目录（用于外部配置）
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
        this.setupMessageHandling(webviewPanel, document, workflow, workflowDir);

        // 监听面板关闭
        webviewPanel.onDidDispose(() => {
            this.executionStateManager.unregisterWebviewPanel(workflowId);
        });

        // 监听文档变化
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.handleDocumentChange(e, webviewPanel, document.fileName);
            }
        });

        // 监听外部配置文件变化
        const configWatcher = this.createConfigWatcher(webviewPanel, document.fileName, workflowDir);

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            configWatcher.dispose();
        });
    }

    /**
     * 创建外部配置文件监视器
     */
    private createConfigWatcher(
        webviewPanel: vscode.WebviewPanel,
        workflowPath: string,
        workflowDir: string
    ): vscode.FileSystemWatcher {
        const nodesDir = path.join(workflowDir, 'nodes');
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(nodesDir, '**/*')
        );

        watcher.onDidChange(async (uri) => {
            // 外部配置文件变化，重新加载工作流
            try {
                const document = await vscode.workspace.openTextDocument(workflowPath);
                const baseWorkflow = JSON.parse(document.getText());
                const updatedWorkflow = await this.loadWorkflowWithExternalConfigs(workflowPath, baseWorkflow);

                webviewPanel.webview.postMessage({
                    type: 'workflow:update',
                    payload: updatedWorkflow
                });
            } catch (error) {
                console.error('Failed to reload workflow after config change:', error);
            }
        });

        return watcher;
    }

    /**
     * 加载工作流及其外部配置
     */
    private async loadWorkflowWithExternalConfigs(filePath: string, baseWorkflow: Workflow): Promise<Workflow> {
        const workflow = { ...baseWorkflow };

        // 为每个节点加载外部配置
        if (workflow.nodes) {
            workflow.nodes = await Promise.all(
                workflow.nodes.map(async (node) => {
                    const externalConfig = await this.nodeConfigManager.loadNodeConfig(filePath, node);
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            ...externalConfig
                        }
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
        webviewPanel: vscode.WebviewPanel,
        workflowPath: string
    ): void {
        try {
            const updatedWorkflow = JSON.parse(e.document.getText());
            // 重新加载外部配置
            this.loadWorkflowWithExternalConfigs(workflowPath, updatedWorkflow).then(workflow => {
                webviewPanel.webview.postMessage({
                    type: 'workflow:update',
                    payload: workflow
                });
            });
        } catch {
            // 忽略解析错误
        }
    }

    private setupMessageHandling(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        workflow: Workflow,
        workflowDir: string
    ): void {
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'workflow:save':
                    await this.saveWorkflow(document, message.payload, workflowDir);
                    break;

                case 'workflow:run':
                    await this.runWorkflow(document.fileName, message.payload, workflowDir);
                    break;

                case 'workflow:debug':
                    await this.debugWorkflow(document.fileName, message.payload, workflowDir);
                    break;

                case 'node:add':
                    // 创建节点时同时创建外部配置文件
                    await this.handleNodeAdd(document.fileName, message.payload.node, webviewPanel);
                    await this.saveWorkflow(document, message.payload.workflow, workflowDir);
                    break;

                case 'node:update':
                    // 更新节点时保存外部配置
                    await this.saveNodeWithExternalConfig(document.fileName, message.payload.node);
                    await this.saveWorkflow(document, message.payload.workflow, workflowDir);
                    break;

                case 'node:delete':
                    await this.deleteNodeExternalConfig(document.fileName, message.payload.nodeId, message.payload.nodeType);
                    await this.saveWorkflow(document, message.payload.workflow, workflowDir);
                    break;

                case 'edge:add':
                case 'edge:delete':
                    await this.saveWorkflow(document, message.payload.workflow, workflowDir);
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

    /**
     * 保存工作流（同时更新 configRef）
     */
    private async saveWorkflow(document: vscode.TextDocument, workflow: Workflow, workflowDir: string): Promise<void> {
        // 为需要外部配置的节点生成 configRef
        const updatedWorkflow = await this.updateConfigRefs(workflow, workflowDir, document.fileName);

        // 创建简化版工作流（外部配置不重复存储）
        const simplifiedWorkflow = this.simplifyWorkflowForSave(updatedWorkflow);

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        edit.replace(document.uri, fullRange, JSON.stringify(simplifiedWorkflow, null, 2));
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }

    /**
     * 更新节点的 configRef 引用
     */
    private async updateConfigRefs(workflow: Workflow, workflowDir: string, workflowPath: string): Promise<Workflow> {
        const updatedNodes = await Promise.all(
            workflow.nodes.map(async (node) => {
                // 只为需要外部配置的节点类型生成 configRef
                if (['code', 'llm', 'switch', 'http', 'webhook'].includes(node.type)) {
                    const configPath = this.nodeConfigManager.getNodeConfigPath(workflowPath, node.id, node.type);
                    const relativePath = path.relative(workflowDir, configPath);

                    // 确保外部配置文件存在
                    try {
                        await this.nodeConfigManager.saveNodeConfig(workflowPath, node);
                    } catch (error) {
                        console.error(`Failed to save node config: ${node.id}`, error);
                    }

                    return {
                        ...node,
                        configRef: relativePath
                    };
                }
                return node;
            })
        );

        return { ...workflow, nodes: updatedNodes };
    }

    /**
     * 简化工作流用于保存（外部配置不重复存储在 workflow.json 中）
     */
    private simplifyWorkflowForSave(workflow: Workflow): Workflow {
        return {
            ...workflow,
            nodes: workflow.nodes.map(node => {
                // 如果有 configRef，则不保存完整的 data
                if (node.configRef) {
                    const { data, ...rest } = node;
                    // 只保留必要的元数据
                    const minimalData: any = {};

                    // 根据节点类型保留少量关键信息
                    if (node.type === 'code') {
                        minimalData.timeout = data?.timeout;
                    } else if (node.type === 'llm') {
                        minimalData.model = data?.model;
                    } else if (node.type === 'switch') {
                        // switch 的分支信息保留（用于可视化）
                        minimalData.conditions = data?.conditions;
                        minimalData.defaultTarget = data?.defaultTarget;
                    }

                    return { ...rest, data: minimalData };
                }
                return node;
            })
        };
    }

    private async saveNodeWithExternalConfig(workflowPath: string, node: any): Promise<void> {
        await this.nodeConfigManager.saveNodeConfig(workflowPath, node);
    }

    /**
     * 处理节点创建：创建外部配置文件并返回带 configRef 的节点
     */
    private async handleNodeAdd(workflowPath: string, node: NodeConfig, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const workflowDir = path.dirname(workflowPath);

        // 只为需要外部配置的节点类型创建文件
        if (['code', 'llm', 'switch', 'http', 'webhook'].includes(node.type)) {
            // 创建外部配置文件
            await this.nodeConfigManager.saveNodeConfig(workflowPath, node);

            // 生成 configRef 相对路径
            const configPath = this.nodeConfigManager.getNodeConfigPath(workflowPath, node.id, node.type);
            const configRef = path.relative(workflowDir, configPath);

            // 通知 webview 更新节点的 configRef
            webviewPanel.webview.postMessage({
                type: 'node:configRef',
                payload: {
                    nodeId: node.id,
                    configRef
                }
            });
        }
    }

    private async deleteNodeExternalConfig(workflowPath: string, nodeId: string, nodeType: string): Promise<void> {
        await this.nodeConfigManager.deleteNodeConfig(workflowPath, nodeId, nodeType);
    }

    private async openNodeConfig(workflowPath: string, node: any): Promise<void> {
        await this.nodeConfigManager.openNodeConfigFile(workflowPath, node);
    }

    private async runWorkflow(filePath: string, workflow: Workflow, workflowDir: string): Promise<void> {
        const workflowId = path.basename(filePath, '.workflow.json');

        // 显示输出面板
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.logWorkflowStart(workflowId, workflow.name);

        // 开始执行状态跟踪
        this.executionStateManager.startExecution(workflowId);

        // 创建执行引擎（传入工作流目录以加载外部配置）
        const engine = new ExecutionEngine(workflow, workflowDir);

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

    private async debugWorkflow(filePath: string, workflow: Workflow, workflowDir: string): Promise<void> {
        const workflowId = path.basename(filePath, '.workflow.json');

        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.log(`🔍 调试工作流: ${workflow.name}`);
        this.outputChannel.log(`节点数量: ${workflow.nodes.length}`);
        this.outputChannel.log(`边数量: ${workflow.edges.length}`);
        this.outputChannel.log('─'.repeat(50));

        // 开始执行状态跟踪
        this.executionStateManager.startExecution(workflowId);

        // 创建执行引擎（传入工作流目录以加载外部配置）
        const engine = new ExecutionEngine(workflow, workflowDir);

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
