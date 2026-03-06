#!/usr/bin/env node
/**
 * 独立的 MCP Server 测试脚本
 * 不依赖 VSCode 环境，使用内存中的 WorkflowManager
 */

const { EventEmitter } = require('events');

// 简化的 WorkflowManager (内存存储)
class WorkflowManager extends EventEmitter {
    constructor() {
        super();
        this.workflows = new Map();
        this.nodeRegistry = new Map([
            ['start', { type: 'start', inputs: [], outputs: [{ id: 'trigger', name: 'trigger' }] }],
            ['end', { type: 'end', inputs: [{ id: 'result', name: 'result' }], outputs: [] }],
            ['code', { type: 'code', inputs: [{ id: 'input', name: 'input' }], outputs: [{ id: 'output', name: 'output' }] }],
            ['llm', { type: 'llm', inputs: [{ id: 'prompt', name: 'prompt' }, { id: 'context', name: 'context' }], outputs: [{ id: 'content', name: 'content' }, { id: 'usage', name: 'usage' }] }],
            ['switch', { type: 'switch', inputs: [{ id: 'input', name: 'input' }], outputs: [] }],  // 动态输出
            ['parallel', { type: 'parallel', inputs: [{ id: 'input', name: 'input' }], outputs: [] }],  // 动态输出
            ['merge', { type: 'merge', inputs: [], outputs: [{ id: 'result', name: 'result' }] }],  // 动态输入
            ['http', { type: 'http', inputs: [{ id: 'input', name: 'input' }], outputs: [{ id: 'status', name: 'status' }, { id: 'body', name: 'body' }, { id: 'json', name: 'json' }] }],
            ['webhook', { type: 'webhook', inputs: [{ id: 'input', name: 'input' }], outputs: [{ id: 'sent', name: 'sent' }] }],
            ['schedule', { type: 'schedule', inputs: [], outputs: [{ id: 'trigger', name: 'trigger' }] }]
        ]);
    }

    async createWorkflow(config) {
        const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const workflow = {
            id,
            name: config.name,
            description: config.description || '',
            version: '1.0.0',
            nodes: [],
            edges: [],
            variables: [],
            settings: { timeout: 30, logLevel: 'info' },
            createdAt: now,
            updatedAt: now
        };

        this.workflows.set(id, workflow);
        this.emit('changed', { type: 'created', workflowId: id, workflow });
        return workflow;
    }

    async getWorkflow(id) {
        return this.workflows.get(id) || null;
    }

    async updateWorkflow(id, updates) {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error(`Workflow not found: ${id}`);

        Object.assign(workflow, updates, { updatedAt: new Date().toISOString() });
        this.emit('changed', { type: 'updated', workflowId: id, workflow });
        return workflow;
    }

    async deleteWorkflow(id) {
        this.workflows.delete(id);
        this.emit('changed', { type: 'deleted', workflowId: id });
    }

    async listWorkflows() {
        return Array.from(this.workflows.values()).map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            nodeCount: w.nodes.length,
            updatedAt: w.updatedAt,
            filePath: w.filePath || ''
        }));
    }

    async addNode(workflowId, nodeConfig) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

        const nodeType = this.nodeRegistry.get(nodeConfig.type);
        if (!nodeType) throw new Error(`Unknown node type: ${nodeConfig.type}`);

        const node = {
            id: nodeConfig.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: nodeConfig.type,
            position: nodeConfig.position || { x: 0, y: 0 },
            data: nodeConfig.data || {},
            inputs: nodeType.inputs.map(p => ({ ...p })),
            outputs: nodeType.outputs.map(p => ({ ...p })),
            metadata: {
                name: nodeConfig.type.charAt(0).toUpperCase() + nodeConfig.type.slice(1),
                ...nodeConfig.metadata
            }
        };

        workflow.nodes.push(node);
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes });
        return node;
    }

    async updateNode(workflowId, nodeId, updates) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

        const nodeIndex = workflow.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) throw new Error(`Node not found: ${nodeId}`);

        workflow.nodes[nodeIndex] = { ...workflow.nodes[nodeIndex], ...updates };
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes });
        return workflow.nodes[nodeIndex];
    }

    async deleteNode(workflowId, nodeId) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

        workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
        workflow.edges = workflow.edges.filter(
            e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
        );
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes, edges: workflow.edges });
    }

    async addEdge(workflowId, edgeConfig) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

        const edge = {
            id: edgeConfig.id || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: edgeConfig.source,
            target: edgeConfig.target,
            condition: edgeConfig.condition
        };

        workflow.edges.push(edge);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });
        return edge;
    }

    async deleteEdge(workflowId, edgeId) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

        workflow.edges = workflow.edges.filter(e => e.id !== edgeId);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });
    }

    validateWorkflow(workflow) {
        const errors = [];

        const hasStart = workflow.nodes.some(n => n.type === 'start');
        const hasEnd = workflow.nodes.some(n => n.type === 'end');

        if (!hasStart) errors.push('Workflow must have a Start node');
        if (!hasEnd) errors.push('Workflow must have an End node');

        const nodeIds = new Set();
        for (const node of workflow.nodes) {
            if (nodeIds.has(node.id)) errors.push(`Duplicate node ID: ${node.id}`);
            nodeIds.add(node.id);
        }

        for (const edge of workflow.edges) {
            if (!nodeIds.has(edge.source.nodeId)) {
                errors.push(`Edge references non-existent source: ${edge.source.nodeId}`);
            }
            if (!nodeIds.has(edge.target.nodeId)) {
                errors.push(`Edge references non-existent target: ${edge.target.nodeId}`);
            }
        }

        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}

