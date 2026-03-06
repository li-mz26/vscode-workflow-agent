/**
 * 执行服务 - 工作流执行引擎
 */

import { Workflow, NodeConfig, Edge } from '../domain/Workflow';
import { 
    ExecutionContext, 
    ExecutionResult, 
    ExecutionState,
    LogEntry 
} from '../domain/Execution';
import { IExecutorFactory } from '../executor/INodeExecutor';
import { EventBus, WorkflowEvents } from './EventBus';

export interface IExecutionService {
    start(workflow: Workflow, inputs?: Record<string, any>): Promise<ExecutionResult>;
    pause(executionId: string): void;
    resume(executionId: string): void;
    stop(executionId: string): void;
    getState(executionId: string): ExecutionState;
}

interface ExecutionSession {
    workflow: Workflow;
    state: ExecutionState;
    context: ExecutionContext;
    currentNodeId: string | null;
    logs: LogEntry[];
    abortController: AbortController;
}

export class ExecutionService implements IExecutionService {
    private sessions: Map<string, ExecutionSession> = new Map();
    
    constructor(
        private readonly executorFactory: IExecutorFactory,
        private readonly eventBus: EventBus
    ) {}
    
    async start(workflow: Workflow, inputs?: Record<string, any>): Promise<ExecutionResult> {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        const context: ExecutionContext = {
            variables: new Map(),
            inputs: inputs || {},
            outputs: {},
            metadata: {
                startTime: new Date(),
                executionId
            }
        };
        
        const session: ExecutionSession = {
            workflow,
            state: 'running',
            context,
            currentNodeId: null,
            logs: [],
            abortController: new AbortController()
        };
        
        this.sessions.set(executionId, session);
        this.eventBus.emit(WorkflowEvents.EXECUTION_STARTED, { executionId, workflow });
        
        try {
            const startNode = workflow.nodes.find(n => n.type === 'start');
            if (!startNode) {
                throw new Error('No Start node found');
            }
            
            await this.executeFromNode(executionId, startNode.id);
            
            session.state = 'completed';
            session.context.metadata.endTime = new Date();
            
            this.eventBus.emit(WorkflowEvents.EXECUTION_COMPLETED, { 
                executionId, 
                outputs: session.context.outputs 
            });
            
            return {
                success: true,
                outputs: session.context.outputs,
                logs: session.logs,
                duration: Date.now() - startTime
            };
            
        } catch (error) {
            session.state = 'failed';
            session.context.metadata.endTime = new Date();
            
            this.eventBus.emit(WorkflowEvents.EXECUTION_FAILED, { 
                executionId, 
                error 
            });
            
            return {
                success: false,
                error: error as Error,
                logs: session.logs,
                duration: Date.now() - startTime
            };
        }
    }
    
    private async executeFromNode(executionId: string, nodeId: string): Promise<void> {
        const session = this.sessions.get(executionId);
        if (!session) throw new Error('Execution not found');
        
        if (session.abortController.signal.aborted) {
            throw new Error('Execution aborted');
        }
        
        const node = session.workflow.nodes.find(n => n.id === nodeId);
        if (!node) throw new Error(`Node not found: ${nodeId}`);
        
        session.currentNodeId = nodeId;
        this.log(executionId, 'info', `Executing node: ${node.metadata?.name || node.type}`, nodeId);
        
        const executor = this.executorFactory.create(node.type);
        const inputs = this.collectNodeInputs(node, session.workflow, session.context);
        
        const result = await executor.execute(node, {
            ...session.context,
            inputs
        });
        
        if (!result.success) {
            throw result.error || new Error(`Node ${nodeId} failed`);
        }
        
        if (result.outputs) {
            for (const [key, value] of Object.entries(result.outputs)) {
                session.context.variables.set(`${nodeId}.${key}`, value);
            }
        }
        
        // 找到下游节点继续执行
        const outgoingEdges = session.workflow.edges.filter(e => e.source.nodeId === nodeId);
        for (const edge of outgoingEdges) {
            await this.executeFromNode(executionId, edge.target.nodeId);
        }
    }
    
    private collectNodeInputs(
        node: NodeConfig, 
        workflow: Workflow, 
        context: ExecutionContext
    ): Record<string, any> {
        const inputs: Record<string, any> = {};
        
        const incomingEdges = workflow.edges.filter(e => e.target.nodeId === node.id);
        for (const edge of incomingEdges) {
            const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
            if (sourceNode) {
                const value = context.variables.get(`${sourceNode.id}.${edge.source.portId}`);
                inputs[edge.target.portId] = value;
            }
        }
        
        return inputs;
    }
    
    private log(executionId: string, level: LogEntry['level'], message: string, nodeId?: string): void {
        const session = this.sessions.get(executionId);
        if (session) {
            session.logs.push({
                timestamp: new Date().toISOString(),
                level,
                message,
                nodeId
            });
        }
    }
    
    pause(executionId: string): void {
        const session = this.sessions.get(executionId);
        if (session) {
            session.state = 'paused';
        }
    }
    
    resume(executionId: string): void {
        const session = this.sessions.get(executionId);
        if (session) {
            session.state = 'running';
        }
    }
    
    stop(executionId: string): void {
        const session = this.sessions.get(executionId);
        if (session) {
            session.abortController.abort();
            session.state = 'stopped';
        }
    }
    
    getState(executionId: string): ExecutionState {
        return this.sessions.get(executionId)?.state || 'idle';
    }
}
