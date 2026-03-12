import * as vscode from 'vscode';
import * as path from 'path';
import { WorkflowManager } from '../workflow/WorkflowManager';

export class WorkflowFolderProvider implements vscode.TreeDataProvider<FolderTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FolderTreeItem | undefined | null | void> = new vscode.EventEmitter<FolderTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FolderTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private folders: string[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private workflowManager: WorkflowManager
    ) {
        // 加载保存的文件夹列表
        const savedFolders = context.globalState.get<string[]>('workflowFolders', []);
        this.folders = savedFolders;
        
        // 重新加载每个文件夹中的工作流
        this.loadWorkflowsFromFolders();
    }

    getFolders(): string[] {
        return [...this.folders];
    }

    async addFolder(folderPath: string): Promise<void> {
        if (!this.folders.includes(folderPath)) {
            this.folders.push(folderPath);
            await this.saveFolders();
            await this.loadWorkflowsFromFolder(folderPath);
            this._onDidChangeTreeData.fire();
        }
    }

    async removeFolder(folderPath: string): Promise<void> {
        const index = this.folders.indexOf(folderPath);
        if (index !== -1) {
            this.folders.splice(index, 1);
            await this.saveFolders();
            this._onDidChangeTreeData.fire();
        }
    }

    private async saveFolders(): Promise<void> {
        await this.context.globalState.update('workflowFolders', this.folders);
    }

    private async loadWorkflowsFromFolders(): Promise<void> {
        for (const folder of this.folders) {
            await this.loadWorkflowsFromFolder(folder);
        }
    }

    private async loadWorkflowsFromFolder(folderPath: string): Promise<void> {
        try {
            const pattern = new vscode.RelativePattern(folderPath, '**/*.workflow.json');
            const files = await vscode.workspace.findFiles(pattern);
            
            for (const file of files) {
                try {
                    await this.workflowManager.loadFromFile(file.fsPath);
                } catch (error) {
                    console.error(`Failed to load workflow from ${file.fsPath}:`, error);
                }
            }
        } catch (error) {
            console.error(`Failed to scan folder ${folderPath}:`, error);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FolderTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FolderTreeItem): Thenable<FolderTreeItem[]> {
        if (!element) {
            // 根节点 - 返回所有文件夹
            return Promise.resolve(
                this.folders.map(folderPath => new FolderTreeItem(folderPath))
            );
        }
        return Promise.resolve([]);
    }
}

class FolderTreeItem extends vscode.TreeItem {
    constructor(public readonly folderPath: string) {
        super(path.basename(folderPath), vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = folderPath;
        this.description = folderPath;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'workflowFolder';
    }
}
