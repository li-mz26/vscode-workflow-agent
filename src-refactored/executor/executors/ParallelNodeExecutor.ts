/**
 * Parallel 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class ParallelNodeExecutor implements INodeExecutor {
    readonly type = 'parallel';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { branches = [] } = node.data;
        
        return {
            success: true,
            outputs: {
                parallel: true,
                branchCount: branches.length
            }
        };
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }
}
