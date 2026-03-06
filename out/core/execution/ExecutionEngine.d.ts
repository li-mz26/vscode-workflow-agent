import { Workflow, ExecutionState, ExecutionResult, LogEntry } from '../../shared/types';
import { EventEmitter } from 'events';
export declare class ExecutionEngine extends EventEmitter {
    private workflow;
    private context;
    private nodeMap;
    private state;
    private executionId;
    private logs;
    private breakpoints;
    private currentNodeId;
    private abortController;
    private pausePromise;
    private pauseResolve;
    constructor(workflow: Workflow);
    private initializeNodes;
    start(inputs?: Record<string, any>): Promise<ExecutionResult>;
    private executeFromNode;
    private executeNode;
    private collectNodeInputs;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(): Promise<void>;
    stepOver(): Promise<void>;
    setBreakpoint(nodeId: string): void;
    removeBreakpoint(nodeId: string): void;
    getBreakpoints(): string[];
    getState(): ExecutionState;
    getCurrentNode(): string | null;
    getVariables(): Record<string, any>;
    getLogs(): LogEntry[];
    private log;
}
//# sourceMappingURL=ExecutionEngine.d.ts.map