/**
 * End 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class EndNodeExecutor implements INodeExecutor {
    readonly type = 'end';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { outputMapping = {} } = node.data;
        const outputs: Record<string, any> = {};
        
        for (const [key, path] of Object.entries(outputMapping)) {
            outputs[key] = this.resolvePath(path as string, context);
        }
        
        return {
            success: true,
            outputs
        };
    }
    
    private resolvePath(path: string, context: ExecutionContext): any {
        const parts = path.split('.');
        if (parts.length === 2) {
            return context.variables.get(path);
        }
        return undefined;
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }
}
