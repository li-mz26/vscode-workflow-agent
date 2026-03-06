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
exports.WorkflowTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class WorkflowTreeProvider {
    constructor(workflowManager) {
        this.workflowManager = workflowManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // 监听工作流变化
        this.workflowManager.onWorkflowChanged(() => {
            this.refresh();
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // 根节点 - 返回所有工作流
            const workflows = await this.workflowManager.listWorkflows();
            return workflows.map(w => new WorkflowTreeItem(w));
        }
        return [];
    }
}
exports.WorkflowTreeProvider = WorkflowTreeProvider;
class WorkflowTreeItem extends vscode.TreeItem {
    constructor(workflow) {
        super(workflow.name, vscode.TreeItemCollapsibleState.None);
        this.workflow = workflow;
        this.tooltip = `${workflow.description || 'No description'}\nNodes: ${workflow.nodeCount}`;
        this.description = `${workflow.nodeCount} nodes`;
        this.iconPath = new vscode.ThemeIcon('git-branch');
        this.command = {
            command: 'workflowAgent.open',
            title: 'Open Workflow',
            arguments: [vscode.Uri.file(workflow.filePath)]
        };
        this.contextValue = 'workflow';
    }
}
//# sourceMappingURL=WorkflowTreeProvider.js.map