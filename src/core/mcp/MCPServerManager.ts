import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow, NodeConfig, Edge } from '../../shared/types';

// 简化的 MCP 服务器管理器
export class MCPServerManager {
    private workflowManager: WorkflowManager;
    private isRunning = false;

    constructor(workflowManager: WorkflowManager) {
        this.workflowManager = workflowManager;
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        console.log('MCP Server started (stdio mode)');

        // 设置标准输入输出处理
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (data) => {
            this.handleRequest(data.toString());
        });

        process.stdin.on('end', () => {
            this.stop();
        });
    }

    stop(): void {
        this.isRunning = false;
        console.log('MCP Server stopped');
    }

    private async handleRequest(data: string): Promise<void> {
        try {
            const request = JSON.parse(data);
            const response = await this.processRequest(request);
            console.log(JSON.stringify(response));
        } catch (error) {
            console.error(JSON.stringify({
                error: (error as Error).message
            }));
        }
    }

    private async processRequest(request: any): Promise<any> {
        const { method, params } = request;

        switch (method) {
            case 'list_workflows':
                return this.listWorkflows();
            case 'get_workflow':
                return this.getWorkflow(params.id);
            case 'create_workflow':
                return this.createWorkflow(params);
            case 'update_workflow':
                return this.updateWorkflow(params.id, params.updates);
            case 'delete_workflow':
                return this.deleteWorkflow(params.id);
            case 'add_node':
                return this.addNode(params.workflowId, params);
            case 'update_node':
                return this.updateNode(params.workflowId, params.nodeId, params.updates);
            case 'delete_node':
                return this.deleteNode(params.workflowId, params.nodeId);
            case 'connect_nodes':
                return this.connectNodes(params.workflowId, params);
            case 'list_node_types':
                return this.listNodeTypes();
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    private async listWorkflows(): Promise<any> {
        const workflows = await this.workflowManager.listWorkflows();
        return { workflows };
    }

    private async getWorkflow(id: string): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }
        return { workflow };
    }

    private async createWorkflow(params: any): Promise<any> {
        const workflow = await this.workflowManager.createWorkflow({
            name: params.name,
            description: params.description
        });
        return { workflow };
    }

    private async updateWorkflow(id: string, updates: any): Promise<any> {
        const workflow = await this.workflowManager.updateWorkflow(id, updates);
        return { workflow };
    }

    private async deleteWorkflow(id: string): Promise<any> {
        await this.workflowManager.deleteWorkflow(id);
        return { success: true };
    }

    private async addNode(workflowId: string, params: any): Promise<any> {
        const node: NodeConfig = {
            id: `node_${Date.now()}`,
            type: params.type,
            position: params.position,
            data: params.data || {},
            inputs: [],
            outputs: []
        };
        
        const result = await this.workflowManager.addNode(workflowId, node);
        return { node: result };
    }

    private async updateNode(workflowId: string, nodeId: string, updates: any): Promise<any> {
        const node = await this.workflowManager.updateNode(workflowId, nodeId, updates);
        return { node };
    }

    private async deleteNode(workflowId: string, nodeId: string): Promise<any> {
        await this.workflowManager.deleteNode(workflowId, nodeId);
        return { success: true };
    }

    private async connectNodes(workflowId: string, params: any): Promise<any> {
        const edge: Edge = {
            id: `edge_${Date.now()}`,
            source: {
                nodeId: params.sourceNodeId,
                portId: params.sourcePortId || 'output'
            },
            target: {
                nodeId: params.targetNodeId,
                portId: params.targetPortId || 'input'
            }
        };
        
        const result = await this.workflowManager.addEdge(workflowId, edge);
        return { edge: result };
    }

    private listNodeTypes(): any {
        const types = [
            { type: 'start', name: 'Start', description: 'Entry point', category: 'basic' },
            { type: 'end', name: 'End', description: 'Exit point', category: 'basic' },
            { type: 'code', name: 'Code', description: 'Execute Python code', category: 'basic' },
            { type: 'llm', name: 'LLM', description: 'Call language model', category: 'basic' },
            { type: 'switch', name: 'Switch', description: 'Conditional branching', category: 'flow' },
            { type: 'parallel', name: 'Parallel', description: 'Parallel execution', category: 'flow' },
            { type: 'merge', name: 'Merge', description: 'Merge branches', category: 'flow' }
        ];
        
        return { types };
    }
}
