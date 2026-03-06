import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { NodeConfig } from '../../shared/types';

export interface NodeExternalConfig {
    nodeId: string;
    nodeType: string;
    configPath: string;
}

export class NodeConfigManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 获取节点配置文件的目录
     */
    private getWorkflowConfigDir(workflowPath: string): string {
        const workflowDir = path.dirname(workflowPath);
        const workflowName = path.basename(workflowPath, '.workflow.json');
        return path.join(workflowDir, `.${workflowName}.config`);
    }

    /**
     * 获取节点配置文件路径
     */
    private getNodeConfigPath(workflowPath: string, nodeId: string, nodeType: string): string {
        const configDir = this.getWorkflowConfigDir(workflowPath);
        
        switch (nodeType) {
            case 'code':
                return path.join(configDir, 'code', `${nodeId}.py`);
            case 'switch':
                return path.join(configDir, 'switch', `${nodeId}.json`);
            case 'llm':
                return path.join(configDir, 'llm', `${nodeId}.json`);
            default:
                return path.join(configDir, 'nodes', `${nodeId}.json`);
        }
    }

    /**
     * 确保配置目录存在
     */
    private async ensureConfigDir(configPath: string): Promise<void> {
        const dir = path.dirname(configPath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * 加载节点配置（从外部文件或内联数据）
     */
    async loadNodeConfig(workflowPath: string, node: NodeConfig): Promise<any> {
        const configPath = this.getNodeConfigPath(workflowPath, node.id, node.type);
        
        try {
            await fs.access(configPath);
            // 外部配置文件存在，从文件加载
            const content = await fs.readFile(configPath, 'utf-8');
            
            if (node.type === 'code') {
                // 代码节点返回代码字符串
                return { code: content, sourceFile: configPath };
            } else {
                // 其他节点返回解析后的 JSON
                return { ...JSON.parse(content), sourceFile: configPath };
            }
        } catch {
            // 外部配置文件不存在，使用内联数据
            return { ...node.data, sourceFile: null };
        }
    }

    /**
     * 保存节点配置到外部文件
     */
    async saveNodeConfig(workflowPath: string, node: NodeConfig): Promise<void> {
        if (!node.data) return;

        const configPath = this.getNodeConfigPath(workflowPath, node.id, node.type);
        await this.ensureConfigDir(configPath);

        let content: string;
        
        if (node.type === 'code') {
            // 代码节点保存为 Python 文件
            content = node.data.code || '# No code provided\n';
        } else if (node.type === 'switch') {
            // 条件分支节点保存分支逻辑
            const config = {
                conditions: node.data.conditions || [],
                defaultTarget: node.data.defaultTarget || 'default',
                description: node.data.description || ''
            };
            content = JSON.stringify(config, null, 2);
        } else if (node.type === 'llm') {
            // LLM 节点保存提示词配置
            const config = {
                model: node.data.model || 'gpt-4',
                systemPrompt: node.data.systemPrompt || '',
                userPrompt: node.data.userPrompt || '',
                temperature: node.data.temperature || 0.7,
                maxTokens: node.data.maxTokens || 2000,
                variables: node.data.variables || []
            };
            content = JSON.stringify(config, null, 2);
        } else {
            // 其他节点保存为通用 JSON
            content = JSON.stringify(node.data, null, 2);
        }

        await fs.writeFile(configPath, content, 'utf-8');
    }

    /**
     * 更新节点配置（从外部文件）
     */
    async updateNodeConfigFromFile(workflowPath: string, node: NodeConfig): Promise<NodeConfig> {
        const configPath = this.getNodeConfigPath(workflowPath, node.id, node.type);
        
        try {
            await fs.access(configPath);
            const content = await fs.readFile(configPath, 'utf-8');
            
            const updatedNode = { ...node };
            
            if (node.type === 'code') {
                updatedNode.data = { ...node.data, code: content };
            } else {
                updatedNode.data = { ...node.data, ...JSON.parse(content) };
            }
            
            return updatedNode;
        } catch {
            return node;
        }
    }

    /**
     * 打开节点配置文件进行编辑
     */
    async openNodeConfigFile(workflowPath: string, node: NodeConfig): Promise<void> {
        const configPath = this.getNodeConfigPath(workflowPath, node.id, node.type);
        
        // 确保文件存在
        try {
            await fs.access(configPath);
        } catch {
            await this.saveNodeConfig(workflowPath, node);
        }

        // 打开文件
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
    }

    /**
     * 删除节点配置文件
     */
    async deleteNodeConfig(workflowPath: string, nodeId: string, nodeType: string): Promise<void> {
        const configPath = this.getNodeConfigPath(workflowPath, nodeId, nodeType);
        try {
            await fs.unlink(configPath);
        } catch {
            // 文件不存在，忽略错误
        }
    }

    /**
     * 获取所有外部配置文件列表
     */
    async getExternalConfigs(workflowPath: string): Promise<NodeExternalConfig[]> {
        const configDir = this.getWorkflowConfigDir(workflowPath);
        const configs: NodeExternalConfig[] = [];

        try {
            const types = ['code', 'switch', 'llm', 'nodes'];
            
            for (const type of types) {
                const typeDir = path.join(configDir, type);
                try {
                    const files = await fs.readdir(typeDir);
                    for (const file of files) {
                        const nodeId = path.basename(file, path.extname(file));
                        configs.push({
                            nodeId,
                            nodeType: type === 'nodes' ? 'other' : type,
                            configPath: path.join(typeDir, file)
                        });
                    }
                } catch {
                    // 目录不存在，跳过
                }
            }
        } catch {
            // 配置目录不存在
        }

        return configs;
    }

    /**
     * 将内联配置迁移到外部文件
     */
    async migrateToExternalConfigs(workflowPath: string, nodes: NodeConfig[]): Promise<void> {
        for (const node of nodes) {
            if (node.type === 'code' || node.type === 'switch' || node.type === 'llm') {
                await this.saveNodeConfig(workflowPath, node);
            }
        }
    }
}
