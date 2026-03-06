"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const events_1 = require("events");
const NodeRegistry_1 = require("../node/NodeRegistry");
class WorkflowManager extends events_1.EventEmitter {
    constructor(context) {
        super();
        this.context = context;
        this.workflows = new Map();
        this.nodeRegistry = new NodeRegistry_1.NodeRegistry();
        this.initialize();
    }
    async initialize() {
        // 扫描工作区中的工作流文件
        await this.scanWorkflowFiles();
        // 监听文件变化
        this.setupFileWatcher();
    }
    async scanWorkflowFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders)
            return;
        for (const folder of workspaceFolders) {
            const pattern = new vscode.RelativePattern(folder, '**/*.workflow.json');
            const files = await vscode.workspace.findFiles(pattern);
            for (const file of files) {
                try {
                    await this.loadFromFile(file.fsPath);
                }
                catch (error) {
                    console.error(`Failed to load workflow from ${file.fsPath}:`, error);
                }
            }
        }
    }
    setupFileWatcher() {
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
    getWorkflowIdFromPath(filePath) {
        for (const [id, workflow] of this.workflows) {
            if (workflow.filePath === filePath) {
                return id;
            }
        }
        return null;
    }
    async createWorkflow(config) {
        const id = this.generateId();
        const now = new Date().toISOString();
        // 创建默认的 Start 和 End 节点
        const startNode = this.nodeRegistry.createNode('start', { x: 100, y: 100 });
        const endNode = this.nodeRegistry.createNode('end', { x: 500, y: 100 });
        const workflow = {
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
        // 确定文件路径
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }
        const fileName = `${config.name.toLowerCase().replace(/\s+/g, '-')}.workflow.json`;
        workflow.filePath = path.join(workspaceFolder.uri.fsPath, fileName);
        // 保存到文件
        await this.saveToFile(workflow);
        this.workflows.set(id, workflow);
        this.emit('changed', { type: 'created', workflowId: id, workflow });
        return workflow;
    }
    async getWorkflow(id) {
        return this.workflows.get(id) || null;
    }
    async updateWorkflow(id, updates) {
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
    async deleteWorkflow(id) {
        const workflow = this.workflows.get(id);
        if (!workflow) {
            throw new Error(`Workflow not found: ${id}`);
        }
        if (workflow.filePath) {
            try {
                await fs.unlink(workflow.filePath);
            }
            catch (error) {
                console.error(`Failed to delete file ${workflow.filePath}:`, error);
            }
        }
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
    async loadFromFile(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const workflow = JSON.parse(content);
        workflow.filePath = filePath;
        // 如果没有 ID，生成一个
        if (!workflow.id) {
            workflow.id = this.generateId();
        }
        this.workflows.set(workflow.id, workflow);
        this.emit('changed', { type: 'updated', workflowId: workflow.id, workflow });
        return workflow;
    }
    async saveToFile(workflow, filePath) {
        const targetPath = filePath || workflow.filePath;
        if (!targetPath) {
            throw new Error('No file path specified');
        }
        const content = JSON.stringify(workflow, null, 2);
        await fs.writeFile(targetPath, content, 'utf-8');
    }
    validateWorkflow(workflow) {
        const errors = [];
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
        const nodeIds = new Set();
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
    async addNode(workflowId, node) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        workflow.nodes.push(node);
        await this.updateWorkflow(workflowId, { nodes: workflow.nodes });
        return node;
    }
    async updateNode(workflowId, nodeId, updates) {
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
    async deleteNode(workflowId, nodeId) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
        workflow.edges = workflow.edges.filter(e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId);
        await this.updateWorkflow(workflowId, {
            nodes: workflow.nodes,
            edges: workflow.edges
        });
    }
    // 边操作
    async addEdge(workflowId, edge) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        workflow.edges.push(edge);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });
        return edge;
    }
    async deleteEdge(workflowId, edgeId) {
        const workflow = await this.getWorkflow(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        workflow.edges = workflow.edges.filter(e => e.id !== edgeId);
        await this.updateWorkflow(workflowId, { edges: workflow.edges });
    }
    onWorkflowChanged(callback) {
        this.on('changed', callback);
    }
    generateId() {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.WorkflowManager = WorkflowManager;
//# sourceMappingURL=WorkflowManager.js.map