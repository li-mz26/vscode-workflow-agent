/**
 * Merge 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class MergeNodeExecutor implements INodeExecutor {
    readonly type = 'merge';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { strategy = 'all' } = node.data;
        
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
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }
}
