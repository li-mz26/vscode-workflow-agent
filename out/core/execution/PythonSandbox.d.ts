import { EventEmitter } from 'events';
export interface PythonExecutionOptions {
    code: string;
    variables?: Record<string, any>;
    timeout?: number;
    environment?: Record<string, string>;
}
export interface PythonExecutionResult {
    success: boolean;
    output?: any;
    stdout?: string;
    stderr?: string;
    error?: Error;
}
export declare class PythonSandbox extends EventEmitter {
    private pythonPath;
    private activeProcesses;
    constructor();
    private getConfiguredPythonPath;
    execute(options: PythonExecutionOptions): Promise<PythonExecutionResult>;
    private generateSandboxScript;
    stopExecution(executionId: string): boolean;
    stopAllExecutions(): void;
    getPythonPath(): string;
    validatePython(): Promise<{
        valid: boolean;
        version?: string;
        error?: string;
    }>;
}
//# sourceMappingURL=PythonSandbox.d.ts.map