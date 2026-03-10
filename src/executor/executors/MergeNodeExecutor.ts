// ============================================
// Executor 层 - Merge 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class MergeNodeExecutor extends NodeExecutorBase {
    type = 'merge';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const data = node.data || {};
        const { strategy = 'all' } = data;

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
