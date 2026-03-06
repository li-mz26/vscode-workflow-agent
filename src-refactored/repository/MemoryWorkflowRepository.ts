/**
 * 内存工作流仓库实现
 * 适用于测试和演示，生产环境应使用文件或数据库存储
 */

import { IWorkflowRepository } from './IWorkflowRepository';
import { 
    Workflow, 
    WorkflowSummary, 
    CreateWorkflowDTO,
    NodeConfig,
    Edge,
    ValidationResult 
} from '../domain/Workflow';

export class MemoryWorkflowRepository implements IWorkflowRepository {
    private workflows: Map<string, Workflow> = new Map();
    
    async create(dto: CreateWorkflowDTO): Promise<Workflow> {
        const id = this.generateId();
        const now = new Date().toISOString();
        
        const workflow: Workflow = {
            id,
            name: dto.name,
            description: dto.description || '',
            version: '1.0.0',
            nodes: dto.nodes || [],
            edges: dto.edges || [],
            variables: dto.variables || [],
            settings: {
                timeout: 30,
                logLevel: 'info',
                ...dto.settings
            },
            createdAt: now,
            updatedAt: now
        };
        
        this.workflows.set(id, workflow);
        return workflow;
    }
    
    async findById(id: string): Promise<Workflow | null> {
        return this.workflows.get(id) || null;
    }
    
    async findAll(): Promise<WorkflowSummary[]> {
        return Array.from(this.workflows.values()).map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            nodeCount: w.nodes.length,
            updatedAt: w.updatedAt,
            filePath: w.filePath
        }));
    }
    
    async update(id: string, updates: Partial<Workflow>): Promise<Workflow> {
        const workflow = this.workflows.get(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }
        
        const updated: Workflow = {
            ...workflow,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        this.workflows.set(id, updated);
        return updated;
    }
    
    async delete(id: string): Promise<void> {
        this.workflows.delete(id);
    }
    
    async exists(id: string): Promise<boolean> {
        return this.workflows.has(id);
    }
    
    async addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig> {
        const workflow = await this.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const updated: Workflow = {
            ...workflow,
            nodes: [...workflow.nodes, node],
            updatedAt: new Date().toISOString()
        };
        
        this.workflows.set(workflowId, updated);
        return node;
    }
    
    async updateNode(workflowId: string, nodeId: string, updates: Partial<NodeConfig>): Promise<NodeConfig> {
        const workflow = await this.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const nodeIndex = workflow.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) {
            throw new Error(`Node not found: ${nodeId}`);
        }
        
        const updatedNode = { ...workflow.nodes[nodeIndex], ...updates };
        const updatedNodes = [...workflow.nodes];
        updatedNodes[nodeIndex] = updatedNode;
        
        await this.update(workflowId, { nodes: updatedNodes });
        return updatedNode;
    }
    
    async removeNode(workflowId: string, nodeId: string): Promise<void> {
        const workflow = await this.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const nodes = workflow.nodes.filter(n => n.id !== nodeId);
        const edges = workflow.edges.filter(
            e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
        );
        
        await this.update(workflowId, { nodes, edges });
    }
    
    async addEdge(workflowId: string, edge: Edge): Promise<Edge> {
        const workflow = await this.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const updated: Workflow = {
            ...workflow,
            edges: [...workflow.edges, edge],
            updatedAt: new Date().toISOString()
        };
        
        this.workflows.set(workflowId, updated);
        return edge;
    }
    
    async removeEdge(workflowId: string, edgeId: string): Promise<void> {
        const workflow = await this.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const edges = workflow.edges.filter(e => e.id !== edgeId);
        await this.update(workflowId, { edges });
    }
    
    validate(workflow: Workflow): ValidationResult {
        const errors: string[] = [];
        
        const hasStart = workflow.nodes.some(n => n.type === 'start');
        const hasEnd = workflow.nodes.some(n => n.type === 'end');
        
        if (!hasStart) errors.push('Workflow must have a Start node');
        if (!hasEnd) errors.push('Workflow must have an End node');
        
        const nodeIds = new Set<string>();
        for (const node of workflow.nodes) {
            if (nodeIds.has(node.id)) {
                errors.push(`Duplicate node ID: ${node.id}`);
            }
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
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    
    private generateId(): string {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
