/**
 * 工作流服务 - 业务逻辑层
 * 处理工作流的CRUD操作和验证
 */

import { IWorkflowRepository } from '../repository/IWorkflowRepository';
import { EventBus, WorkflowEvents } from './EventBus';
import { 
    Workflow, 
    CreateWorkflowDTO, 
    WorkflowSummary,
    NodeConfig,
    Edge,
    ValidationResult 
} from '../domain/Workflow';

export interface IWorkflowService {
    createWorkflow(dto: CreateWorkflowDTO): Promise<Workflow>;
    getWorkflow(id: string): Promise<Workflow | null>;
    listWorkflows(): Promise<WorkflowSummary[]>;
    updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;
    deleteWorkflow(id: string): Promise<void>;
    validateWorkflow(workflow: Workflow): ValidationResult;
    addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig>;
    removeNode(workflowId: string, nodeId: string): Promise<void>;
    addEdge(workflowId: string, edge: Edge): Promise<Edge>;
    removeEdge(workflowId: string, edgeId: string): Promise<void>;
}

export class WorkflowService implements IWorkflowService {
    constructor(
        private readonly repository: IWorkflowRepository,
        private readonly eventBus: EventBus
    ) {}
    
    async createWorkflow(dto: CreateWorkflowDTO): Promise<Workflow> {
        // 创建默认的 Start 和 End 节点
        const startNode: NodeConfig = {
            id: `node_${Date.now()}_start`,
            type: 'start',
            position: { x: 100, y: 100 },
            data: {},
            inputs: [],
            outputs: [{ id: 'trigger', name: 'trigger', type: 'data', dataType: 'object' }],
            metadata: { name: 'Start', color: '#4CAF50' }
        };
        
        const endNode: NodeConfig = {
            id: `node_${Date.now()}_end`,
            type: 'end',
            position: { x: 500, y: 100 },
            data: {},
            inputs: [{ id: 'result', name: 'result', type: 'data', dataType: 'any' }],
            outputs: [],
            metadata: { name: 'End', color: '#F44336' }
        };
        
        const workflow = await this.repository.create({
            ...dto,
            nodes: [startNode, endNode]
        });
        
        this.eventBus.emit(WorkflowEvents.CREATED, { workflow });
        return workflow;
    }
    
    async getWorkflow(id: string): Promise<Workflow | null> {
        return this.repository.findById(id);
    }
    
    async listWorkflows(): Promise<WorkflowSummary[]> {
        return this.repository.findAll();
    }
    
    async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
        const workflow = await this.repository.update(id, updates);
        this.eventBus.emit(WorkflowEvents.UPDATED, { workflow });
        return workflow;
    }
    
    async deleteWorkflow(id: string): Promise<void> {
        await this.repository.delete(id);
        this.eventBus.emit(WorkflowEvents.DELETED, { workflowId: id });
    }
    
    async addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig> {
        const result = await this.repository.addNode(workflowId, node);
        this.eventBus.emit(WorkflowEvents.NODE_ADDED, { workflowId, node });
        return result;
    }
    
    async removeNode(workflowId: string, nodeId: string): Promise<void> {
        await this.repository.removeNode(workflowId, nodeId);
        this.eventBus.emit(WorkflowEvents.NODE_REMOVED, { workflowId, nodeId });
    }
    
    async addEdge(workflowId: string, edge: Edge): Promise<Edge> {
        const result = await this.repository.addEdge(workflowId, edge);
        this.eventBus.emit(WorkflowEvents.EDGE_ADDED, { workflowId, edge });
        return result;
    }
    
    async removeEdge(workflowId: string, edgeId: string): Promise<void> {
        await this.repository.removeEdge(workflowId, edgeId);
        this.eventBus.emit(WorkflowEvents.EDGE_REMOVED, { workflowId, edgeId });
    }
    
    validateWorkflow(workflow: Workflow): ValidationResult {
        const errors: string[] = [];
        
        const hasStart = workflow.nodes.some(n => n.type === 'start');
        const hasEnd = workflow.nodes.some(n => n.type === 'end');
        
        if (!hasStart) errors.push('Workflow must have a Start node');
        if (!hasEnd) errors.push('Workflow must have an End node');
        
        const nodeIds = new Set(workflow.nodes.map(n => n.id));
        
        for (const edge of workflow.edges) {
            if (!nodeIds.has(edge.source.nodeId)) {
                errors.push(`Edge references non-existent source: ${edge.source.nodeId}`);
            }
            if (!nodeIds.has(edge.target.nodeId)) {
                errors.push(`Edge references non-existent target: ${edge.target.nodeId}`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }
}