// MCP Server 实现
class MCPServer {
    constructor(workflowManager) {
        this.workflowManager = workflowManager;
        this.isRunning = false;
    }

    start() {
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
        
        console.error('MCP Server started on stdio');
    }

    stop() {
        this.isRunning = false;
        process.exit(0);
    }

    sendMessage(message) {
        console.log(JSON.stringify(message));
    }

    async handleRequest(data) {
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
                    error: { code: -32700, message: 'Parse error' }
                });
            }
        }
    }

    async processRequest(request) {
        const { method, params, id } = request;

        try {
            let result;

            switch (method) {
                case 'tools/list':
                    result = this.listTools();
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
                error: { code: -32603, message: error.message }
            };
        }
    }

    listTools() {
        return {
            tools: [
                { name: 'list_workflows', description: 'List all workflows', inputSchema: { type: 'object', properties: {} } },
                { name: 'get_workflow', description: 'Get workflow by ID', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'create_workflow', description: 'Create new workflow', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
                { name: 'update_workflow', description: 'Update workflow', inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['id'] } },
                { name: 'delete_workflow', description: 'Delete workflow', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'add_node', description: 'Add node to workflow', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, type: { type: 'string' }, position: { type: 'object' }, data: { type: 'object' } }, required: ['workflowId', 'type', 'position'] } },
                { name: 'update_node', description: 'Update node', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, nodeId: { type: 'string' }, data: { type: 'object' } }, required: ['workflowId', 'nodeId'] } },
                { name: 'delete_node', description: 'Delete node', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, nodeId: { type: 'string' } }, required: ['workflowId', 'nodeId'] } },
                { name: 'connect_nodes', description: 'Connect nodes', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, sourceNodeId: { type: 'string' }, targetNodeId: { type: 'string' }, sourcePortId: { type: 'string' }, targetPortId: { type: 'string' }, condition: { type: 'string' } }, required: ['workflowId', 'sourceNodeId', 'targetNodeId'] } },
                { name: 'disconnect_nodes', description: 'Disconnect nodes', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, edgeId: { type: 'string' } }, required: ['workflowId', 'edgeId'] } },
                { name: 'list_node_types', description: 'List node types', inputSchema: { type: 'object', properties: {} } },
                { name: 'validate_workflow', description: 'Validate workflow', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'] } }
            ]
        };
    }

    async callTool(name, args) {
        switch (name) {
            case 'list_workflows':
                return { workflows: await this.workflowManager.listWorkflows() };
            case 'get_workflow':
                const wf = await this.workflowManager.getWorkflow(args.id);
                if (!wf) throw new Error(`Workflow not found: ${args.id}`);
                return { workflow: wf };
            case 'create_workflow':
                const newWf = await this.workflowManager.createWorkflow({ name: args.name, description: args.description });
                return { workflow: newWf };
            case 'update_workflow':
                return { workflow: await this.workflowManager.updateWorkflow(args.id, args) };
            case 'delete_workflow':
                await this.workflowManager.deleteWorkflow(args.id);
                return { success: true };
            case 'add_node':
                const node = await this.workflowManager.addNode(args.workflowId, {
                    type: args.type,
                    position: args.position,
                    data: args.data || {}
                });
                return { node };
            case 'update_node':
                return { node: await this.workflowManager.updateNode(args.workflowId, args.nodeId, args) };
            case 'delete_node':
                await this.workflowManager.deleteNode(args.workflowId, args.nodeId);
                return { success: true };
            case 'connect_nodes':
                const edge = await this.workflowManager.addEdge(args.workflowId, {
                    source: { nodeId: args.sourceNodeId, portId: args.sourcePortId || 'output' },
                    target: { nodeId: args.targetNodeId, portId: args.targetPortId || 'input' },
                    condition: args.condition
                });
                return { edge };
            case 'disconnect_nodes':
                await this.workflowManager.deleteEdge(args.workflowId, args.edgeId);
                return { success: true };
            case 'list_node_types':
                return { types: Array.from(this.workflowManager.nodeRegistry.entries()).map(([type, def]) => ({ type, ...def })) };
            case 'validate_workflow':
                const workflow = await this.workflowManager.getWorkflow(args.workflowId);
                if (!workflow) throw new Error('Workflow not found');
                return this.workflowManager.validateWorkflow(workflow);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    listResources() {
        return {
            resources: [
                { uri: 'workflow://list', name: 'All Workflows', mimeType: 'application/json' },
                { uri: 'node-types://definitions', name: 'Node Type Definitions', mimeType: 'application/json' }
            ]
        };
    }

    async readResource(uri) {
        if (uri === 'workflow://list') {
            return { workflows: await this.workflowManager.listWorkflows() };
        }
        if (uri === 'node-types://definitions') {
            return { types: Array.from(this.workflowManager.nodeRegistry.entries()).map(([type, def]) => ({ type, ...def })) };
        }
        throw new Error(`Unknown resource: ${uri}`);
    }

    listPrompts() {
        return {
            prompts: [
                { name: 'alert_handler_designer', description: 'Design an alert handling workflow' }
            ]
        };
    }

    getPrompt(name) {
        const prompts = {
            alert_handler_designer: {
                messages: [{
                    role: 'system',
                    content: `You are an expert in designing alert handling workflows. Consider: severity classification, escalation paths, context gathering, automated remediation, notifications, and health checks.`
                }]
            }
        };
        if (!prompts[name]) throw new Error(`Prompt not found: ${name}`);
        return { messages: prompts[name].messages };
    }
}

// 启动服务器
const workflowManager = new WorkflowManager();
const server = new MCPServer(workflowManager);

// 导出供测试使用
module.exports = { WorkflowManager, MCPServer };

// 如果是直接运行，启动服务器
if (require.main === module) {
    server.start();
}
