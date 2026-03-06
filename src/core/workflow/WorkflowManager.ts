import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
    Workflow, 
    CreateWorkflowDTO, 
    WorkflowSummary, 
    WorkflowChangeEvent,
    NodeConfig,
    Edge,
    ValidationResult 
} from '../../shared/types';
import { EventEmitter } from 'events';
import { NodeRegistry } from '../node/NodeRegistry';

export class WorkflowManager extends EventEmitter {
    private workflows: Map<string, Workflow> = new Map();
    private nodeRegistry: NodeRegistry;

    constructor(private context: vscode.ExtensionContext) {
        super();
        this.nodeRegistry = new NodeRegistry();
        this.initialize();
    }

    private async initialize(): Promise<void> {
        // 扫描工作区中的工作流文件
        await this.scanWorkflowFiles();
        
        // 监听文件变化
        this.setupFileWatcher();
    }

    private async scanWorkflowFiles(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        for (const folder of workspaceFolders) {
            const pattern = new vscode.RelativePattern(folder, '**/*.workflow.json');
            const files = await vscode.workspace.findFiles(pattern);
            
            for (const file of files) {
                try {
                    await this.loadFromFile(file.fsPath);
                } catch (error) {
                    console.error(`Failed to load workflow from ${file.fsPath}:`, error);
                }
            }
        }
    }

    private setupFileWatcher(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.workflow.json');
        
        watcher.onDidCreate(async (uri) => {
            await this.loadFromFile(uri.fsPath);
        });
        
        watcher.onDidChange(async (uri) => {
            await this.loadFromFile(uri.fsPath);
        });
        
        watcher.onDidDelete((uri) => {
            const workflowId = this.getWorkflowIdFromPath(uri.fsPath);
            if (workflowId) {
                this.workflows.delete(workflowId);
                this.emit('changed', { type: 'deleted', workflowId });
            }
        });
    }

    private getWorkflowIdFromPath(filePath: string): string | null {
        for (const [id, workflow] of this.workflows) {
            if (workflow.filePath === filePath) {
                return id;
            }
        }
        return null;
    }

    async createWorkflow(config: CreateWorkflowDTO): Promise<Workflow> {
        const id = this.generateId();
        const now = new Date().toISOString();
        
        // 创建默认的 Start 和 End 节点
        const startNode = this.nodeRegistry.createNode('start', { x: 100, y: 100 });
        const endNode = this.nodeRegistry.createNode('end', { x: 500, y: 100 });
        
        const workflow: Workflow = {
            id,
            name: config.name,
            description: config.description || '',
            version: '1.0.0',
            nodes: config.nodes || [startNode, endNode],
            edges: config.edges || [],
            variables: config.variables || [],
            settings: {
                timeout: 30,
                logLevel: 'info',
                ...config.settings
            },
            createdAt: now,
            updatedAt: now
        };

        // 确定文件路径 - 优先使用提供的文件夹路径
        let targetFolder: string | undefined;
        
        if (config.folderPath) {
            targetFolder = config.folderPath;
        } else {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                targetFolder = workspaceFolder.uri.fsPath;
            }
        }

        if (!targetFolder) {
            throw new Error('No folder selected. Please open a workflow folder first.');
        }

        const fileName = `${config.name.toLowerCase().replace(/\s+/g, '-')}.workflow.json`;
        workflow.filePath = path.join(targetFolder, fileName);

        // 保存到文件
        await this.saveToFile(workflow);

        this.workflows.set(id, workflow);
        this.emit('changed', { type: 'created', workflowId: id, workflow });

        return workflow;
    }

    async getWorkflow(id: string): Promise<Workflow | null> {
        return this.workflows.get(id) || null;
    }

    async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
        const workflow = this.workflows.get(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }

        Object.assign(workflow, updates, { updatedAt: new Date().toISOString() });
        
        if (workflow.filePath) {
            await this.saveToFile(workflow);
        }

        this.emit('changed', { type: 'updated', workflowId: id, workflow });
        return workflow;
    }

    async deleteWorkflow(id: string): Promise<void> {
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

    async listWorkflows(): Promise<WorkflowSummary[]> {
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
        const workflow = JSON.parse(content) as Workflow;
        
        workflow.filePath = filePath;
        
        // 如果没有 ID，生成一个
        if (!workflow.id) {
            workflow.id = this.generateId();
        }

        this.workflows.set(workflow.id, workflow);
        this.emit('changed', { type: 'updated', workflowId: workflow.id, workflow });

        return workflow;
    }

    async saveToFile(workflow: Workflow, filePath?: string): Promise<void> {
        const targetPath = filePath || workflow.filePath;
        if (!targetPath) {
            throw new Error('No file path specified');
        }

        const content = JSON.stringify(workflow, null, 2);
        await fs.writeFile(targetPath, content, 'utf-8');
    }

    validateWorkflow(workflow: Workflow): ValidationResult {
        const errors: string[] = [];

        // 检查必需的节点
        const hasStart = workflow.nodes.some(n => n.type === 'start');
        const hasEnd = workflow.nodes.some(n => n.type === 'end');

        if (!hasStart) {
            errors.push('Workflow must have a Start node');
        }
        if (!hasEnd) {
            errors.push('Workflow must have an End node');
        }

        // 检查节点 ID 唯一性
        const nodeIds = new Set<string>();
        for (const node of workflow.nodes) {
            if (nodeIds.has(node.id)) {
                errors.push(`Duplicate node ID: ${node.id}`);
            }
            nodeIds.add(node.id);
        }

        // 检查边是否有效
        for (const edge of workflow.edges) {
            const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
            const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);

            if (!sourceNode) {
                errors.push(`Edge references non-existent source node: ${edge.source.nodeId}`);
            }
            if (!targetNode) {
                errors.push(`Edge references non-existent target node: ${edge.target.nodeId}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    // 节点操作
    async addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.nodes.push(node);
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes });

        return node;
    }

    async updateNode(workflowId: string, nodeId: string, updates: Partial<NodeConfig>): Promise<NodeConfig> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        const nodeIndex = workflow.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) {
            throw new Error(`Node not found: ${nodeId}`);
        }

        workflow.nodes[nodeIndex] = { ...workflow.nodes[nodeIndex], ...updates };
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes });

        return workflow.nodes[nodeIndex];
    }

    async deleteNode(workflowId: string, nodeId: string): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
        workflow.edges = workflow.edges.filter(
            e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
        );

        await this.updateWorkflow(workflowId, { 
            nodes: workflow.nodes, 
            edges: workflow.edges 
        });
    }

    // 边操作
    async addEdge(workflowId: string, edge: Edge): Promise<Edge> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.edges.push(edge);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });

        return edge;
    }

    async deleteEdge(workflowId: string, edgeId: string): Promise<void> {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        workflow.edges = workflow.edges.filter(e => e.id !== edgeId);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });
    }

    onWorkflowChanged(callback: (event: WorkflowChangeEvent) => void): void {
        this.on('changed', callback);
    }

    private generateId(): string {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
