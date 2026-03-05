import { 
    NodeConfig, 
    ExecutionContext, 
    NodeExecutionResult,
    ValidationResult 
} from '../../shared/types';

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

// Code 节点执行器
export class CodeNodeExecutor extends NodeExecutor {
    type = 'code';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { code, timeout = 30 } = node.data;
        const inputs = this.resolveInputs(node, context);

        try {
            // 这里应该调用 Python 沙箱执行
            // 暂时使用模拟实现
            const result = await this.executePython(code, inputs, timeout);
            
            return {
                success: true,
                outputs: { output: result },
                logs: ['Code executed successfully']
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                logs: [`Error: ${(error as Error).message}`]
            };
        }
    }

    private async executePython(
        code: string, 
        inputs: Record<string, any>, 
        timeout: number
    ): Promise<any> {
        // TODO: 集成 Python 沙箱 (Pyodide 或子进程)
        // 临时返回模拟结果
        return { code, inputs, executed: true };
    }

    validate(config: Record<string, any>): ValidationResult {
        if (!config.code || typeof config.code !== 'string') {
            return { valid: false, errors: ['Code is required'] };
        }
        return { valid: true };
    }
}

// LLM 节点执行器
export class LLMNodeExecutor extends NodeExecutor {
    type = 'llm';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { 
            model, 
            prompt: promptTemplate, 
            systemPrompt: systemTemplate,
            temperature = 0.7, 
            maxTokens = 2000 
        } = node.data;

        const inputs = this.resolveInputs(node, context);

        try {
            // 渲染模板
            const prompt = this.renderTemplate(promptTemplate, inputs, context);
            const system = systemTemplate ? this.renderTemplate(systemTemplate, inputs, context) : undefined;

            // TODO: 调用实际的 LLM API
            // 临时返回模拟结果
            const mockResponse = await this.callLLM(model, prompt, system, temperature, maxTokens);

            return {
                success: true,
                outputs: {
                    content: mockResponse.content,
                    usage: mockResponse.usage
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error
            };
        }
    }

    private renderTemplate(
        template: string, 
        inputs: Record<string, any>, 
        context: ExecutionContext
    ): string {
        // 简单的模板替换: {{variable}} 或 {{ctx.variable}}
        return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match, name, subname) => {
            if (name === 'ctx' && subname) {
                return context.variables.get(subname) ?? match;
            }
            return inputs[name] ?? context.variables.get(name) ?? match;
        });
    }

    private async callLLM(
        model: string,
        prompt: string,
        systemPrompt: string | undefined,
        temperature: number,
        maxTokens: number
    ): Promise<{ content: string; usage: any }> {
        // TODO: 集成实际的 LLM 调用
        // 临时返回模拟结果
        return {
            content: `Mock response for: ${prompt.substring(0, 50)}...`,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        if (!config.model) errors.push('Model is required');
        if (!config.prompt) errors.push('Prompt is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
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
        ['code', CodeNodeExecutor],
        ['llm', LLMNodeExecutor],
        ['switch', SwitchNodeExecutor],
        ['parallel', ParallelNodeExecutor],
        ['merge', MergeNodeExecutor]
    ]);

    static create(type: string): NodeExecutor {
        const ExecutorClass = this.executors.get(type);
        if (!ExecutorClass) {
            throw new Error(`No executor found for node type: ${type}`);
        }
        return new ExecutorClass();
    }

    static register(type: string, executorClass: new () => NodeExecutor): void {
        this.executors.set(type, executorClass);
    }
}
