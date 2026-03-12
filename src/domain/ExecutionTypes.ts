// ============================================
// Domain 层 - 执行相关类型定义
// ============================================

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

// 执行结果
export interface ExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs: LogEntry[];
    duration: number;
}

// 执行事件类型
export interface ExecutionEventMap {
    'started': { executionId: string };
    'completed': { executionId: string; outputs: Record<string, any> };
    'failed': { executionId: string; error: any };
    'stopped': { executionId: string };
    'paused': { executionId: string };
    'resumed': { executionId: string };
    'breakpoint:hit': { executionId: string; nodeId: string };
    'node:started': { executionId: string; nodeId: string };
    'node:completed': { executionId: string; nodeId: string; outputs?: Record<string, any> };
    'node:failed': { executionId: string; nodeId: string; error: any };
}

// 执行节点状态
export interface ExecutionNode {
    nodeId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    inputs: Map<string, any>;
    outputs?: Record<string, any>;
    error?: Error;
    startTime?: Date;
    endTime?: Date;
}
