// ============================================
// Repository 层 - 内存工作流存储实现
// ============================================

import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { IWorkflowRepository } from './IWorkflowRepository';
import { Workflow, WorkflowSummary, CreateWorkflowDTO, NodeConfig } from '../domain';
import { NodeRegistry } from '../domain/NodeRegistry';

export interface MemoryWorkflowRepositoryOptions {
    workspacePath?: string;
    nodeRegistry?: NodeRegistry;
}

export class MemoryWorkflowRepository extends EventEmitter implements IWorkflowRepository {
    private workflows: Map<string, Workflow> = new Map();
    private nodeRegistry: NodeRegistry;
    private workspacePath: string | undefined;

    constructor(options: MemoryWorkflowRepositoryOptions = {}) {
        super();
        this.nodeRegistry = options.nodeRegistry || new NodeRegistry();
        this.workspacePath = options.workspacePath;
    }

    async create(dto: CreateWorkflowDTO): Promise<Workflow> {
        // 创建默认的 Start 和 End 节点
        const startNode = this.nodeRegistry.createNode('start', { x: 100, y: 100 });
        const endNode = this.nodeRegistry.createNode('end', { x: 500, y: 100 });

        const workflow = new Workflow({
            name: dto.name,
            description: dto.description || '',
            nodes: dto.nodes || [startNode, endNode],
            edges: dto.edges || [],
            variables: dto.variables || [],
            settings: {
                timeout: 30,
                logLevel: 'info',
                ...dto.settings
            }
        });

        // 确定文件路径
        if (this.workspacePath) {
            const fileName = `${dto.name.toLowerCase().replace(/\s+/g, '-')}.workflow.json`;
            workflow.filePath = path.join(this.workspacePath, fileName);
            await this.saveToFile(workflow);
        }

        this.workflows.set(workflow.id, workflow);
        this.emit('changed', { type: 'created', workflowId: workflow.id, workflow });

        return workflow;
    }

    async getById(id: string): Promise<Workflow | null> {
        return this.workflows.get(id) || null;
    }

    async update(id: string, updates: Partial<Workflow>): Promise<Workflow> {
        const workflow = this.workflows.get(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }

        // 更新属性
        if (updates.name !== undefined) workflow.name = updates.name;
        if (updates.description !== undefined) workflow.description = updates.description;
        if (updates.nodes !== undefined) workflow.nodes = updates.nodes;
        if (updates.edges !== undefined) workflow.edges = updates.edges;
        if (updates.variables !== undefined) workflow.variables = updates.variables;
        if (updates.settings !== undefined) workflow.settings = { ...workflow.settings, ...updates.settings };
        
        workflow.touch();

        if (workflow.filePath) {
            await this.saveToFile(workflow);
        }

        this.emit('changed', { type: 'updated', workflowId: id, workflow });
        return workflow;
    }

    async delete(id: string): Promise<void> {
        const workflow = this.workflows.get(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }

        if (workflow.filePath) {
            try {
                await fs.unlink(workflow.filePath);
            } catch (error) {
                console.error(`Failed to delete file ${workflow.filePath}:`, error);
            }
        }

        this.workflows.delete(id);
        this.emit('changed', { type: 'deleted', workflowId: id });
    }

    async list(): Promise<WorkflowSummary[]> {
        return Array.from(this.workflows.values()).map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            nodeCount: w.nodes.length,
            updatedAt: w.updatedAt,
            filePath: w.filePath || ''
        }));
    }

    async loadFromFile(filePath: string): Promise<Workflow> {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        data.filePath = filePath;
        
        // 如果没有 ID，生成一个
        if (!data.id) {
            data.id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const workflow = Workflow.fromJSON(data);
        this.workflows.set(workflow.id, workflow);
        this.emit('changed', { type: 'updated', workflowId: workflow.id, workflow });

        return workflow;
    }

    async saveToFile(workflow: Workflow, filePath?: string): Promise<void> {
        const targetPath = filePath || workflow.filePath;
        if (!targetPath) {
            throw new Error('No file path specified');
        }

        const content = JSON.stringify(workflow.toJSON(), null, 2);
        await fs.writeFile(targetPath, content, 'utf-8');
    }

    findIdByFilePath(filePath: string): string | null {
        for (const [id, workflow] of this.workflows) {
            if (workflow.filePath === filePath) {
                return id;
            }
        }
        return null;
    }

    exists(id: string): boolean {
        return this.workflows.has(id);
    }

    onChanged(callback: (event: { type: 'created' | 'updated' | 'deleted'; workflowId: string; workflow?: Workflow }) => void): void {
        this.on('changed', callback);
    }

    offChanged(callback: (event: { type: 'created' | 'updated' | 'deleted'; workflowId: string; workflow?: Workflow }) => void): void {
        this.off('changed', callback);
    }

    // 节点操作 - 这些是领域方法的代理
    async addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig> {
        const workflow = await this.getById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.addNode(node);
        await this.update(workflowId, { nodes: workflow.nodes });
        return node;
    }

    async updateNode(workflowId: string, nodeId: string, updates: Partial<NodeConfig>): Promise<NodeConfig> {
        const workflow = await this.getById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        const node = workflow.updateNode(nodeId, updates);
        await this.update(workflowId, { nodes: workflow.nodes });
        return node;
    }

    async deleteNode(workflowId: string, nodeId: string): Promise<void> {
        const workflow = await this.getById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.deleteNode(nodeId);
        await this.update(workflowId, { nodes: workflow.nodes, edges: workflow.edges });
    }
}
