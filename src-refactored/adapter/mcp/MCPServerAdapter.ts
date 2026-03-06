/**
 * MCP Server 适配器
 * 将工作流服务暴露为 MCP 工具
 */

import { IWorkflowService } from '../service/WorkflowService';
import { IExecutionService } from '../service/ExecutionService';
import { NodeTypeRegistry } from './NodeTypeRegistry';

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
}

export interface MCPResource {
    uri: string;
    name: string;
    mimeType: string;
}

export interface MCPPrompt {
    name: string;
    description: string;
}

export class MCPServerAdapter {
    private isRunning = false;
    private nodeTypeRegistry: NodeTypeRegistry;
    
    constructor(
        private readonly workflowService: IWorkflowService,
        private readonly executionService: IExecutionService
    ) {
        this.nodeTypeRegistry = new NodeTypeRegistry();
    }
    
    start(): void {
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
                    version: '2.0.0'
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
                    error: { code: -32700, message: 'Parse error' }
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
                error: { code: -32603, message: (error as Error).message }
            };
        }
    }
    
    private listTools(): { tools: MCPTool[] } {
        return {
            tools: [
                { name: 'list_workflows', description: 'List all workflows', inputSchema: { type: 'object', properties: {} } },
                { name: 'get_workflow', description: 'Get workflow by ID', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'create_workflow', description: 'Create new workflow', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
                { name: 'update_workflow', description: 'Update workflow', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'delete_workflow', description: 'Delete workflow', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'add_node', description: 'Add node', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, type: { type: 'string' }, position: { type: 'object' } }, required: ['workflowId', 'type', 'position'] } },
                { name: 'connect_nodes', description: 'Connect nodes', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' }, sourceNodeId: { type: 'string' }, targetNodeId: { type: 'string' } }, required: ['workflowId', 'sourceNodeId', 'targetNodeId'] } },
                { name: 'validate_workflow', description: 'Validate workflow', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'] } },
                { name: 'execute_workflow', description: 'Execute workflow', inputSchema: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'] } },
                { name: 'list_node_types', description: 'List node types', inputSchema: { type: 'object', properties: {} } }
            ]
        };
    }
    
    private async callTool(name: string, args: any): Promise<any> {
        switch (name) {
            case 'list_workflows':
                return { workflows: await this.workflowService.listWorkflows() };
            case 'get_workflow':
                const wf = await this.workflowService.getWorkflow(args.id);
                return wf ? { workflow: wf } : null;
            case 'create_workflow':
                return { workflow: await this.workflowService.createWorkflow(args) };
            case 'update_workflow':
                return { workflow: await this.workflowService.updateWorkflow(args.id, args) };
            case 'delete_workflow':
                await this.workflowService.deleteWorkflow(args.id);
                return { success: true };
            case 'add_node':
                const node = await this.workflowService.addNode(args.workflowId, args.node);
                return { node };
            case 'connect_nodes':
                const edge = await this.workflowService.addEdge(args.workflowId, args.edge);
                return { edge };
            case 'validate_workflow':
                const wf2 = await this.workflowService.getWorkflow(args.workflowId);
                return wf2 ? this.workflowService.validateWorkflow(wf2) : null;
            case 'execute_workflow':
                const wf3 = await this.workflowService.getWorkflow(args.workflowId);
                return wf3 ? await this.executionService.start(wf3, args.inputs) : null;
            case 'list_node_types':
                return { types: this.nodeTypeRegistry.getAllTypes() };
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    
    private listResources(): { resources: MCPResource[] } {
        return {
            resources: [
                { uri: 'workflow://list', name: 'All Workflows', mimeType: 'application/json' }
            ]
        };
    }
    
    private async readResource(uri: string): Promise<any> {
        if (uri === 'workflow://list') {
            return { workflows: await this.workflowService.listWorkflows() };
        }
        throw new Error(`Unknown resource: ${uri}`);
    }
    
    private listPrompts(): { prompts: MCPPrompt[] } {
        return {
            prompts: [
                { name: 'alert_handler_designer', description: 'Design alert handling workflow' }
            ]
        };
    }
    
    private getPrompt(name: string): { messages: any[] } {
        const prompts: Record<string, any> = {
            alert_handler_designer: {
                messages: [{
                    role: 'system',
                    content: 'You are an expert in designing alert handling workflows.'
                }]
            }
        };
        if (!prompts[name]) throw new Error(`Prompt not found: ${name}`);
        return prompts[name];
    }
}
