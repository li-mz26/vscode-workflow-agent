import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow, NodeConfig, Edge, ExecutionResult } from '../../shared/types';
import { ExecutionEngine } from '../execution/ExecutionEngine';
import { NodeRegistry } from '../node/NodeRegistry';
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * MCP 工具属性定义接口
 */
interface MCPProperty {
    type: string;
    description: string;
    enum?: string[];
    default?: any;
    properties?: Record<string, MCPProperty>;
    items?: MCPProperty;
}

/**
 * MCP 工具定义接口
 */
interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, MCPProperty>;
        required?: string[];
    };
}

/**
 * MCP 服务器管理器 - 提供工作流操作的 MCP 接口
 * 
 * 支持的操作类别：
 * 1. 工作流管理 (CRUD)
 * 2. 节点操作 (增删改查)
 * 3. 连接操作 (边的管理)
 * 4. 执行控制 (运行/停止/调试)
 * 5. 模板和批量操作
 */
export class MCPServerManager {
    private workflowManager: WorkflowManager;
    private nodeRegistry: NodeRegistry;
    private isRunning = false;
    private executionEngines: Map<string, ExecutionEngine> = new Map();
    private activeExecutions: Map<string, { workflowId: string; startTime: Date }> = new Map();

    constructor(workflowManager: WorkflowManager) {
        this.workflowManager = workflowManager;
        this.nodeRegistry = new NodeRegistry();
    }

    // ============================================================
    // 工具定义
    // ============================================================
    
