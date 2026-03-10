import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
    NodeConfig,
    CodeNodeConfig,
    LLMNodeConfig,
    SwitchNodeConfig,
    HTTPNodeConfig,
    NODE_CONFIG_EXTENSIONS
} from '../../shared/types';

/**
 * 节点外部配置信息
 */
export interface NodeExternalConfig {
    nodeId: string;
    nodeType: string;
    configPath: string;
    exists: boolean;
}

/**
 * 节点配置管理器
 *
 * 负责管理节点的外部配置文件：
 * - workflow.json 中的节点通过 configRef 引用外部配置文件
 * - 配置文件存放在 workflow.json 同级的 nodes/ 目录下
 * - 文件命名: {nodeType}_{nodeId}.{ext}
 *
 * 目录结构示例:
 * ```
 * my-workflow/
 * ├── my-workflow.workflow.json
 * └── nodes/
 *     ├── code_node_001.py
 *     ├── llm_node_002.json
 *     └── switch_node_003.json
 * ```
 */
export class NodeConfigManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 获取节点配置文件目录（nodes/）
     * 配置文件存放在工作流文件同级的 nodes 目录下
     */
    private getNodesDir(workflowPath: string): string {
        const workflowDir = path.dirname(workflowPath);
        return path.join(workflowDir, 'nodes');
    }

    /**
     * 获取节点配置文件路径
     * 格式: nodes/{nodeType}_{nodeId}.{ext}
     */
    getNodeConfigPath(workflowPath: string, nodeId: string, nodeType: string): string {
        const nodesDir = this.getNodesDir(workflowPath);
        const ext = NODE_CONFIG_EXTENSIONS[nodeType] || '.json';
        // 使用简短的节点 ID（去掉前缀）
        const shortId = this.getShortNodeId(nodeId);
        const fileName = `${nodeType}_${shortId}${ext}`;
        return path.join(nodesDir, fileName);
    }

    /**
     * 获取简短的节点 ID（用于文件命名）
     */
    private getShortNodeId(nodeId: string): string {
        // 如果 nodeId 是 "node_xxx_123" 格式，提取最后部分
        const parts = nodeId.split('_');
        if (parts.length >= 3) {
            return parts.slice(-2).join('_');
        }
        return nodeId;
    }

    /**
     * 确保目录存在
     */
    private async ensureDir(dirPath: string): Promise<void> {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    /**
     * 加载节点配置（从外部文件）
     * 如果外部文件不存在，返回节点内联数据
     */
    async loadNodeConfig(workflowPath: string, node: NodeConfig): Promise<Record<string, any>> {
        // 优先使用 configRef 指定的路径
        const configPath = node.configRef
            ? path.resolve(path.dirname(workflowPath), node.configRef)
            : this.getNodeConfigPath(workflowPath, node.id, node.type);

        try {
            await fs.access(configPath);
            const content = await fs.readFile(configPath, 'utf-8');

            if (node.type === 'code') {
                // Code 节点：返回代码内容
                return {
                    code: content,
                    sourceFile: configPath,
                    timeout: 30
                };
            } else {
                // 其他节点：解析 JSON
                const config = JSON.parse(content);
                return {
                    ...config,
                    sourceFile: configPath
                };
            }
        } catch {
            // 外部文件不存在，返回内联数据
            return {
                ...node.data,
                sourceFile: null
            };
        }
    }

    /**
     * 保存节点配置到外部文件
     */
    async saveNodeConfig(workflowPath: string, node: NodeConfig): Promise<string> {
        const configPath = this.getNodeConfigPath(workflowPath, node.id, node.type);
        await this.ensureDir(path.dirname(configPath));

        let content: string;

        switch (node.type) {
            case 'code':
                content = this.generateCodeFileContent(node);
                break;
            case 'llm':
                content = this.generateLLMConfigContent(node);
                break;
            case 'switch':
                content = this.generateSwitchConfigContent(node);
                break;
            case 'http':
                content = this.generateHTTPConfigContent(node);
                break;
            case 'webhook':
                content = this.generateWebhookConfigContent(node);
                break;
            default:
                content = JSON.stringify(node.data || {}, null, 2);
        }

        await fs.writeFile(configPath, content, 'utf-8');
        return configPath;
    }

    /**
     * 生成 Code 节点文件内容
     */
    private generateCodeFileContent(node: NodeConfig): string {
        const data = node.data as CodeNodeConfig || {};
        const code = data.code || '# No code provided\npass\n';
        const description = node.metadata?.description || data.description || '';

        return `# -*- coding: utf-8 -*-
# Node ID: ${node.id}
# Type: code
# Name: ${node.metadata?.name || 'Code Node'}
${description ? `# Description: ${description}` : ''}

def main(ctx):
    """
    节点主函数

    参数:
        ctx: 执行上下文对象
            - ctx.input: 输入数据
            - ctx.variables: 工作流变量字典

    返回:
        处理结果，将传递给下游节点
    """
${code.split('\n').map((line: string) => '    ' + line).join('\n')}
`;
    }

    /**
     * 生成 LLM 节点配置文件内容
     */
    private generateLLMConfigContent(node: NodeConfig): string {
        const data: Partial<LLMNodeConfig> = node.data || {};
        const config: LLMNodeConfig = {
            model: data.model || 'gpt-4',
            systemPrompt: data.systemPrompt || '',
            userPrompt: data.userPrompt || '',
            temperature: data.temperature ?? 0.7,
            maxTokens: data.maxTokens ?? 2000,
            variables: data.variables || [],
            description: node.metadata?.description || data.description || ''
        };
        return JSON.stringify(config, null, 2);
    }

    /**
     * 生成 Switch 节点配置文件内容
     */
    private generateSwitchConfigContent(node: NodeConfig): string {
        const data: Partial<SwitchNodeConfig> = node.data || {};
        const config: SwitchNodeConfig = {
            conditions: data.conditions || [],
            defaultTarget: data.defaultTarget || 'default',
            description: node.metadata?.description || data.description || ''
        };
        return JSON.stringify(config, null, 2);
    }

    /**
     * 生成 HTTP 节点配置文件内容
     */
    private generateHTTPConfigContent(node: NodeConfig): string {
        const data: Partial<HTTPNodeConfig> = node.data || {};
        const config: HTTPNodeConfig = {
            method: data.method || 'GET',
            url: data.url || '',
            headers: data.headers || {},
            body: data.body,
            timeout: data.timeout ?? 30000,
            retryCount: data.retryCount ?? 0,
            description: node.metadata?.description || data.description || ''
        };
        return JSON.stringify(config, null, 2);
    }

    /**
     * 生成 Webhook 节点配置文件内容
     */
    private generateWebhookConfigContent(node: NodeConfig): string {
        const data = node.data || {};
        const config = {
            provider: data.provider || 'generic',
            webhookUrl: data.webhookUrl || '',
            title: data.title || '',
            message: data.message || '',
            severity: data.severity || 'info',
            description: node.metadata?.description || data.description || ''
        };
        return JSON.stringify(config, null, 2);
    }

    /**
     * 删除节点配置文件
     */
    async deleteNodeConfig(workflowPath: string, nodeId: string, nodeType: string): Promise<void> {
        const configPath = this.getNodeConfigPath(workflowPath, nodeId, nodeType);
        try {
            await fs.unlink(configPath);
        } catch {
            // 文件不存在，忽略
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
     * 获取工作流所有外部配置文件列表
     */
    async getExternalConfigs(workflowPath: string): Promise<NodeExternalConfig[]> {
        const nodesDir = this.getNodesDir(workflowPath);
        const configs: NodeExternalConfig[] = [];

        try {
            const files = await fs.readdir(nodesDir);

            for (const file of files) {
                const match = file.match(/^(\w+)_(.+)(\.\w+)$/);
                if (match) {
                    const nodeType = match[1];
                    const nodeId = match[2];
                    const configPath = path.join(nodesDir, file);

                    configs.push({
                        nodeId,
                        nodeType,
                        configPath,
                        exists: true
                    });
                }
            }
        } catch {
            // 目录不存在
        }

        return configs;
    }

    /**
     * 将工作流中的节点配置迁移到外部文件
     */
    async migrateToExternalConfigs(workflowPath: string, nodes: NodeConfig[]): Promise<Map<string, string>> {
        const configRefMap = new Map<string, string>();

        for (const node of nodes) {
            // 只为需要外部配置的节点类型创建文件
            if (['code', 'llm', 'switch', 'http', 'webhook'].includes(node.type)) {
                const configPath = await this.saveNodeConfig(workflowPath, node);
                // 生成相对路径
                const relativePath = path.relative(path.dirname(workflowPath), configPath);
                configRefMap.set(node.id, relativePath);
            }
        }

        return configRefMap;
    }

    /**
     * 同步外部配置到节点数据
     * 当外部文件被修改后，更新节点的 data 字段
     */
    async syncExternalConfigToNode(workflowPath: string, node: NodeConfig): Promise<NodeConfig> {
        const config = await this.loadNodeConfig(workflowPath, node);

        return {
            ...node,
            data: config
        };
    }

    /**
     * 验证节点配置文件
     */
    async validateNodeConfig(workflowPath: string, node: NodeConfig): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            const config = await this.loadNodeConfig(workflowPath, node);

            switch (node.type) {
                case 'code':
                    if (!config.code || config.code.trim() === '') {
                        errors.push('代码不能为空');
                    }
                    break;
                case 'llm':
                    if (!config.model) {
                        errors.push('必须指定模型');
                    }
                    break;
                case 'switch':
                    if (!config.conditions || config.conditions.length === 0) {
                        errors.push('至少需要一个条件分支');
                    }
                    break;
                case 'http':
                    if (!config.url) {
                        errors.push('必须指定 URL');
                    }
                    break;
                case 'webhook':
                    if (!config.webhookUrl) {
                        errors.push('必须指定 Webhook URL');
                    }
                    break;
            }
        } catch (error) {
            errors.push(`配置加载失败: ${(error as Error).message}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}