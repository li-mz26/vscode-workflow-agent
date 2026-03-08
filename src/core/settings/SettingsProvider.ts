import * as vscode from 'vscode';

interface SettingItem {
    id: string;
    label: string;
    description?: string;
    value?: any;
    type: 'boolean' | 'number' | 'string' | 'action';
    configKey?: string;
    icon?: string;
    children?: SettingItem[];
}

export class SettingsProvider implements vscode.TreeDataProvider<SettingTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingTreeItem | undefined | null | void> = new vscode.EventEmitter<SettingTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SettingTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingTreeItem): Thenable<SettingTreeItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootSettings());
        }
        
        if (element.children) {
            return Promise.resolve(element.children);
        }
        
        return Promise.resolve([]);
    }

    private getRootSettings(): SettingTreeItem[] {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        
        const settings: SettingItem[] = [
            {
                id: 'mcp',
                label: 'MCP 服务设置',
                type: 'action',
                icon: '$(server)',
                children: [
                    {
                        id: 'enableMCP',
                        label: '启用 MCP 服务',
                        description: config.get('enableMCP') ? '已启用' : '已禁用',
                        value: config.get('enableMCP'),
                        type: 'boolean',
                        configKey: 'enableMCP',
                        icon: config.get('enableMCP') ? '$(check)' : '$(x)'
                    },
                    {
                        id: 'mcpPort',
                        label: 'MCP 端口',
                        description: `当前端口: ${config.get('mcpPort')}`,
                        value: config.get('mcpPort'),
                        type: 'number',
                        configKey: 'mcpPort',
                        icon: '$(ports-open-browser)'
                    }
                ]
            },
            {
                id: 'llm',
                label: 'LLM 设置',
                type: 'action',
                icon: '$(sparkle)',
                children: [
                    {
                        id: 'defaultLLMProvider',
                        label: '默认 LLM 提供商',
                        description: config.get('defaultLLMProvider'),
                        value: config.get('defaultLLMProvider'),
                        type: 'string',
                        configKey: 'defaultLLMProvider',
                        icon: '$(symbol-method)'
                    },
                    {
                        id: 'openaiApiKey',
                        label: 'OpenAI API Key',
                        description: this.maskApiKey(config.get('openaiApiKey')),
                        value: config.get('openaiApiKey'),
                        type: 'string',
                        configKey: 'openaiApiKey',
                        icon: '$(key)'
                    },
                    {
                        id: 'anthropicApiKey',
                        label: 'Anthropic API Key',
                        description: this.maskApiKey(config.get('anthropicApiKey')),
                        value: config.get('anthropicApiKey'),
                        type: 'string',
                        configKey: 'anthropicApiKey',
                        icon: '$(key)'
                    }
                ]
            },
            {
                id: 'execution',
                label: '执行设置',
                type: 'action',
                icon: '$(play-circle)',
                children: [
                    {
                        id: 'pythonPath',
                        label: 'Python 路径',
                        description: config.get('pythonPath'),
                        value: config.get('pythonPath'),
                        type: 'string',
                        configKey: 'pythonPath',
                        icon: '$(terminal)'
                    }
                ]
            },
            {
                id: 'openSettings',
                label: '打开完整设置',
                type: 'action',
                icon: '$(gear)'
            }
        ];

        return settings.map(s => this.createTreeItem(s));
    }

    private createTreeItem(setting: SettingItem): SettingTreeItem {
        const treeItem = new SettingTreeItem(
            setting.label,
            setting.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
            setting
        );
        
        treeItem.description = setting.description;
        treeItem.iconPath = new vscode.ThemeIcon(setting.icon?.replace(/\$\(|\)/g, '') || 'settings');
        treeItem.contextValue = setting.type;
        
        if (setting.id === 'openSettings') {
            treeItem.command = {
                command: 'workflowAgent.openSettings',
                title: '打开设置'
            };
        } else if (setting.configKey) {
            treeItem.command = {
                command: 'workflowAgent.editSetting',
                title: '编辑设置',
                arguments: [setting]
            };
        }
        
        return treeItem;
    }

    private maskApiKey(key: string | undefined): string {
        if (!key) return '未设置';
        if (key.length <= 8) return '***';
        return key.substring(0, 4) + '...' + key.substring(key.length - 4);
    }

    async toggleMCP(): Promise<void> {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        const currentValue = config.get('enableMCP', true);
        await config.update('enableMCP', !currentValue, true);
        this.refresh();
        
        vscode.window.showInformationMessage(
            `MCP 服务已${!currentValue ? '启用' : '禁用'}，请重新加载窗口以应用更改`,
            '重新加载'
        ).then(selection => {
            if (selection === '重新加载') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    async configureMCPPort(): Promise<void> {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        const currentPort = config.get('mcpPort', 3000);
        
        const port = await vscode.window.showInputBox({
            prompt: '输入 MCP 服务端口号',
            value: String(currentPort),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1024 || num > 65535) {
                    return '请输入 1024-65535 之间的端口号';
                }
                return null;
            }
        });
        
        if (port) {
            await config.update('mcpPort', parseInt(port), true);
            this.refresh();
            
            vscode.window.showInformationMessage(
                `MCP 端口已更改为 ${port}，请重新加载窗口以应用更改`,
                '重新加载'
            ).then(selection => {
                if (selection === '重新加载') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    }

    async editSetting(setting: SettingItem): Promise<void> {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        
        if (setting.type === 'boolean') {
            if (setting.configKey === 'enableMCP') {
                await this.toggleMCP();
            } else {
                await config.update(setting.configKey!, !setting.value, true);
                this.refresh();
            }
        } else if (setting.type === 'number') {
            if (setting.configKey === 'mcpPort') {
                await this.configureMCPPort();
            } else {
                const value = await vscode.window.showInputBox({
                    prompt: `设置 ${setting.label}`,
                    value: String(setting.value)
                });
                if (value) {
                    await config.update(setting.configKey!, parseInt(value), true);
                    this.refresh();
                }
            }
        } else if (setting.type === 'string') {
            const isApiKey = setting.configKey?.includes('ApiKey');
            const value = await vscode.window.showInputBox({
                prompt: `设置 ${setting.label}`,
                value: setting.value || '',
                password: isApiKey
            });
            if (value !== undefined) {
                await config.update(setting.configKey!, value, true);
                this.refresh();
            }
        }
    }
}

export class SettingTreeItem extends vscode.TreeItem {
    children?: SettingTreeItem[];
    type?: 'boolean' | 'number' | 'string' | 'action';
    id?: string;
    
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly setting: SettingItem
    ) {
        super(label, collapsibleState);
        this.id = setting.id;
        this.type = setting.type;
        this.children = setting.children?.map(child => {
            const item = new SettingTreeItem(child.label, vscode.TreeItemCollapsibleState.None, child);
            item.description = child.description;
            item.iconPath = new vscode.ThemeIcon(child.icon?.replace(/\$\(|\)/g, '') || 'settings');
            item.contextValue = child.type;
            
            if (child.configKey) {
                item.command = {
                    command: 'workflowAgent.editSetting',
                    title: '编辑设置',
                    arguments: [child]
                };
            }
            return item;
        });
    }
}
