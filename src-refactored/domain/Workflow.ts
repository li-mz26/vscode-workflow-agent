/**
 * 领域层 - 实体和值对象
 * 包含工作流、节点、边的核心定义
 */

// ==================== 值对象 ====================

export interface Position {
    readonly x: number;
    readonly y: number;
}

export interface Size {
    readonly width: number;
    readonly height: number;
}

export interface Port {
    readonly id: string;
    readonly name: string;
    readonly type: 'data' | 'control';
    readonly dataType: string;
    readonly required?: boolean;
    readonly description?: string;
}

// ==================== 节点实体 ====================

export interface NodeConfig {
    readonly id: string;
    readonly type: string;
    readonly position: Position;
    readonly size?: Size;
    readonly data: Record<string, any>;
    readonly inputs: Port[];
    readonly outputs: Port[];
    readonly metadata?: {
        readonly name?: string;
        readonly description?: string;
        readonly icon?: string;
        readonly color?: string;
    };
}

// ==================== 边实体 ====================

export interface Edge {
    readonly id: string;
    readonly source: {
        readonly nodeId: string;
        readonly portId: string;
    };
    readonly target: {
        readonly nodeId: string;
        readonly portId: string;
    };
    readonly type?: 'default' | 'conditional';
    readonly condition?: string;
}

// ==================== 工作流实体 ====================

export interface Variable {
    readonly name: string;
    readonly type: string;
    readonly defaultValue?: any;
    readonly description?: string;
}

export interface WorkflowSettings {
    readonly timeout: number;
    readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
    readonly retryPolicy?: {
        readonly maxRetries: number;
        readonly retryDelay: number;
        readonly exponentialBackoff: boolean;
    };
    readonly schedule?: {
        readonly cron: string;
        readonly timezone: string;
        readonly enabled: boolean;
    };
}

export interface Workflow {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly version: string;
    readonly nodes: NodeConfig[];
    readonly edges: Edge[];
    readonly variables: Variable[];
    readonly settings: WorkflowSettings;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly filePath?: string;
}

// ==================== 工作流摘要 ====================

export interface WorkflowSummary {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly nodeCount: number;
    readonly updatedAt: string;
    readonly filePath?: string;
}

// ==================== 创建DTO ====================

export interface CreateWorkflowDTO {
    readonly name: string;
    readonly description?: string;
    readonly nodes?: NodeConfig[];
    readonly edges?: Edge[];
    readonly variables?: Variable[];
    readonly settings?: Partial<WorkflowSettings>;
}

// ==================== 验证结果 ====================

export interface ValidationResult {
    readonly valid: boolean;
    readonly errors?: string[];
}

// ==================== 变更事件 ====================

export type WorkflowChangeType = 'created' | 'updated' | 'deleted';

export interface WorkflowChangeEvent {
    readonly type: WorkflowChangeType;
    readonly workflowId: string;
    readonly workflow?: Workflow;
    readonly timestamp: number;
}
