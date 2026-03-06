/**
 * 执行上下文和结果定义
 */

export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export interface LogEntry {
    readonly timestamp: string;
    readonly level: 'debug' | 'info' | 'warn' | 'error';
    readonly message: string;
    readonly nodeId?: string;
    readonly data?: any;
}

export interface ExecutionContext {
    readonly variables: Map<string, any>;
    readonly inputs: Record<string, any>;
    readonly outputs: Record<string, any>;
    readonly metadata: {
        readonly startTime: Date;
        readonly endTime?: Date;
        readonly executionId: string;
    };
}

export interface NodeExecutionResult {
    readonly success: boolean;
    readonly outputs?: Record<string, any>;
    readonly error?: Error;
    readonly logs?: string[];
}

export interface ExecutionResult {
    readonly success: boolean;
    readonly outputs?: Record<string, any>;
    readonly error?: Error;
    readonly logs: LogEntry[];
    readonly duration: number;
}

// ==================== 节点类型定义 ====================

export interface JSONSchema {
    readonly type: string;
    readonly properties?: Record<string, JSONSchema>;
    readonly required?: string[];
    readonly enum?: any[];
    readonly description?: string;
    readonly default?: any;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly items?: JSONSchema;
}

export interface NodeTypeDefinition {
    readonly type: string;
    readonly category: string;
    readonly name: string;
    readonly description: string;
    readonly icon: string;
    readonly color: string;
    readonly inputs: import('./Workflow').Port[];
    readonly outputs: import('./Workflow').Port[];
    readonly configSchema: JSONSchema;
    readonly defaultData: Record<string, any>;
    readonly executor: string;
}
