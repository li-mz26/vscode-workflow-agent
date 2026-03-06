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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const WorkflowEditorProvider_1 = require("./core/editor/WorkflowEditorProvider");
const WorkflowManager_1 = require("./core/workflow/WorkflowManager");
const WorkflowTreeProvider_1 = require("./core/tree/WorkflowTreeProvider");
const MCPServerManager_1 = require("./core/mcp/MCPServerManager");
let mcpServerManager;
function activate(context) {
    console.log('Workflow Agent extension is now active');
    // 初始化工作流管理器
    const workflowManager = new WorkflowManager_1.WorkflowManager(context);
    // 初始化 MCP 服务器
    if (vscode.workspace.getConfiguration('workflowAgent').get('enableMCP', true)) {
        mcpServerManager = new MCPServerManager_1.MCPServerManager(workflowManager);
        mcpServerManager.start().catch(console.error);
    }
    // 注册自定义编辑器
    context.subscriptions.push(WorkflowEditorProvider_1.WorkflowEditorProvider.register(context, workflowManager));
    // 注册工作流树视图
    const workflowTreeProvider = new WorkflowTreeProvider_1.WorkflowTreeProvider(workflowManager);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('workflowAgent.explorer', workflowTreeProvider));
    // 注册命令
    context.subscriptions.push(vscode.commands.registerCommand('workflowAgent.create', async () => {
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
    }), vscode.commands.registerCommand('workflowAgent.open', async (uri) => {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'workflowAgent.editor');
    }), vscode.commands.registerCommand('workflowAgent.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            vscode.window.showInformationMessage('Running workflow...');
        }
    }), vscode.commands.registerCommand('workflowAgent.debug', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            vscode.window.showInformationMessage('Starting debug session...');
        }
    }), vscode.commands.registerCommand('workflowAgent.stop', async () => {
        vscode.window.showInformationMessage('Stopping execution...');
    }), vscode.commands.registerCommand('workflowAgent.refresh', () => {
        workflowTreeProvider.refresh();
    }));
    // 监听配置变化
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('workflowAgent.enableMCP') ||
            e.affectsConfiguration('workflowAgent.mcpPort')) {
            vscode.window.showInformationMessage('Workflow Agent: Please reload window to apply MCP settings');
        }
    }));
}
function deactivate() {
    if (mcpServerManager) {
        mcpServerManager.stop();
    }
}
//# sourceMappingURL=extension.js.map