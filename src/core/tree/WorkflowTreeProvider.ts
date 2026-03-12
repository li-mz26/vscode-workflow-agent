import * as vscode from 'vscode';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { WorkflowSummary } from '../../shared/types';

export class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorkflowTreeItem | undefined | null | void> = new vscode.EventEmitter<WorkflowTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WorkflowTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workflowManager: WorkflowManager) {
        // 监听工作流变化
        this.workflowManager.onWorkflowChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]> {
        if (!element) {
            // 根节点 - 返回所有工作流
            const workflows = await this.workflowManager.listWorkflows();
            return workflows.map(w => new WorkflowTreeItem(w));
        }
        
        return [];
    }
}

class WorkflowTreeItem extends vscode.TreeItem {
    constructor(public readonly workflow: WorkflowSummary) {
        super(workflow.name, vscode.TreeItemCollapsibleState.None);
        
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
