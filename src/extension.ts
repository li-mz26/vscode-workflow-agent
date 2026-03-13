/**
 * VSCode 扩展入口
 */

import * as vscode from 'vscode';
import { WorkflowEditorProvider } from './webview/editor';
import { MCPControlPanelProvider } from './sidebar/mcpPanel';
import { WorkflowEngine, WorkflowLoader } from './engine';
import { Workflow } from './engine/types';

let workflowEditorProvider: WorkflowEditorProvider;
let mcpPanelProvider: MCPControlPanelProvider;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Workflow Agent extension is activating...');

  // 注册工作流编辑器
  workflowEditorProvider = new WorkflowEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'workflowAgent.editor',
      workflowEditorProvider,
      { supportsMultipleEditorsPerDocument: false }
    )
  );

  // 注册 MCP 控制面板
  mcpPanelProvider = new MCPControlPanelProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MCPControlPanelProvider.viewType,
      mcpPanelProvider
    )
  );
  context.subscriptions.push(mcpPanelProvider);

  // 注册命令
  registerCommands(context);

  console.log('Workflow Agent extension activated!');
}

function registerCommands(context: vscode.ExtensionContext): void {
  // 打开工作流编辑器
  context.subscriptions.push(
    vscode.commands.registerCommand('workflowAgent.openWorkflow', async (uri?: vscode.Uri) => {
      if (uri) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
      } else {
        const files = await vscode.window.showOpenDialog({
          filters: { 'Workflow Files': ['workflow.json'] },
          canSelectMany: false
        });
        if (files?.[0]) {
          await vscode.commands.executeCommand('vscode.openWith', files[0], 'workflowAgent.editor');
        }
      }
    })
  );

  // 创建新工作流
  context.subscriptions.push(
    vscode.commands.registerCommand('workflowAgent.createWorkflow', async () => {
      const name = await vscode.window.showInputBox({
        prompt: '工作流名称',
        placeHolder: 'my-workflow'
      });
      
      if (!name) return;

      const folder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false
      });

      if (!folder?.[0]) return;

      const workflow: Workflow = {
        id: `wf_${Date.now()}`,
        name,
        description: '',
        version: '1.0.0',
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 200 },
            metadata: { name: '开始', description: '工作流入口' }
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 800, y: 200 },
            metadata: { name: '结束', description: '工作流出口' }
          }
        ],
        edges: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      const saveResult = await WorkflowLoader.saveToDirectory(
        folder[0].fsPath,
        workflow,
        new Map()
      );

      if (saveResult.success) {
        const workflowFile = vscode.Uri.joinPath(folder[0], `${name}.workflow.json`);
        await vscode.commands.executeCommand('vscode.openWith', workflowFile, 'workflowAgent.editor');
        vscode.window.showInformationMessage(`工作流 "${name}" 创建成功！`);
      } else {
        vscode.window.showErrorMessage(`创建失败: ${saveResult.error}`);
      }
    })
  );

  // 运行工作流
  context.subscriptions.push(
    vscode.commands.registerCommand('workflowAgent.runWorkflow', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('请先选择一个工作流文件');
        return;
      }

      const result = await WorkflowLoader.loadFromDirectory(
        uri.fsPath.replace(/\.workflow\.json$/, '')
      );

      if (!result.success) {
        vscode.window.showErrorMessage(`加载失败: ${result.error}`);
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '执行工作流...' },
        async () => {
          const engine = new WorkflowEngine();
          const executionResult = await engine.execute(result.workflow!, result.nodeConfigs!);
          
          if (executionResult.status === 'success') {
            vscode.window.showInformationMessage('工作流执行成功！');
          } else {
            vscode.window.showErrorMessage(`执行失败: ${executionResult.error}`);
          }

          // 显示执行结果
          const outputChannel = vscode.window.createOutputChannel('Workflow Execution');
          outputChannel.appendLine(JSON.stringify(executionResult, null, 2));
          outputChannel.show();
        }
      );
    })
  );

  // MCP 服务控制命令
  context.subscriptions.push(
    vscode.commands.registerCommand('workflowAgent.mcpStart', async () => {
      await mcpPanelProvider.startServer();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workflowAgent.mcpStop', () => {
      mcpPanelProvider.stopServer();
    })
  );
}

export function deactivate(): void {
  console.log('Workflow Agent extension deactivated');
}