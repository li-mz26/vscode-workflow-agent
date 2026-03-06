// ============================================
// Executor 层 - Switch 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class SwitchNodeExecutor extends NodeExecutorBase {
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
