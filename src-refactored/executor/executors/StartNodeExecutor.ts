/**
 * Start 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class StartNodeExecutor implements INodeExecutor {
    readonly type = 'start';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        return {
            success: true,
            outputs: { trigger: context.inputs }
        };
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }
}
