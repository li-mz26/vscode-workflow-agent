/**
 * Switch 节点执行器 - 条件分支
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class SwitchNodeExecutor implements INodeExecutor {
    readonly type = 'switch';
    
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
        try {
            const ctx = Object.fromEntries(context.variables);
            const fn = new Function('input', 'ctx', `return ${expression}`);
            return fn(input, ctx);
        } catch (e) {
            return false;
        }
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        if (!Array.isArray(config.conditions)) {
            return { valid: false, errors: ['Conditions must be an array'] };
        }
        return { valid: true };
    }
}
