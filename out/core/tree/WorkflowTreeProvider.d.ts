import * as vscode from 'vscode';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { WorkflowSummary } from '../../shared/types';
export declare class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
    private workflowManager;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<WorkflowTreeItem | undefined | null | void>;
    constructor(workflowManager: WorkflowManager);
    refresh(): void;
    getTreeItem(element: WorkflowTreeItem): vscode.TreeItem;
    getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]>;
}
declare class WorkflowTreeItem extends vscode.TreeItem {
    readonly workflow: WorkflowSummary;
    constructor(workflow: WorkflowSummary);
}
export {};
//# sourceMappingURL=WorkflowTreeProvider.d.ts.map