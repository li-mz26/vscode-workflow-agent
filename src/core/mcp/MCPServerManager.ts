import { WorkflowManager } from '../workflow/WorkflowManager';
import { Workflow, NodeConfig, Edge, ExecutionResult } from '../../shared/types';
import { ExecutionEngine } from '../execution/ExecutionEngine';

// 完整的 MCP 服务器实现 - 遵循 MCP 协议规范
export class MCPServerManager {
    private workflowManager: WorkflowManager;
    private isRunning = false;
    private executionEngines: Map<string, ExecutionEngine> = new Map();

    constructor(workflowManager: WorkflowManager) {
        this.workflowManager = workflowManager;
    }

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
                // ===== Tools =====
                case 'tools/list':
                    result = this.listTools();
                    break;
                case 'tools/call':
                    result = await this.callTool(params.name, params.arguments);
                    break;

                // ===== Resources =====
                case 'resources/list':
                    result = this.listResources();
                    break;
                case 'resources/read':
                    result = await this.readResource(params.uri);
                    break;

                // ===== Prompts =====
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

    // ===== Tools Implementation =====
    private listTools(): any {
        return {
            tools: [
                {
                    name: 'list_workflows',
                    description: 'List all available workflows',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'get_workflow',
                    description: 'Get workflow details by ID',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Workflow ID' }
                        },
                        required: ['id']
                    }
                },
                {
                    name: 'create_workflow',
                    description: 'Create a new workflow',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Workflow name' },
                            description: { type: 'string', description: 'Workflow description' }
                        },
                        required: ['name']
                    }
                },
                {
                    name: 'update_workflow',
                    description: 'Update workflow properties',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' }
                        },
                        required: ['id']
                    }
                },
                {
                    name: 'delete_workflow',
                    description: 'Delete a workflow',
                    inputSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id']
                    }
                },
                {
                    name: 'add_node',
                    description: 'Add a node to workflow',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workflowId: { type: 'string' },
                            type: { type: 'string', enum: ['start', 'end', 'code', 'llm', 'switch', 'parallel', 'merge'] },
                            position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
                            data: { type: 'object' }
                        },
                        required: ['workflowId', 'type', 'position']
                    }
                },
                {
                    name: 'update_node',
                    description: 'Update node configuration',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workflowId: { type: 'string' },
                            nodeId: { type: 'string' },
                            data: { type: 'object' },
                            position: { type: 'object' }
                        },
                        required: ['workflowId', 'nodeId']
                    }
                },
                {
                    name: 'delete_node',
                    description: 'Delete a node from workflow',
                    inputSchema: {
                        type: 'object',
                        properties: { workflowId: { type: 'string' }, nodeId: { type: 'string' } },
                        required: ['workflowId', 'nodeId']
                    }
                },
                {
                    name: 'connect_nodes',
                    description: 'Connect two nodes with an edge',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workflowId: { type: 'string' },
                            sourceNodeId: { type: 'string' },
                            sourcePortId: { type: 'string' },
                            targetNodeId: { type: 'string' },
                            targetPortId: { type: 'string' },
                            condition: { type: 'string', description: 'Condition expression for switch branches' }
                        },
                        required: ['workflowId', 'sourceNodeId', 'targetNodeId']
                    }
                },
                {
                    name: 'disconnect_nodes',
                    description: 'Remove connection between nodes',
                    inputSchema: {
                        type: 'object',
                        properties: { workflowId: { type: 'string' }, edgeId: { type: 'string' } },
                        required: ['workflowId', 'edgeId']
                    }
                },
                {
                    name: 'list_node_types',
                    description: 'List all available node types with their schemas',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'execute_workflow',
                    description: 'Execute a workflow with given inputs',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workflowId: { type: 'string' },
                            inputs: { type: 'object' }
                        },
                        required: ['workflowId']
                    }
                },
                {
                    name: 'get_execution_status',
                    description: 'Get status of a running execution',
                    inputSchema: {
                        type: 'object',
                        properties: { executionId: { type: 'string' } },
                        required: ['executionId']
                    }
                },
                {
                    name: 'stop_execution',
                    description: 'Stop a running workflow execution',
                    inputSchema: {
                        type: 'object',
                        properties: { executionId: { type: 'string' } },
                        required: ['executionId']
                    }
                },
                {
                    name: 'validate_workflow',
                    description: 'Validate workflow structure and configuration',
                    inputSchema: {
                        type: 'object',
                        properties: { workflowId: { type: 'string' } },
                        required: ['workflowId']
                    }
                },
                // ===== 新增：告警处理专用工具 =====
                {
                    name: 'create_alert_handler_workflow',
                    description: 'Create a complete alert handling workflow template',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            alertType: { type: 'string', description: 'Type of alert (cpu, memory, disk, custom)' },
                            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                            autoRemediation: { type: 'boolean', description: 'Enable auto-remediation' }
                        },
                        required: ['alertType']
                    }
                },
                {
                    name: 'add_scheduled_trigger',
                    description: 'Add a scheduled trigger (cron) to workflow',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workflowId: { type: 'string' },
                            cronExpression: { type: 'string', description: 'Cron expression like "0 */5 * * *"' },
                            timezone: { type: 'string', default: 'UTC' }
                        },
                        required: ['workflowId', 'cronExpression']
                    }
                }
            ]
        };
    }

    private async callTool(name: string, args: any): Promise<any> {
        switch (name) {
            case 'list_workflows':
                return { workflows: await this.workflowManager.listWorkflows() };

            case 'get_workflow':
                const workflow = await this.workflowManager.getWorkflow(args.id);
                if (!workflow) throw new Error(`Workflow not found: ${args.id}`);
                return { workflow };

            case 'create_workflow':
                return { 
                    workflow: await this.workflowManager.createWorkflow({
                        name: args.name,
                        description: args.description
                    })
                };

            case 'update_workflow':
                return { workflow: await this.workflowManager.updateWorkflow(args.id, args) };

            case 'delete_workflow':
                await this.workflowManager.deleteWorkflow(args.id);
                return { success: true };

            case 'add_node':
                const node = await this.workflowManager.addNode(args.workflowId, {
                    id: `node_${Date.now()}`,
                    type: args.type,
                    position: args.position,
                    data: args.data || {},
                    inputs: [],
                    outputs: []
                });
                return { node };

            case 'update_node':
                return { node: await this.workflowManager.updateNode(args.workflowId, args.nodeId, args) };

            case 'delete_node':
                await this.workflowManager.deleteNode(args.workflowId, args.nodeId);
                return { success: true };

            case 'connect_nodes':
                const edge = await this.workflowManager.addEdge(args.workflowId, {
                    id: `edge_${Date.now()}`,
                    source: { nodeId: args.sourceNodeId, portId: args.sourcePortId || 'output' },
                    target: { nodeId: args.targetNodeId, portId: args.targetPortId || 'input' },
                    condition: args.condition
                });
                return { edge };

            case 'disconnect_nodes':
                await this.workflowManager.deleteEdge(args.workflowId, args.edgeId);
                return { success: true };

            case 'list_node_types':
                return this.listNodeTypes();

            case 'execute_workflow':
                return this.executeWorkflow(args.workflowId, args.inputs);

            case 'get_execution_status':
                return this.getExecutionStatus(args.executionId);

            case 'stop_execution':
                return { success: this.stopExecution(args.executionId) };

            case 'validate_workflow':
                const wf = await this.workflowManager.getWorkflow(args.workflowId);
                if (!wf) throw new Error('Workflow not found');
                return this.workflowManager.validateWorkflow(wf);

            case 'create_alert_handler_workflow':
                return this.createAlertHandlerWorkflow(args);

            case 'add_scheduled_trigger':
                return this.addScheduledTrigger(args);

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    // ===== Resources =====
    private listResources(): any {
        return {
            resources: [
                { uri: 'workflow://list', name: 'All Workflows', mimeType: 'application/json' },
                { uri: 'execution://active', name: 'Active Executions', mimeType: 'application/json' },
                { uri: 'node-types://definitions', name: 'Node Type Definitions', mimeType: 'application/json' }
            ]
        };
    }

    private async readResource(uri: string): Promise<any> {
        if (uri === 'workflow://list') {
            return { workflows: await this.workflowManager.listWorkflows() };
        }
        if (uri === 'node-types://definitions') {
            return this.listNodeTypes();
        }
        if (uri.startsWith('workflow://')) {
            const id = uri.replace('workflow://', '');
            const workflow = await this.workflowManager.getWorkflow(id);
            return { workflow };
        }
        throw new Error(`Unknown resource: ${uri}`);
    }

    // ===== Prompts =====
    private listPrompts(): any {
        return {
            prompts: [
                {
                    name: 'alert_handler_designer',
                    description: 'Design an alert handling workflow'
                },
                {
                    name: 'workflow_optimizer',
                    description: 'Optimize and improve a workflow'
                }
            ]
        };
    }

    private getPrompt(name: string): any {
        const prompts: Record<string, any> = {
            alert_handler_designer: {
                messages: [{
                    role: 'system',
                    content: `You are an expert in designing alert handling workflows. 
                    
When creating alert handling workflows, consider:
1. Alert severity classification (P0-P4)
2. Multi-level escalation paths
3. Context gathering from related metrics
4. Automated remediation attempts
5. Notification channels (Slack, PagerDuty, Email)
6. Scheduled health checks

Use the available tools to build comprehensive workflows that handle alerts intelligently.`
                }]
            },
            workflow_optimizer: {
                messages: [{
                    role: 'system',
                    content: `You are a workflow optimization expert. 
                    
Analyze workflows for:
- Performance bottlenecks
- Missing error handling
- Redundant nodes
- Parallelization opportunities
- Proper timeout and retry configurations`
                }]
            }
        };

        if (!prompts[name]) throw new Error(`Prompt not found: ${name}`);
        return { messages: prompts[name].messages };
    }

    // ===== Helper Methods =====
    private listNodeTypes(): any {
        return {
            types: [
                { type: 'start', name: 'Start', description: 'Entry point', category: 'basic', color: '#4CAF50' },
                { type: 'end', name: 'End', description: 'Exit point', category: 'basic', color: '#F44336' },
                { type: 'code', name: 'Code', description: 'Execute Python code', category: 'basic', color: '#2196F3' },
                { type: 'llm', name: 'LLM', description: 'Call language model for analysis', category: 'basic', color: '#9C27B0' },
                { type: 'switch', name: 'Switch', description: 'Conditional branching', category: 'flow', color: '#FF9800' },
                { type: 'parallel', name: 'Parallel', description: 'Parallel execution', category: 'flow', color: '#00BCD4' },
                { type: 'merge', name: 'Merge', description: 'Merge branches', category: 'flow', color: '#795548' }
            ]
        };
    }

    private async executeWorkflow(workflowId: string, inputs?: any): Promise<any> {
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) throw new Error('Workflow not found');

        const engine = new ExecutionEngine(workflow);
        this.executionEngines.set(workflowId, engine);

        const result = await engine.start(inputs);
        return { executionId: workflowId, result };
    }

    private getExecutionStatus(executionId: string): any {
        const engine = this.executionEngines.get(executionId);
        if (!engine) return { status: 'not_found' };
        
        return {
            status: engine.getState(),
            currentNode: engine.getCurrentNode(),
            variables: engine.getVariables()
        };
    }

    private stopExecution(executionId: string): boolean {
        const engine = this.executionEngines.get(executionId);
        if (engine) {
            engine.stop();
            return true;
        }
        return false;
    }

    // ===== Alert Handler Template =====
    private async createAlertHandlerWorkflow(args: any): Promise<any> {
        const { alertType, severity = 'high', autoRemediation = true } = args;
        
        // Create base workflow
        const workflow = await this.workflowManager.createWorkflow({
            name: `${alertType}_alert_handler`,
            description: `Automated ${alertType} alert handling workflow with severity ${severity}`
        });

        // This is a template - actual node creation would be done via subsequent tool calls
        return {
            workflow,
            template: {
                stages: [
                    '1. Receive and parse alert',
                    '2. Query related metrics',
                    '3. Classify severity',
                    '4. Attempt auto-remediation',
                    '5. Escalate if needed',
                    '6. Send notifications',
                    '7. Schedule follow-up check'
                ],
                recommendedNodes: [
                    { type: 'start', purpose: 'Alert trigger' },
                    { type: 'code', purpose: 'Parse alert and query metrics' },
                    { type: 'switch', purpose: 'Severity classification' },
                    { type: 'parallel', purpose: 'Parallel remediation attempts' },
                    { type: 'llm', purpose: 'Root cause analysis' },
                    { type: 'merge', purpose: 'Collect results' },
                    { type: 'code', purpose: 'Send notifications' },
                    { type: 'end', purpose: 'Complete' }
                ]
            }
        };
    }

    private async addScheduledTrigger(args: any): Promise<any> {
        // Store scheduled trigger configuration in workflow data
        const workflow = await this.workflowManager.getWorkflow(args.workflowId);
        if (!workflow) throw new Error('Workflow not found');

        const schedule = {
            cron: args.cronExpression,
            timezone: args.timezone || 'UTC',
            enabled: true
        };

        await this.workflowManager.updateWorkflow(args.workflowId, {
            settings: { ...workflow.settings, schedule }
        });

        return { success: true, schedule };
    }
}
