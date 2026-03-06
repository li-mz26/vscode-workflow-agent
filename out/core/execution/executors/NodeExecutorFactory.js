"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeExecutorFactory = exports.MergeNodeExecutor = exports.ParallelNodeExecutor = exports.SwitchNodeExecutor = exports.LLMNodeExecutor = exports.CodeNodeExecutor = exports.EndNodeExecutor = exports.StartNodeExecutor = exports.NodeExecutor = void 0;
// 节点执行器抽象基类
class NodeExecutor {
    resolveInputs(node, context) {
        return context.inputs;
    }
}
exports.NodeExecutor = NodeExecutor;
// Start 节点执行器
class StartNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'start';
    }
    async execute(node, context) {
        return {
            success: true,
            outputs: { trigger: context.inputs }
        };
    }
    validate(config) {
        return { valid: true };
    }
}
exports.StartNodeExecutor = StartNodeExecutor;
// End 节点执行器
class EndNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'end';
    }
    async execute(node, context) {
        const { outputMapping = {} } = node.data;
        const outputs = {};
        for (const [key, path] of Object.entries(outputMapping)) {
            outputs[key] = this.resolvePath(path, context);
        }
        return {
            success: true,
            outputs
        };
    }
    resolvePath(path, context) {
        // 支持简单的路径解析: nodeId.portId
        const parts = path.split('.');
        if (parts.length === 2) {
            return context.variables.get(path);
        }
        return undefined;
    }
    validate(config) {
        return { valid: true };
    }
}
exports.EndNodeExecutor = EndNodeExecutor;
// Code 节点执行器
class CodeNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'code';
    }
    async execute(node, context) {
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
        }
        catch (error) {
            return {
                success: false,
                error: error,
                logs: [`Error: ${error.message}`]
            };
        }
    }
    async executePython(code, inputs, timeout) {
        // TODO: 集成 Python 沙箱 (Pyodide 或子进程)
        // 临时返回模拟结果
        return { code, inputs, executed: true };
    }
    validate(config) {
        if (!config.code || typeof config.code !== 'string') {
            return { valid: false, errors: ['Code is required'] };
        }
        return { valid: true };
    }
}
exports.CodeNodeExecutor = CodeNodeExecutor;
// LLM 节点执行器
class LLMNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'llm';
    }
    async execute(node, context) {
        const { model, prompt: promptTemplate, systemPrompt: systemTemplate, temperature = 0.7, maxTokens = 2000 } = node.data;
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
        }
        catch (error) {
            return {
                success: false,
                error: error
            };
        }
    }
    renderTemplate(template, inputs, context) {
        // 简单的模板替换: {{variable}} 或 {{ctx.variable}}
        return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match, name, subname) => {
            if (name === 'ctx' && subname) {
                return context.variables.get(subname) ?? match;
            }
            return inputs[name] ?? context.variables.get(name) ?? match;
        });
    }
    async callLLM(model, prompt, systemPrompt, temperature, maxTokens) {
        // TODO: 集成实际的 LLM 调用
        // 临时返回模拟结果
        return {
            content: `Mock response for: ${prompt.substring(0, 50)}...`,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        };
    }
    validate(config) {
        const errors = [];
        if (!config.model)
            errors.push('Model is required');
        if (!config.prompt)
            errors.push('Prompt is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
exports.LLMNodeExecutor = LLMNodeExecutor;
// Switch 节点执行器
class SwitchNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'switch';
    }
    async execute(node, context) {
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
            }
            catch (e) {
                console.warn(`Condition evaluation failed: ${condition.expression}`, e);
            }
        }
        // 默认分支
        return {
            success: true,
            outputs: { branch: defaultTarget }
        };
    }
    evaluateCondition(expression, input, context) {
        // 安全的表达式求值
        // 支持: input.property, ctx.variable, 比较运算符
        try {
            const ctx = Object.fromEntries(context.variables);
            const fn = new Function('input', 'ctx', `return ${expression}`);
            return fn(input, ctx);
        }
        catch (e) {
            return false;
        }
    }
    validate(config) {
        if (!Array.isArray(config.conditions)) {
            return { valid: false, errors: ['Conditions must be an array'] };
        }
        return { valid: true };
    }
}
exports.SwitchNodeExecutor = SwitchNodeExecutor;
// Parallel 节点执行器
class ParallelNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'parallel';
    }
    async execute(node, context) {
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
    validate(config) {
        return { valid: true };
    }
}
exports.ParallelNodeExecutor = ParallelNodeExecutor;
// Merge 节点执行器
class MergeNodeExecutor extends NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'merge';
    }
    async execute(node, context) {
        const { strategy = 'all' } = node.data;
        // 收集所有输入
        const inputs = {};
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
    validate(config) {
        return { valid: true };
    }
}
exports.MergeNodeExecutor = MergeNodeExecutor;
// 执行器工厂
class NodeExecutorFactory {
    static create(type) {
        // 动态导入新节点执行器
        switch (type) {
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
    static register(type, executorClass) {
        this.executors.set(type, executorClass);
    }
}
exports.NodeExecutorFactory = NodeExecutorFactory;
NodeExecutorFactory.executors = new Map([
    ['start', StartNodeExecutor],
    ['end', EndNodeExecutor],
    ['code', CodeNodeExecutor],
    ['llm', LLMNodeExecutor],
    ['switch', SwitchNodeExecutor],
    ['parallel', ParallelNodeExecutor],
    ['merge', MergeNodeExecutor]
]);
//# sourceMappingURL=NodeExecutorFactory.js.map