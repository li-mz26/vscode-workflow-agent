/**
 * Code 节点执行器 - Python 代码执行
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class CodeNodeExecutor implements INodeExecutor {
    readonly type = 'code';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { code, timeout = 30 } = node.data;
        
        try {
            // 这里应该调用 Python 沙箱
            // 暂时返回模拟结果
            const result = await this.executePython(code, context.inputs, timeout);
            
            return {
                success: true,
                outputs: { output: result },
                logs: ['Code executed successfully']
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                logs: [`Error: ${(error as Error).message}`]
            };
        }
    }
    
    private async executePython(
        code: string,
        inputs: Record<string, any>,
        timeout: number
    ): Promise<any> {
        // TODO: 集成 Python 沙箱
        return { code, inputs, executed: true };
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        if (!config.code || typeof config.code !== 'string') {
            return { valid: false, errors: ['Code is required'] };
        }
        return { valid: true };
    }
}
