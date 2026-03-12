// ============================================
// Executor 层 - Parallel 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class ParallelNodeExecutor extends NodeExecutorBase {
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
