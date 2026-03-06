import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
export declare abstract class NodeExecutor {
    abstract readonly type: string;
    abstract execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    abstract validate(config: Record<string, any>): ValidationResult;
    protected resolveInputs(node: NodeConfig, context: ExecutionContext): Record<string, any>;
}
export declare class StartNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class EndNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private resolvePath;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class CodeNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private executePython;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class LLMNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private renderTemplate;
    private callLLM;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class SwitchNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private evaluateCondition;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class ParallelNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class MergeNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    validate(config: Record<string, any>): ValidationResult;
}
export declare class NodeExecutorFactory {
    private static executors;
    static create(type: string): NodeExecutor;
    static register(type: string, executorClass: new () => NodeExecutor): void;
}
//# sourceMappingURL=NodeExecutorFactory.d.ts.map