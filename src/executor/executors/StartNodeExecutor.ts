// ============================================
// Executor 层 - Start 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class StartNodeExecutor extends NodeExecutorBase {
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
