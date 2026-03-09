import { 
    NodeConfig, 
    ExecutionContext, 
    NodeExecutionResult,
    ValidationResult 
} from '../../../shared/types/index';

// 节点执行器抽象基类
export abstract class NodeExecutor {
    abstract readonly type: string;

    abstract execute(
        node: NodeConfig,
        context: ExecutionContext
    ): Promise<NodeExecutionResult>;

    abstract validate(config: Record<string, any>): ValidationResult;

    protected resolveInputs(node: NodeConfig, context: ExecutionContext): Record<string, any> {
        return context.inputs;
    }
}

// Start 节点执行器
export class StartNodeExecutor extends NodeExecutor {
    type = 'start';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        return {
            success: true,
            outputs: { trigger: context.inputs }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        return { valid: true };
    }
}

// End 节点执行器
export class EndNodeExecutor extends NodeExecutor {
    type = 'end';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { outputMapping = {} } = node.data;
        
        const outputs: Record<string, any> = {};
        for (const [key, path] of Object.entries(outputMapping)) {
            outputs[key] = this.resolvePath(path as string, context);
        }

        return {
            success: true,
            outputs
        };
    }

    private resolvePath(path: string, context: ExecutionContext): any {
        // 支持简单的路径解析: nodeId.portId
        const parts = path.split('.');
        if (parts.length === 2) {
            return context.variables.get(path);
        }
        return undefined;
    }

    validate(config: Record<string, any>): ValidationResult {
        return { valid: true };
    }
}

// Switch 节点执行器
export class SwitchNodeExecutor extends NodeExecutor {
    type = 'switch';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { conditions = [], defaultTarget = 'default' } = node.data;
        const input = context.inputs['input'];

        for (const condition of conditions) {
            try {
                const result = this.evaluateCondition(condition.expression, input, context);
                if (result) {
                    return {
                        success: true,
                        outputs: { branch: condition.target || condition.name }
                    };
                }
            } catch (e) {
                console.warn(`Condition evaluation failed: ${condition.expression}`, e);
            }
        }

        // 默认分支
        return {
            success: true,
            outputs: { branch: defaultTarget }
        };
    }

    private evaluateCondition(
        expression: string, 
        input: any, 
        context: ExecutionContext
    ): boolean {
        // 安全的表达式求值
        // 支持: input.property, ctx.variable, 比较运算符
        try {
            const ctx = Object.fromEntries(context.variables);
            const fn = new Function('input', 'ctx', `return ${expression}`);
            return fn(input, ctx);
        } catch (e) {
            return false;
        }
    }

    validate(config: Record<string, any>): ValidationResult {
        if (!Array.isArray(config.conditions)) {
            return { valid: false, errors: ['Conditions must be an array'] };
        }
        return { valid: true };
    }
}

// Parallel 节点执行器
export class ParallelNodeExecutor extends NodeExecutor {
    type = 'parallel';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { branches = [] } = node.data;
        
        // Parallel 节点只是标记，实际并行由执行引擎调度
        return {
            success: true,
            outputs: {
                parallel: true,
                branchCount: branches.length
            }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        return { valid: true };
    }
}

// Merge 节点执行器
export class MergeNodeExecutor extends NodeExecutor {
    type = 'merge';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { strategy = 'all' } = node.data;
        
        // 收集所有输入
        const inputs: Record<string, any> = {};
        for (const [key, value] of Object.entries(context.inputs)) {
            inputs[key] = value;
        }

        return {
            success: true,
            outputs: {
                result: inputs,
                strategy,
                mergedCount: Object.keys(inputs).length
            }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        return { valid: true };
    }
}

// 执行器工厂
export class NodeExecutorFactory {
    private static executors: Map<string, new () => NodeExecutor> = new Map([
        ['start', StartNodeExecutor],
        ['end', EndNodeExecutor],
        ['switch', SwitchNodeExecutor],
        ['parallel', ParallelNodeExecutor],
        ['merge', MergeNodeExecutor]
    ]);

    static create(type: string): NodeExecutor {
        // 动态导入执行器
        switch (type) {
            case 'code':
                const { CodeNodeExecutor } = require('./CodeNodeExecutor');
                return new CodeNodeExecutor();
            case 'llm':
                const { LLMNodeExecutor } = require('./LLMNodeExecutor');
                return new LLMNodeExecutor();
            case 'http':
                const { HTTPNodeExecutor } = require('./HTTPNodeExecutor');
                return new HTTPNodeExecutor();
            case 'webhook':
                const { WebhookNodeExecutor } = require('./WebhookNodeExecutor');
                return new WebhookNodeExecutor();
            case 'schedule':
                const { ScheduleNodeExecutor } = require('./ScheduleNodeExecutor');
                return new ScheduleNodeExecutor();
            default:
                const ExecutorClass = this.executors.get(type);
                if (!ExecutorClass) {
                    throw new Error(`No executor found for node type: ${type}`);
                }
                return new ExecutorClass();
        }
    }

    static register(type: string, executorClass: new () => NodeExecutor): void {
        this.executors.set(type, executorClass);
    }
}