    private getTools(): MCPTool[] {
        return [
            // ===== 工作流管理 =====
            {
                name: 'workflow_list',
                description: '列出所有工作流。返回工作流摘要列表，包括名称、描述、节点数量等。',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'workflow_get',
                description: '获取工作流详细信息，包括所有节点和边的完整定义。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID或名称' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'workflow_create',
                description: '创建新的空白工作流。可选择从模板创建。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: '工作流名称' },
                        description: { type: 'string', description: '工作流描述' },
                        template: { 
                            type: 'string', 
                            enum: ['empty', 'basic', 'alert-handler', 'data-pipeline', 'api-orchestration'],
                            description: '工作流模板类型'
                        }
                    },
                    required: ['name']
                }
            },
            {
                name: 'workflow_delete',
                description: '删除指定的工作流。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'workflow_validate',
                description: '验证工作流结构是否正确，检查循环依赖、必需节点等。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'workflow_duplicate',
                description: '复制现有工作流创建副本。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '源工作流ID' },
                        newName: { type: 'string', description: '新工作流名称' }
                    },
                    required: ['workflowId', 'newName']
                }
            },

            // ===== 节点操作 =====
            {
                name: 'node_list',
                description: '列出工作流中的所有节点。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'node_get',
                description: '获取节点详细信息。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' }
                    },
                    required: ['workflowId', 'nodeId']
                }
            },
            {
                name: 'node_add',
                description: '向工作流添加新节点。支持所有节点类型：start(开始)、end(结束)、code(代码)、llm(LLM调用)、switch(条件分支)、parallel(并行)、merge(合并)、http(HTTP请求)、webhook(Webhook)。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        type: { 
                            type: 'string', 
                            enum: ['start', 'end', 'code', 'llm', 'switch', 'parallel', 'merge', 'http', 'webhook', 'schedule'],
                            description: '节点类型'
                        },
                        name: { type: 'string', description: '节点名称' },
                        position: {
                            type: 'object',
                            properties: {
                                x: { type: 'number', description: 'X坐标' },
                                y: { type: 'number', description: 'Y坐标' }
                            },
                            description: '节点位置（可选，自动布局如果不提供）'
                        },
                        config: { type: 'object', description: '节点配置（根据节点类型不同）' }
                    },
                    required: ['workflowId', 'type']
                }
            },
            {
                name: 'node_update',
                description: '更新节点配置。可以修改名称、位置、数据等。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' },
                        name: { type: 'string', description: '新名称' },
                        position: {
                            type: 'object',
                            properties: { x: { type: 'number', description: 'X坐标' }, y: { type: 'number', description: 'Y坐标' } },
                            description: '新位置'
                        },
                        config: { type: 'object', description: '更新配置' }
                    },
                    required: ['workflowId', 'nodeId']
                }
            },
            {
                name: 'node_delete',
                description: '删除节点及其所有连接。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' }
                    },
                    required: ['workflowId', 'nodeId']
                }
            },
            {
                name: 'node_types',
                description: '列出所有可用的节点类型及其配置说明。',
                inputSchema: { type: 'object', properties: {} }
            },

            // ===== 连接操作 =====
            {
                name: 'edge_list',
                description: '列出工作流中的所有连接（边）。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'edge_add',
                description: '创建节点之间的连接。switch节点的连接需要指定分支条件。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        sourceNodeId: { type: 'string', description: '源节点ID' },
                        sourcePort: { type: 'string', description: '源端口（默认output）' },
                        targetNodeId: { type: 'string', description: '目标节点ID' },
                        targetPort: { type: 'string', description: '目标端口（默认input）' }
                    },
                    required: ['workflowId', 'sourceNodeId', 'targetNodeId']
                }
            },
            {
                name: 'edge_delete',
                description: '删除节点之间的连接。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        edgeId: { type: 'string', description: '连接ID' }
                    },
                    required: ['workflowId', 'edgeId']
                }
            },

            // ===== 执行控制 =====
            {
                name: 'execution_run',
                description: '执行工作流。可以传入输入参数。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        inputs: { type: 'object', description: '工作流输入参数' }
                    },
                    required: ['workflowId']
                }
            },
            {
                name: 'execution_status',
                description: '查询工作流执行状态。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        executionId: { type: 'string', description: '执行ID（默认为工作流ID）' }
                    },
                    required: ['executionId']
                }
            },
            {
                name: 'execution_stop',
                description: '停止正在执行的工作流。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        executionId: { type: 'string', description: '执行ID' }
                    },
                    required: ['executionId']
                }
            },
            {
                name: 'execution_logs',
                description: '获取工作流执行日志。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        executionId: { type: 'string', description: '执行ID' }
                    },
                    required: ['executionId']
                }
            },

            // ===== 模板和快捷操作 =====
            {
                name: 'template_list',
                description: '列出可用的工作流模板。',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'template_create',
                description: '从模板创建完整工作流。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        templateName: { type: 'string', description: '模板名称' },
                        workflowName: { type: 'string', description: '新工作流名称' },
                        params: { type: 'object', description: '模板参数' }
                    },
                    required: ['templateName', 'workflowName']
                }
            },
            {
                name: 'batch_add_nodes',
                description: '批量添加多个节点和连接。适合一次性创建完整工作流。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodes: {
                            type: 'array',
                            description: '节点列表',
                            items: { type: 'object', description: '节点对象' }
                        },
                        edges: {
                            type: 'array',
                            description: '连接列表',
                            items: { type: 'object', description: '连接对象' }
                        }
                    },
                    required: ['workflowId', 'nodes']
                }
            },

            // ===== 节点配置快捷操作 =====
            {
                name: 'code_node_configure',
                description: '配置代码节点的Python代码。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' },
                        code: { type: 'string', description: 'Python代码' },
                        timeout: { type: 'number', description: '超时时间（秒）', default: 30 }
                    },
                    required: ['workflowId', 'nodeId', 'code']
                }
            },
            {
                name: 'llm_node_configure',
                description: '配置LLM节点。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' },
                        prompt: { type: 'string', description: '提示词模板' },
                        model: { type: 'string', description: '模型名称', default: 'gpt-4' },
                        temperature: { type: 'number', description: '温度参数', default: 0.7 },
                        maxTokens: { type: 'number', description: '最大输出token数', default: 1000 }
                    },
                    required: ['workflowId', 'nodeId', 'prompt']
                }
            },
            {
                name: 'switch_node_configure',
                description: '配置条件分支节点的分支规则。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' },
                        branches: {
                            type: 'array',
                            description: '分支列表',
                            items: {
                                type: 'object',
                                description: '分支配置',
                                properties: {
                                    name: { type: 'string', description: '分支名称' },
                                    condition: { type: 'string', description: '条件表达式' }
                                }
                            }
                        },
                        defaultBranch: { type: 'string', description: '默认分支名称' }
                    },
                    required: ['workflowId', 'nodeId', 'branches']
                }
            },
            {
                name: 'http_node_configure',
                description: '配置HTTP请求节点。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        workflowId: { type: 'string', description: '工作流ID' },
                        nodeId: { type: 'string', description: '节点ID' },
                        url: { type: 'string', description: '请求URL' },
                        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: '请求方法' },
                        headers: { type: 'object', description: '请求头' },
                        body: { type: 'object', description: '请求体' }
                    },
                    required: ['workflowId', 'nodeId', 'url']
                }
            }
        ];
    }

    // ============================================================
    // 工具执行
    // ============================================================

    private async callTool(name: string, args: any): Promise<any> {
        switch (name) {
            // ===== 工作流管理 =====
            case 'workflow_list':
                return this.workflowList();
            case 'workflow_get':
                return this.workflowGet(args.workflowId);
            case 'workflow_create':
                return this.workflowCreate(args.name, args.description, args.template);
            case 'workflow_delete':
                return this.workflowDelete(args.workflowId);
            case 'workflow_validate':
                return this.workflowValidate(args.workflowId);
            case 'workflow_duplicate':
                return this.workflowDuplicate(args.workflowId, args.newName);

            // ===== 节点操作 =====
            case 'node_list':
                return this.nodeList(args.workflowId);
            case 'node_get':
                return this.nodeGet(args.workflowId, args.nodeId);
            case 'node_add':
                return this.nodeAdd(args.workflowId, args.type, args.name, args.position, args.config);
            case 'node_update':
                return this.nodeUpdate(args.workflowId, args.nodeId, args);
            case 'node_delete':
                return this.nodeDelete(args.workflowId, args.nodeId);
            case 'node_types':
                return this.nodeTypes();

            // ===== 连接操作 =====
            case 'edge_list':
                return this.edgeList(args.workflowId);
            case 'edge_add':
                return this.edgeAdd(args.workflowId, args.sourceNodeId, args.sourcePort, args.targetNodeId, args.targetPort);
            case 'edge_delete':
                return this.edgeDelete(args.workflowId, args.edgeId);

            // ===== 执行控制 =====
            case 'execution_run':
                return this.executionRun(args.workflowId, args.inputs);
            case 'execution_status':
                return this.executionStatus(args.executionId);
            case 'execution_stop':
                return this.executionStop(args.executionId);
            case 'execution_logs':
                return this.executionLogs(args.executionId);

            // ===== 模板和快捷操作 =====
            case 'template_list':
                return this.templateList();
            case 'template_create':
                return this.templateCreate(args.templateName, args.workflowName, args.params);
            case 'batch_add_nodes':
                return this.batchAddNodes(args.workflowId, args.nodes, args.edges);

            // ===== 节点配置快捷操作 =====
            case 'code_node_configure':
                return this.codeNodeConfigure(args);
            case 'llm_node_configure':
                return this.llmNodeConfigure(args);
            case 'switch_node_configure':
                return this.switchNodeConfigure(args);
            case 'http_node_configure':
                return this.httpNodeConfigure(args);

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    // ============================================================
    // 工作流管理实现
    // ============================================================

    private async workflowList(): Promise<any> {
        const workflows = await this.workflowManager.listWorkflows();
        return {
            count: workflows.length,
            workflows: workflows.map(w => ({
                id: w.id,
                name: w.name,
                description: w.description,
                nodeCount: w.nodeCount,
                updatedAt: w.updatedAt
            }))
        };
    }

    private async workflowGet(workflowId: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }
        return { workflow };
    }

    private async workflowCreate(name: string, description?: string, template?: string): Promise<any> {
        if (template && template !== 'empty') {
            return this.templateCreate(template, name, { description });
        }

        const workflow = await this.workflowManager.createWorkflow({
            name,
            description: description || ''
        });

        return {
            success: true,
            workflow,
            message: `工作流 "${name}" 创建成功`
        };
    }

    private async workflowDelete(workflowId: string): Promise<any> {
        await this.workflowManager.deleteWorkflow(workflowId);
        return { success: true, message: '工作流已删除' };
    }

    private async workflowValidate(workflowId: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }
        
        const result = this.workflowManager.validateWorkflow(workflow);
        return {
            valid: result.valid,
            errors: result.errors,
            warnings: this.getWorkflowWarnings(workflow)
        };
    }

    private getWorkflowWarnings(workflow: Workflow): string[] {
        const warnings: string[] = [];
        
        // 检查孤立节点
        const connectedNodeIds = new Set<string>();
        for (const edge of workflow.edges) {
            connectedNodeIds.add(edge.source.nodeId);
            connectedNodeIds.add(edge.target.nodeId);
        }
        
        for (const node of workflow.nodes) {
            if (!connectedNodeIds.has(node.id) && node.type !== 'start' && node.type !== 'end') {
                warnings.push(`节点 "${node.metadata?.name || node.id}" 未连接到任何其他节点`);
            }
        }
        
        // 检查缺少配置的节点
        for (const node of workflow.nodes) {
            if (node.type === 'code' && !node.data?.code) {
                warnings.push(`代码节点 "${node.metadata?.name || node.id}" 缺少代码配置`);
            }
            if (node.type === 'llm' && !node.data?.prompt) {
                warnings.push(`LLM节点 "${node.metadata?.name || node.id}" 缺少提示词配置`);
            }
        }
        
        return warnings;
    }

    private async workflowDuplicate(workflowId: string, newName: string): Promise<any> {
        const source = await this.workflowManager.getWorkflow(workflowId);
        if (!source) {
            throw new Error(`源工作流未找到: ${workflowId}`);
        }

        const newWorkflow = await this.workflowManager.createWorkflow({
            name: newName,
            description: source.description,
            nodes: source.nodes.map(n => ({ ...n, id: `${n.id}_copy` })),
            edges: source.edges.map(e => ({
                ...e,
                id: `${e.id}_copy`,
                source: { ...e.source, nodeId: `${e.source.nodeId}_copy` },
                target: { ...e.target, nodeId: `${e.target.nodeId}_copy` }
            })),
            variables: source.variables,
            settings: source.settings
        });

        return {
            success: true,
            workflow: newWorkflow,
            message: `工作流已复制为 "${newName}"`
        };
    }

    // ============================================================
    // 节点操作实现
    // ============================================================

    private async nodeList(workflowId: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }

        return {
            count: workflow.nodes.length,
            nodes: workflow.nodes.map(n => ({
                id: n.id,
                type: n.type,
                name: n.metadata?.name || n.type,
                position: n.position
            }))
        };
    }

    private async nodeGet(workflowId: string, nodeId: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }

        const node = workflow.nodes.find(n => n.id === nodeId);
        if (!node) {
            throw new Error(`节点未找到: ${nodeId}`);
        }

        return { node };
    }

    private async nodeAdd(
        workflowId: string, 
        type: string, 
        name?: string, 
        position?: { x: number; y: number },
        config?: any
    ): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }

        // 自动计算位置（如果没有提供）
        if (!position) {
            const maxX = Math.max(...workflow.nodes.map(n => n.position.x), 0);
            position = { x: maxX + 250, y: 200 };
        }

        // 使用 NodeRegistry 创建节点
        const node = this.nodeRegistry.createNode(type, position);
        
        // 设置名称
        if (name) {
            node.metadata = { ...node.metadata, name };
        }
        
        // 合并配置
        if (config) {
            node.data = { ...node.data, ...config };
        }

        await this.workflowManager.addNode(workflowId, node);

        return {
            success: true,
            node,
            message: `节点 "${name || type}" 已添加`
        };
    }

    private async nodeUpdate(workflowId: string, nodeId: string, updates: any): Promise<any> {
        const updateData: any = {};
        
        if (updates.name) {
            updateData.metadata = { name: updates.name };
        }
        if (updates.position) {
            updateData.position = updates.position;
        }
        if (updates.config) {
            updateData.data = updates.config;
        }

        const node = await this.workflowManager.updateNode(workflowId, nodeId, updateData);
        
        return {
            success: true,
            node,
            message: `节点已更新`
        };
    }

    private async nodeDelete(workflowId: string, nodeId: string): Promise<any> {
        await this.workflowManager.deleteNode(workflowId, nodeId);
        return { success: true, message: '节点已删除' };
    }

    private nodeTypes(): any {
        return {
            types: [
                {
                    type: 'start',
                    name: '开始节点',
                    description: '工作流的入口点',
                    category: 'control',
                    configSchema: { triggerType: { type: 'string', enum: ['manual', 'schedule', 'webhook'] } }
                },
                {
                    type: 'end',
                    name: '结束节点',
                    description: '工作流的出口点',
                    category: 'control',
                    configSchema: { outputMapping: { type: 'object' } }
                },
                {
                    type: 'code',
                    name: '代码节点',
                    description: '执行 Python 代码',
                    category: 'action',
                    configSchema: {
                        code: { type: 'string', description: 'Python 代码' },
                        timeout: { type: 'number', default: 30 }
                    }
                },
                {
                    type: 'llm',
                    name: 'LLM 节点',
                    description: '调用大语言模型进行文本分析、生成等',
                    category: 'action',
                    configSchema: {
                        prompt: { type: 'string', description: '提示词模板，可用 {{变量}} 引用输入' },
                        model: { type: 'string', default: 'gpt-4' },
                        temperature: { type: 'number', default: 0.7 },
                        maxTokens: { type: 'number', default: 1000 }
                    }
                },
                {
                    type: 'switch',
                    name: '条件分支',
                    description: '根据条件选择不同的执行路径',
                    category: 'flow',
                    configSchema: {
                        conditions: { type: 'array', description: '条件列表，每个条件包含 name 和 expression' },
                        defaultTarget: { type: 'string', description: '默认分支名称' }
                    }
                },
                {
                    type: 'parallel',
                    name: '并行节点',
                    description: '并行执行多个分支',
                    category: 'flow',
                    configSchema: {}
                },
                {
                    type: 'merge',
                    name: '合并节点',
                    description: '合并多个分支的结果',
                    category: 'flow',
                    configSchema: { strategy: { type: 'string', enum: ['all', 'any', 'race'] } }
                },
                {
                    type: 'http',
                    name: 'HTTP 请求',
                    description: '发起 HTTP 请求',
                    category: 'action',
                    configSchema: {
                        url: { type: 'string' },
                        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
                        headers: { type: 'object' },
                        body: { type: 'object' }
                    }
                },
                {
                    type: 'webhook',
                    name: 'Webhook',
                    description: '发送 Webhook 通知',
                    category: 'action',
                    configSchema: {
                        url: { type: 'string' },
                        method: { type: 'string' },
                        payload: { type: 'object' }
                    }
                },
                {
                    type: 'schedule',
                    name: '定时触发',
                    description: '定时触发工作流执行',
                    category: 'trigger',
                    configSchema: {
                        cron: { type: 'string', description: 'Cron 表达式' },
                        timezone: { type: 'string', default: 'UTC' }
                    }
                }
            ]
        };
    }

    // ============================================================
    // 连接操作实现
    // ============================================================

    private async edgeList(workflowId: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }

        return {
            count: workflow.edges.length,
            edges: workflow.edges.map(e => ({
                id: e.id,
                from: `${e.source.nodeId}:${e.source.portId}`,
                to: `${e.target.nodeId}:${e.target.portId}`
            }))
        };
    }

    private async edgeAdd(
        workflowId: string,
        sourceNodeId: string,
        sourcePort: string = 'output',
        targetNodeId: string,
        targetPort: string = 'input'
    ): Promise<any> {
        const edge: Edge = {
            id: `edge_${Date.now()}`,
            source: { nodeId: sourceNodeId, portId: sourcePort },
            target: { nodeId: targetNodeId, portId: targetPort }
        };

        await this.workflowManager.addEdge(workflowId, edge);

        return {
            success: true,
            edge,
            message: `已连接 ${sourceNodeId} -> ${targetNodeId}`
        };
    }

    private async edgeDelete(workflowId: string, edgeId: string): Promise<any> {
        await this.workflowManager.deleteEdge(workflowId, edgeId);
        return { success: true, message: '连接已删除' };
    }

    // ============================================================
    // 执行控制实现
    // ============================================================

    private async executionRun(workflowId: string, inputs?: any): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`工作流未找到: ${workflowId}`);
        }

        // 获取工作流目录（用于加载外部配置）
        const workflowDir = workflow.filePath ? path.dirname(workflow.filePath) : process.cwd();

        const engine = new ExecutionEngine(workflow, workflowDir);
        this.executionEngines.set(workflowId, engine);
        this.activeExecutions.set(workflowId, { workflowId, startTime: new Date() });

        const result = await engine.start(inputs);

        // 执行完成后清理
        this.executionEngines.delete(workflowId);
        this.activeExecutions.delete(workflowId);

        return {
            executionId: workflowId,
            success: result.success,
            outputs: result.outputs,
            duration: result.duration,
            logs: result.logs.slice(-10) // 返回最后10条日志
        };
    }

    private executionStatus(executionId: string): any {
        const engine = this.executionEngines.get(executionId);
        if (!engine) {
            return { status: 'not_found', message: '执行未找到' };
        }

        const execInfo = this.activeExecutions.get(executionId);

        return {
            status: engine.getState(),
            currentNode: engine.getCurrentNode(),
            variables: engine.getVariables(),
            startTime: execInfo?.startTime,
            duration: execInfo ? Date.now() - execInfo.startTime.getTime() : 0
        };
    }

    private executionStop(executionId: string): any {
        const engine = this.executionEngines.get(executionId);
        if (!engine) {
            return { success: false, message: '执行未找到' };
        }

        engine.stop();
        return { success: true, message: '执行已停止' };
    }

    private executionLogs(executionId: string): any {
        const engine = this.executionEngines.get(executionId);
        if (!engine) {
            return { logs: [], message: '执行未找到' };
        }

        return { logs: engine.getLogs() };
    }

    // ============================================================
    // 模板实现
    // ============================================================

    private templateList(): any {
        return {
            templates: [
                {
                    name: 'basic',
                    description: '基础工作流：开始 -> 代码处理 -> 结束',
                    nodes: 3,
                    useCase: '简单的数据处理或脚本执行'
                },
                {
                    name: 'alert-handler',
                    description: '告警处理工作流：接收告警 -> 分析 -> 分级处理 -> 通知',
                    nodes: 6,
                    useCase: '运维告警自动化处理'
                },
                {
                    name: 'data-pipeline',
                    description: '数据管道：数据获取 -> 转换 -> LLM处理 -> 存储',
                    nodes: 5,
                    useCase: '数据处理和分析流程'
                },
                {
                    name: 'api-orchestration',
                    description: 'API 编排：并行调用多个API -> 合并结果 -> 返回',
                    nodes: 5,
                    useCase: '微服务API编排'
                }
            ]
        };
    }

    private async templateCreate(templateName: string, workflowName: string, params?: any): Promise<any> {
        const templates: Record<string, () => Promise<any>> = {
            'basic': () => this.createBasicTemplate(workflowName, params),
            'alert-handler': () => this.createAlertHandlerTemplate(workflowName, params),
            'data-pipeline': () => this.createDataPipelineTemplate(workflowName, params),
            'api-orchestration': () => this.createApiOrchestrationTemplate(workflowName, params)
        };

        const creator = templates[templateName];
        if (!creator) {
            throw new Error(`模板未找到: ${templateName}`);
        }

        return creator();
    }

    private async createBasicTemplate(name: string, params?: any): Promise<any> {
        const workflow = await this.workflowManager.createWorkflow({
            name,
            description: '基础工作流模板'
        });

        // 基础模板：start -> code -> end
        const nodes = [
            { id: 'start', type: 'start', position: { x: 100, y: 200 }, name: '开始' },
            { id: 'process', type: 'code', position: { x: 350, y: 200 }, name: '处理数据' },
            { id: 'end', type: 'end', position: { x: 600, y: 200 }, name: '结束' }
        ];

        const edges = [
            { source: 'start', target: 'process' },
            { source: 'process', target: 'end' }
        ];

        return this.addNodesAndEdges(workflow.id, nodes, edges);
    }

    private async createAlertHandlerTemplate(name: string, params?: any): Promise<any> {
        const workflow = await this.workflowManager.createWorkflow({
            name,
            description: '告警处理工作流模板'
        });

        const nodes = [
            { id: 'start', type: 'start', position: { x: 100, y: 300 }, name: '接收告警' },
            { id: 'parse', type: 'code', position: { x: 300, y: 300 }, name: '解析告警' },
            { id: 'analyze', type: 'llm', position: { x: 500, y: 300 }, name: '智能分析' },
            { id: 'switch', type: 'switch', position: { x: 700, y: 300 }, name: '分级处理' },
            { id: 'notify', type: 'webhook', position: { x: 900, y: 300 }, name: '发送通知' },
            { id: 'end', type: 'end', position: { x: 1100, y: 300 }, name: '结束' }
        ];

        const edges = [
            { source: 'start', target: 'parse' },
            { source: 'parse', target: 'analyze' },
            { source: 'analyze', target: 'switch' },
            { source: 'switch', sourcePort: 'high', target: 'notify' },
            { source: 'switch', sourcePort: 'medium', target: 'notify' },
            { source: 'switch', sourcePort: 'low', target: 'end' },
            { source: 'notify', target: 'end' }
        ];

        return this.addNodesAndEdges(workflow.id, nodes, edges);
    }

    private async createDataPipelineTemplate(name: string, params?: any): Promise<any> {
        const workflow = await this.workflowManager.createWorkflow({
            name,
            description: '数据管道工作流模板'
        });

        const nodes = [
            { id: 'start', type: 'start', position: { x: 100, y: 300 }, name: '开始' },
            { id: 'fetch', type: 'http', position: { x: 300, y: 300 }, name: '获取数据' },
            { id: 'transform', type: 'code', position: { x: 500, y: 300 }, name: '数据转换' },
            { id: 'llm', type: 'llm', position: { x: 700, y: 300 }, name: 'LLM处理' },
            { id: 'end', type: 'end', position: { x: 900, y: 300 }, name: '输出结果' }
        ];

        const edges = [
            { source: 'start', target: 'fetch' },
            { source: 'fetch', target: 'transform' },
            { source: 'transform', target: 'llm' },
            { source: 'llm', target: 'end' }
        ];

        return this.addNodesAndEdges(workflow.id, nodes, edges);
    }

    private async createApiOrchestrationTemplate(name: string, params?: any): Promise<any> {
        const workflow = await this.workflowManager.createWorkflow({
            name,
            description: 'API编排工作流模板'
        });

        const nodes = [
            { id: 'start', type: 'start', position: { x: 100, y: 300 }, name: '开始' },
            { id: 'parallel', type: 'parallel', position: { x: 300, y: 300 }, name: '并行调用' },
            { id: 'api1', type: 'http', position: { x: 500, y: 150 }, name: 'API 1' },
            { id: 'api2', type: 'http', position: { x: 500, y: 300 }, name: 'API 2' },
            { id: 'api3', type: 'http', position: { x: 500, y: 450 }, name: 'API 3' },
            { id: 'merge', type: 'merge', position: { x: 700, y: 300 }, name: '合并结果' },
            { id: 'end', type: 'end', position: { x: 900, y: 300 }, name: '返回结果' }
        ];

        const edges = [
            { source: 'start', target: 'parallel' },
            { source: 'parallel', target: 'api1' },
            { source: 'parallel', target: 'api2' },
            { source: 'parallel', target: 'api3' },
            { source: 'api1', target: 'merge' },
            { source: 'api2', target: 'merge' },
            { source: 'api3', target: 'merge' },
            { source: 'merge', target: 'end' }
        ];

        return this.addNodesAndEdges(workflow.id, nodes, edges);
    }

    private async addNodesAndEdges(workflowId: string, nodes: any[], edges: any[]): Promise<any> {
        // 添加节点
        for (const n of nodes) {
            const node = this.nodeRegistry.createNode(n.type, n.position);
            if (n.name) {
                node.metadata = { ...node.metadata, name: n.name };
            }
            await this.workflowManager.addNode(workflowId, node);
        }

        // 获取创建后的工作流以获取正确的节点ID
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) throw new Error('工作流创建失败');

        // 创建 ID 映射
        const nodeIdMap = new Map<string, string>();
        for (let i = 0; i < nodes.length; i++) {
            nodeIdMap.set(nodes[i].id, workflow.nodes[i].id);
        }

        // 添加边
        for (const e of edges) {
            const edge: Edge = {
                id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                source: {
                    nodeId: nodeIdMap.get(e.source)!,
                    portId: e.sourcePort || 'output'
                },
                target: {
                    nodeId: nodeIdMap.get(e.target)!,
                    portId: e.targetPort || 'input'
                }
            };
            await this.workflowManager.addEdge(workflowId, edge);
        }

        const finalWorkflow = await this.workflowManager.getWorkflow(workflowId);

        return {
            success: true,
            workflow: finalWorkflow,
            message: `工作流已创建，包含 ${nodes.length} 个节点和 ${edges.length} 个连接`
        };
    }

    // ============================================================
    // 批量操作实现
    // ============================================================

    private async batchAddNodes(workflowId: string, nodes: any[], edges?: any[]): Promise<any> {
        const addedNodes: any[] = [];

        for (const n of nodes) {
            const node = await this.nodeAdd(workflowId, n.type, n.name, n.position, n.config);
            addedNodes.push(node.node);
        }

        const addedEdges: any[] = [];
        if (edges && edges.length > 0) {
            const workflow = await this.workflowManager.getWorkflow(workflowId);
            if (workflow) {
                // 创建节点索引映射
                const nodeIndexMap = new Map<number, string>();
                workflow.nodes.forEach((n, i) => nodeIndexMap.set(i, n.id));

                for (const e of edges) {
                    const sourceId = typeof e.sourceIndex === 'number' 
                        ? nodeIndexMap.get(e.sourceIndex) 
                        : e.sourceNodeId;
                    const targetId = typeof e.targetIndex === 'number' 
                        ? nodeIndexMap.get(e.targetIndex) 
                        : e.targetNodeId;

                    if (sourceId && targetId) {
                        const edge = await this.edgeAdd(workflowId, sourceId, e.sourcePort, targetId, e.targetPort);
                        addedEdges.push(edge.edge);
                    }
                }
            }
        }

        return {
            success: true,
            nodes: addedNodes,
            edges: addedEdges,
            message: `已添加 ${addedNodes.length} 个节点和 ${addedEdges.length} 个连接`
        };
    }

    // ============================================================
    // 节点配置快捷操作实现
    // ============================================================

    private async codeNodeConfigure(args: any): Promise<any> {
        return this.nodeUpdate(args.workflowId, args.nodeId, {
            config: {
                code: args.code,
                timeout: args.timeout || 30
            }
        });
    }

    private async llmNodeConfigure(args: any): Promise<any> {
        return this.nodeUpdate(args.workflowId, args.nodeId, {
            config: {
                prompt: args.prompt,
                model: args.model || 'gpt-4',
                temperature: args.temperature || 0.7,
                maxTokens: args.maxTokens || 1000
            }
        });
    }

    private async switchNodeConfigure(args: any): Promise<any> {
        return this.nodeUpdate(args.workflowId, args.nodeId, {
            config: {
                conditions: args.branches,
                defaultTarget: args.defaultBranch || 'default'
            }
        });
    }

    private async httpNodeConfigure(args: any): Promise<any> {
        return this.nodeUpdate(args.workflowId, args.nodeId, {
            config: {
                url: args.url,
                method: args.method || 'GET',
                headers: args.headers,
                body: args.body
            }
        });
    }

    // ============================================================
    // MCP 协议实现
    // ============================================================

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        // 发送初始化消息
        this.sendMessage({
            jsonrpc: '2.0',
            id: 0,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                },
                serverInfo: {
                    name: 'vscode-workflow-agent',
                    version: '1.0.0'
                }
            }
        });

        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (data) => {
            this.handleRequest(data.toString());
        });

        process.stdin.on('end', () => this.stop());
    }

    stop(): void {
        this.isRunning = false;
    }

    private sendMessage(message: any): void {
        console.log(JSON.stringify(message));
    }

    private async handleRequest(data: string): Promise<void> {
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const request = JSON.parse(line);
                const response = await this.processRequest(request);
                if (response) {
                    this.sendMessage(response);
                }
            } catch (error) {
                this.sendMessage({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: 'Parse error'
                    }
                });
            }
        }
    }

    private async processRequest(request: any): Promise<any> {
        const { method, params, id } = request;

        try {
            let result: any;

            switch (method) {
                case 'tools/list':
                    result = { tools: this.getTools() };
                    break;
                case 'tools/call':
                    result = await this.callTool(params.name, params.arguments);
                    break;

                case 'resources/list':
                    result = this.listResources();
                    break;
                case 'resources/read':
                    result = await this.readResource(params.uri);
                    break;

                case 'prompts/list':
                    result = this.listPrompts();
                    break;
                case 'prompts/get':
                    result = this.getPrompt(params.name);
                    break;

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return { jsonrpc: '2.0', id, result };
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: (error as Error).message
                }
            };
        }
    }

    private listResources(): any {
        return {
            resources: [
                { uri: 'workflow://list', name: '所有工作流', mimeType: 'application/json' },
                { uri: 'node-types://definitions', name: '节点类型定义', mimeType: 'application/json' },
                { uri: 'template://list', name: '工作流模板', mimeType: 'application/json' }
            ]
        };
    }

    private async readResource(uri: string): Promise<any> {
        if (uri === 'workflow://list') {
            return this.workflowList();
        }
        if (uri === 'node-types://definitions') {
            return this.nodeTypes();
        }
        if (uri === 'template://list') {
            return this.templateList();
        }
        if (uri.startsWith('workflow://')) {
            const id = uri.replace('workflow://', '');
            return this.workflowGet(id);
        }
        throw new Error(`Unknown resource: ${uri}`);
    }

    private listPrompts(): any {
        return {
            prompts: [
                {
                    name: 'workflow_designer',
                    description: '工作流设计助手 - 帮助设计和创建工作流'
                },
                {
                    name: 'workflow_optimizer',
                    description: '工作流优化助手 - 分析和优化现有工作流'
                }
            ]
        };
    }

    private getPrompt(name: string): any {
        const prompts: Record<string, any> = {
            workflow_designer: {
                messages: [{
                    role: 'system',
                    content: `你是一个工作流设计专家。帮助用户设计和创建自动化工作流。

你可以使用以下工具：
- workflow_create: 创建新工作流
- node_add: 添加节点
- edge_add: 连接节点
- template_create: 从模板创建
- batch_add_nodes: 批量添加节点

设计工作流时请考虑：
1. 明确工作流的目标和输入输出
2. 选择合适的节点类型
3. 设计清晰的执行路径
4. 添加必要的错误处理`
                }]
            },
            workflow_optimizer: {
                messages: [{
                    role: 'system',
                    content: `你是一个工作流优化专家。帮助用户分析和改进现有工作流。

优化建议可能包括：
- 性能优化：并行化、减少冗余节点
- 可靠性优化：添加重试、超时配置
- 可读性优化：合理命名、添加注释
- 结构优化：模块化、复用`
                }]
            }
        };

        if (!prompts[name]) throw new Error(`Prompt not found: ${name}`);
        return { messages: prompts[name].messages };
    }
}