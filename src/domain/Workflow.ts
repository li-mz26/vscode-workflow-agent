// ============================================
// Domain 层 - 实体、值对象
// ============================================

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

// 端口定义
export interface Port {
    id: string;
    name: string;
    type: 'data' | 'control';
    dataType: string;
    required: boolean;
    description?: string;
}

// 节点配置
export interface NodeConfig {
    id: string;
    type: string;
    position: Position;
    size?: Size;
    data?: Record<string, any>;
    inputs: Port[];
    outputs: Port[];
    metadata?: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
    };
    configRef?: string;
}

// 边（连接）定义
export interface Edge {
    id: string;
    source: {
        nodeId: string;
        portId: string;
    };
    target: {
        nodeId: string;
        portId: string;
    };
    type?: 'default' | 'conditional';
    condition?: string;
}

// 变量定义
export interface Variable {
    name: string;
    type: string;
    defaultValue?: any;
    description?: string;
}

// 工作流设置
export interface WorkflowSettings {
    timeout: number;
    retryPolicy?: RetryPolicy;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    schedule?: {
        cron: string;
        timezone: string;
        enabled: boolean;
    };
}

export interface RetryPolicy {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
}

// 工作流定义 - 领域实体
export class Workflow {
    id: string;
    name: string;
    description?: string;
    version: string;
    nodes: NodeConfig[];
    edges: Edge[];
    variables: Variable[];
    settings: WorkflowSettings;
    createdAt: string;
    updatedAt: string;
    filePath?: string;

    constructor(config: Partial<Workflow> = {}) {
        const now = new Date().toISOString();
        this.id = config.id || this.generateId();
        this.name = config.name || 'Untitled Workflow';
        this.description = config.description || '';
        this.version = config.version || '1.0.0';
        this.nodes = config.nodes || [];
        this.edges = config.edges || [];
        this.variables = config.variables || [];
        this.settings = config.settings || { timeout: 30, logLevel: 'info' };
        this.createdAt = config.createdAt || now;
        this.updatedAt = config.updatedAt || now;
        this.filePath = config.filePath;
    }

    private generateId(): string {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 领域方法：验证工作流
    validate(): ValidationResult {
        const errors: string[] = [];

        // 检查必需的节点
        const hasStart = this.nodes.some(n => n.type === 'start');
        const hasEnd = this.nodes.some(n => n.type === 'end');

        if (!hasStart) {
            errors.push('Workflow must have a Start node');
        }
        if (!hasEnd) {
            errors.push('Workflow must have an End node');
        }

        // 检查节点 ID 唯一性
        const nodeIds = new Set<string>();
        for (const node of this.nodes) {
            if (nodeIds.has(node.id)) {
                errors.push(`Duplicate node ID: ${node.id}`);
            }
            nodeIds.add(node.id);
        }

        // 检查边是否有效
        for (const edge of this.edges) {
            const sourceNode = this.nodes.find(n => n.id === edge.source.nodeId);
            const targetNode = this.nodes.find(n => n.id === edge.target.nodeId);

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

    // 领域方法：添加节点
    addNode(node: NodeConfig): void {
        this.nodes.push(node);
        this.touch();
    }

    // 领域方法：更新节点
    updateNode(nodeId: string, updates: Partial<NodeConfig>): NodeConfig {
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) {
            throw new Error(`Node not found: ${nodeId}`);
        }
        this.nodes[index] = { ...this.nodes[index], ...updates };
        this.touch();
        return this.nodes[index];
    }

    // 领域方法：删除节点
    deleteNode(nodeId: string): void {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.edges = this.edges.filter(
            e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
        );
        this.touch();
    }

    // 领域方法：添加边
    addEdge(edge: Edge): void {
        this.edges.push(edge);
        this.touch();
    }

    // 领域方法：删除边
    deleteEdge(edgeId: string): void {
        this.edges = this.edges.filter(e => e.id !== edgeId);
        this.touch();
    }

    // 更新时间戳
    touch(): void {
        this.updatedAt = new Date().toISOString();
    }

    // 转换为普通对象
    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: this.version,
            nodes: this.nodes,
            edges: this.edges,
            variables: this.variables,
            settings: this.settings,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            filePath: this.filePath
        };
    }

    // 从普通对象创建
    static fromJSON(data: any): Workflow {
        return new Workflow(data);
    }
}

// 验证结果
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
}

// 工作流摘要
export interface WorkflowSummary {
    id: string;
    name: string;
    description?: string;
    nodeCount: number;
    updatedAt: string;
    filePath: string;
}

// 工作流变更事件
export interface WorkflowChangeEvent {
    type: 'created' | 'updated' | 'deleted';
    workflowId: string;
    workflow?: Workflow;
}

// 创建工作流 DTO
export interface CreateWorkflowDTO {
    name: string;
    description?: string;
    nodes?: NodeConfig[];
    edges?: Edge[];
    variables?: Variable[];
    settings?: Partial<WorkflowSettings>;
}

// 更新工作流 DTO
export interface UpdateWorkflowDTO {
    name?: string;
    description?: string;
    nodes?: NodeConfig[];
    edges?: Edge[];
    variables?: Variable[];
    settings?: Partial<WorkflowSettings>;
}

// JSON Schema 类型
export interface JSONSchema {
    type: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    enum?: any[];
    description?: string;
    default?: any;
    minimum?: number;
    maximum?: number;
    items?: JSONSchema;
}

// 节点类型定义
export interface NodeTypeDefinition {
    type: string;
    category: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    inputs: Port[];
    outputs: Port[];
    configSchema: JSONSchema;
    defaultData: Record<string, any>;
    executor: string;
}
