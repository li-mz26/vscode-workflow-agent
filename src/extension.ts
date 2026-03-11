import * as vscode from 'vscode';
import { WorkflowEngine, WorkflowRunner } from './engine';
import { WorkflowMCPServer } from './mcp';
import { WorkflowEditorProvider } from './webview/WorkflowEditorProvider';

/**
 * 扩展激活入口
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Workflow Agent extension is now active');

  // 初始化核心组件
  const engine = new WorkflowEngine(context);
  const runner = new WorkflowRunner(engine, context);
  const mcpServer = new WorkflowMCPServer(context, engine, runner);

  // 注册 Custom Editor Provider
  const editorProvider = WorkflowEditorProvider.register(context, engine);
  context.subscriptions.push(editorProvider);

  // 注册命令
  registerCommands(context, engine, runner, mcpServer);

  // 存储到全局以便测试
  (global as any).workflowEngine = engine;
  (global as any).workflowRunner = runner;
}

/**
 * 注册所有命令
 */
function registerCommands(
  context: vscode.ExtensionContext,
  engine: WorkflowEngine,
  runner: WorkflowRunner,
  mcpServer: WorkflowMCPServer
) {
  // 创建工作流
  const createWorkflowCmd = vscode.commands.registerCommand(
    'workflowAgent.createWorkflow',
    async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter workflow name',
        placeHolder: 'My Workflow'
      });

      if (!name) return;

      const workflow = engine.createWorkflow(name);
      
      // 保存到文件
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${name}.workflow.json`),
        filters: {
          'Workflow Files': ['workflow.json'],
          'All Files': ['*']
        }
      });

      if (uri) {
        await engine.saveWorkflow(workflow, uri.fsPath);
        vscode.window.showInformationMessage(`Workflow "${name}" created`);
        
        // 打开编辑器
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
  context.subscriptions.push(createWorkflowCmd);

  // 打开工作流
  const openWorkflowCmd = vscode.commands.registerCommand(
    'workflowAgent.openWorkflow',
    async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'Workflow Files': ['workflow.json'],
          'All Files': ['*']
        }
      });

      if (uris && uris.length > 0) {
        const doc = await vscode.workspace.openTextDocument(uris[0]);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
  context.subscriptions.push(openWorkflowCmd);

  // 执行工作流
  const executeWorkflowCmd = vscode.commands.registerCommand(
    'workflowAgent.executeWorkflow',
    async () => {
      const workflow = engine.getCurrentWorkflow();
      if (!workflow) {
        vscode.window.showWarningMessage('No workflow loaded');
        return;
      }

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Executing workflow: ${workflow.name}`,
        cancellable: true
      }, async (progress, token) => {
        token.onCancellationRequested(() => {
          runner.cancel();
        });

        const result = await runner.execute();
        
        if (result.success) {
          vscode.window.showInformationMessage(
            `Workflow executed successfully in ${result.endTime.getTime() - result.startTime.getTime()}ms`
          );
        } else {
          vscode.window.showErrorMessage(
            `Workflow execution failed: ${result.error?.message}`
          );
        }

        return result;
      });
    }
  );
  context.subscriptions.push(executeWorkflowCmd);

  // 启动 MCP Server
  const startMCPCmd = vscode.commands.registerCommand(
    'workflowAgent.startMCPServer',
    async () => {
      try {
        await mcpServer.start();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
      }
    }
  );
  context.subscriptions.push(startMCPCmd);

  // 停止 MCP Server
  const stopMCPCmd = vscode.commands.registerCommand(
    'workflowAgent.stopMCPServer',
    async () => {
      await mcpServer.stop();
    }
  );
  context.subscriptions.push(stopMCPCmd);
}

/**
 * 扩展停用
 */
export function deactivate() {
  console.log('Workflow Agent extension is now deactivated');
}
