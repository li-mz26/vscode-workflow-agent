// ============================================
// Executor 层 - Switch 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class SwitchNodeExecutor extends NodeExecutorBase {
    type = 'switch';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const data = node.data || {};
        const { conditions = [], defaultBranch = 'default' } = data;
        const input = context.inputs['input'];

        // 遍历条件，找到第一个匹配的分支
        for (const condition of conditions) {
            try {
                if (condition.expression) {
                    const result = this.evaluateCondition(condition.expression, input, context);
                    if (result) {
                        return {
                            success: true,
                            outputs: { branch: condition.name }
                        };
                    }
                }
            } catch (e) {
                console.warn(`Condition evaluation failed: ${condition.expression}`, e);
            }
        }

        // 没有匹配的条件，返回默认分支
        return {
            success: true,
            outputs: { branch: defaultBranch }
        };
    }

    private evaluateCondition(
        expression: string,
        input: any,
        context: ExecutionContext
    ): boolean {
        // TODO: 实现安全的表达式解析器
        // 当前使用 Function 构造器，存在安全风险
        try {
            const ctx = Object.fromEntries(context.variables);
            const fn = new Function('input', 'ctx', `return ${expression}`);
            return fn(input, ctx);
        } catch (e) {
            return false;
        }
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];

        if (config.branches && !Array.isArray(config.branches)) {
            errors.push('Branches must be an array');
        }

        if (config.conditions && !Array.isArray(config.conditions)) {
            errors.push('Conditions must be an array');
        }

        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
