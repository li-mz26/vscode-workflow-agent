import * as vscode from 'vscode';
import { WorkflowEditorProvider } from './core/editor/WorkflowEditorProvider';
import { WorkflowManager } from './core/workflow/WorkflowManager';
import { WorkflowTreeProvider } from './core/tree/WorkflowTreeProvider';
import { WorkflowFolderProvider } from './core/tree/WorkflowFolderProvider';
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

    // 注册工作流文件夹树视图
    const folderProvider = new WorkflowFolderProvider(context, workflowManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('workflowAgent.folders', folderProvider)
    );

    // 设置上下文
    updateContext(folderProvider);

    // 注册命令
    context.subscriptions.push(
        // 打开工作流
        vscode.commands.registerCommand('workflowAgent.open', async (uri: vscode.Uri) => {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
        }),

        // 创建工作流
        vscode.commands.registerCommand('workflowAgent.create', async () => {
            const folders = folderProvider.getFolders();
            if (folders.length === 0) {
                const action = await vscode.window.showWarningMessage(
                    '请先打开一个工作流文件夹',
                    '打开文件夹'
                );
                if (action === '打开文件夹') {
                    await vscode.commands.executeCommand('workflowAgent.openFolder');
                }
                return;
            }

            const name = await vscode.window.showInputBox({
                prompt: '输入工作流名称',
                placeHolder: 'my-workflow'
            });
            
            if (name) {
                const workflow = await workflowManager.createWorkflow({
                    name,
                    description: ''
                });
                
                // 打开新创建的工作流
                const uri = vscode.Uri.file(workflow.filePath!);
                await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
            }
        }),

        // 打开工作流文件夹
        vscode.commands.registerCommand('workflowAgent.openFolder', async () => {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: '选择工作流文件夹',
                title: '选择包含工作流文件的文件夹'
            });

            if (result && result[0]) {
                const folderPath = result[0].fsPath;
                await folderProvider.addFolder(folderPath);
                updateContext(folderProvider);
                workflowTreeProvider.refresh();
                
                vscode.window.showInformationMessage(`已添加工作流文件夹: ${folderPath}`);
            }
        }),

        // 关闭工作流文件夹
        vscode.commands.registerCommand('workflowAgent.closeFolder', async (item: any) => {
            if (item && item.folderPath) {
                await folderProvider.removeFolder(item.folderPath);
                updateContext(folderProvider);
                workflowTreeProvider.refresh();
            }
        }),

        // 刷新
        vscode.commands.registerCommand('workflowAgent.refresh', () => {
            workflowTreeProvider.refresh();
        }),

        // 运行工作流
        vscode.commands.registerCommand('workflowAgent.run', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                vscode.window.showInformationMessage('运行工作流...');
            }
        }),

        // 调试工作流
        vscode.commands.registerCommand('workflowAgent.debug', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                vscode.window.showInformationMessage('启动调试会话...');
            }
        }),

        // 停止执行
        vscode.commands.registerCommand('workflowAgent.stop', async () => {
            vscode.window.showInformationMessage('停止执行...');
        })
    );

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workflowAgent.enableMCP') || 
                e.affectsConfiguration('workflowAgent.mcpPort')) {
                vscode.window.showInformationMessage('Workflow Agent: 请重新加载窗口以应用 MCP 设置');
            }
        })
    );
}

function updateContext(folderProvider: WorkflowFolderProvider): void {
    vscode.commands.executeCommand('setContext', 'workflowAgent:hasFolders', folderProvider.getFolders().length > 0);
}

export function deactivate() {
    if (mcpServerManager) {
        mcpServerManager.stop();
    }
}
