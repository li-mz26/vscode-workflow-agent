import * as vscode from 'vscode';
import { WorkflowEditorProvider } from './core/editor/WorkflowEditorProvider';
import { WorkflowManager } from './core/workflow/WorkflowManager';
import { WorkflowTreeProvider } from './core/tree/WorkflowTreeProvider';
import { MCPServerManager } from './core/mcp/MCPServerManager';

let mcpServerManager: MCPServerManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Workflow Agent extension is now active');

    // 初始化工作流管理器
    const workflowManager = new WorkflowManager(context);

    // 初始化 MCP 服务器
    if (vscode.workspace.getConfiguration('workflowAgent').get('enableMCP', true)) {
        mcpServerManager = new MCPServerManager(workflowManager);
        mcpServerManager.start().catch(console.error);
    }

    // 注册自定义编辑器
    context.subscriptions.push(
        WorkflowEditorProvider.register(context, workflowManager)
    );

    // 注册工作流树视图
    const workflowTreeProvider = new WorkflowTreeProvider(workflowManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('workflowAgent.explorer', workflowTreeProvider)
    );

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('workflowAgent.create', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter workflow name',
                placeHolder: 'my-workflow'
            });
            
            if (name) {
                const workflow = await workflowManager.createWorkflow({
                    name,
                    description: ''
                });
                
                // 打开新创建的工作流
                const uri = vscode.Uri.file(workflow.filePath);
                await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
            }
        }),

        vscode.commands.registerCommand('workflowAgent.open', async (uri: vscode.Uri) => {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
        }),

        vscode.commands.registerCommand('workflowAgent.run', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                vscode.window.showInformationMessage('Running workflow...');
            }
        }),

        vscode.commands.registerCommand('workflowAgent.debug', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                vscode.window.showInformationMessage('Starting debug session...');
            }
        }),

        vscode.commands.registerCommand('workflowAgent.stop', async () => {
            vscode.window.showInformationMessage('Stopping execution...');
        }),

        vscode.commands.registerCommand('workflowAgent.refresh', () => {
            workflowTreeProvider.refresh();
        })
    );

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workflowAgent.enableMCP') || 
                e.affectsConfiguration('workflowAgent.mcpPort')) {
                vscode.window.showInformationMessage('Workflow Agent: Please reload window to apply MCP settings');
            }
        })
    );
}

export function deactivate() {
    if (mcpServerManager) {
        mcpServerManager.stop();
    }
}
