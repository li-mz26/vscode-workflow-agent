// ============================================
// 共享类型定义
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
    data: Record<string, any>;
    inputs: Port[];
    outputs: Port[];
    metadata?: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
    };
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

// 工作流定义
export interface Workflow {
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

// 创建工作流 DTO
export interface CreateWorkflowDTO {
    name: string;
    description?: string;
    nodes?: NodeConfig[];
    edges?: Edge[];
    variables?: Variable[];
    settings?: Partial<WorkflowSettings>;
    folderPath?: string;
}

// 执行状态
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

// 日志条目
export interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    nodeId?: string;
    message: string;
    data?: any;
}

// 执行结果
export interface ExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs: LogEntry[];
    duration: number;
}

// 执行上下文
export interface ExecutionContext {
    variables: Map<string, any>;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
    metadata: {
        startTime: Date;
        endTime?: Date;
        executionId: string;
    };
}

// 节点执行结果
export interface NodeExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs?: string[];
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
