export interface Position {
    x: number;
    y: number;
}
export interface Size {
    width: number;
    height: number;
}
export interface Port {
    id: string;
    name: string;
    type: 'data' | 'control';
    dataType: string;
    required: boolean;
    description?: string;
}
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
export interface Variable {
    name: string;
    type: string;
    defaultValue?: any;
    description?: string;
}
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
export interface WorkflowSettings {
    timeout: number;
    retryPolicy?: RetryPolicy;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
export interface RetryPolicy {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
}
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
export interface CreateWorkflowDTO {
    name: string;
    description?: string;
    nodes?: NodeConfig[];
    edges?: Edge[];
    variables?: Variable[];
    settings?: Partial<WorkflowSettings>;
}
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
export interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    nodeId?: string;
    message: string;
    data?: any;
}
export interface ExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs: LogEntry[];
    duration: number;
}
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
export interface NodeExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs?: string[];
}
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
}
export interface WorkflowSummary {
    id: string;
    name: string;
    description?: string;
    nodeCount: number;
    updatedAt: string;
    filePath: string;
}
export interface WorkflowChangeEvent {
    type: 'created' | 'updated' | 'deleted';
    workflowId: string;
    workflow?: Workflow;
}
//# sourceMappingURL=index.d.ts.map