/**
 * 工作流资源管理器 - 树视图实现
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WorkflowExplorer implements vscode.TreeDataProvider<WorkflowTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<WorkflowTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkflowTreeItem): Promise<WorkflowTreeItem[]> {
    if (!element) {
      // 根节点 - 扫描工作区查找工作流
      return this.getWorkflowFolders();
    }

    if (element.contextValue === 'workflowFolder') {
      // 工作流文件夹 - 显示节点
      return this.getWorkflowNodes(element.workflowPath!);
    }

    return [];
  }

  private async getWorkflowFolders(): Promise<WorkflowTreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [new WorkflowTreeItem('请打开工作区', vscode.TreeItemCollapsibleState.None)];
    }

    const items: WorkflowTreeItem[] = [];

    for (const folder of workspaceFolders) {
      const workflowFiles = await this.findWorkflowFiles(folder.uri.fsPath);
      
      for (const wfPath of workflowFiles) {
        const name = path.basename(wfPath, '.workflow.json');
        const item = new WorkflowTreeItem(
          name,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.contextValue = 'workflowFolder';
        item.workflowPath = wfPath;
        item.iconPath = new vscode.ThemeIcon('folder');
        item.tooltip = wfPath;
        item.command = {
          command: 'workflowAgent.openWorkflow',
          title: 'Open Workflow',
          arguments: [vscode.Uri.file(wfPath)]
        };
        items.push(item);
      }
    }

    if (items.length === 0) {
      const createItem = new WorkflowTreeItem(
        '暂无工作流 - 点击创建',
        vscode.TreeItemCollapsibleState.None
      );
      createItem.command = {
        command: 'workflowAgent.createWorkflow',
        title: 'Create Workflow'
      };
      return [createItem];
    }

    return items;
  }

  private async getWorkflowNodes(workflowPath: string): Promise<WorkflowTreeItem[]> {
    const items: WorkflowTreeItem[] = [];
    const workflowDir = path.dirname(workflowPath);
    const nodesDir = path.join(workflowDir, 'nodes');

    // 读取工作流文件获取节点信息
    try {
      const content = fs.readFileSync(workflowPath, 'utf-8');
      const workflow = JSON.parse(content);

      for (const node of workflow.nodes || []) {
        const item = new WorkflowTreeItem(
          `${node.metadata?.name || node.id} (${node.type})`,
          vscode.TreeItemCollapsibleState.None
        );
        item.contextValue = 'workflowNode';
        item.nodeId = node.id;
        item.nodeType = node.type;
        item.iconPath = this.getNodeIcon(node.type);
        item.tooltip = node.metadata?.description || node.id;
        items.push(item);
      }
    } catch (err) {
      console.error('Error reading workflow:', err);
    }

    return items;
  }

  private async findWorkflowFiles(rootPath: string): Promise<string[]> {
    const results: string[] = [];

    const scanDir = async (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            await scanDir(path.join(dir, entry.name));
          } else if (entry.name.endsWith('.workflow.json')) {
            results.push(path.join(dir, entry.name));
          }
        }
      } catch (err) {
        // 忽略权限错误等
      }
    };

    await scanDir(rootPath);
    return results;
  }

  private getNodeIcon(type: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      start: 'play',
      end: 'stop',
      code: 'code',
      llm: 'hubot',
      switch: 'git-branch',
      parallel: 'rows',
      http: 'globe',
      transform: 'sync',
      delay: 'clock'
    };
    return new vscode.ThemeIcon(iconMap[type] || 'circle-outline');
  }
}

export class WorkflowTreeItem extends vscode.TreeItem {
  public workflowPath?: string;
  public nodeId?: string;
  public nodeType?: string;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

export default WorkflowExplorer;