// ============================================
// Executor 层 - Code 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class CodeNodeExecutor extends NodeExecutorBase {
    type = 'code';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { code, timeout = 30 } = node.data;
        const inputs = this.resolveInputs(node, context);

        try {
            // 这里应该调用 Python 沙箱执行
            // 暂时使用模拟实现
            const result = await this.executePython(code, inputs, timeout);
            
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
        // TODO: 集成 Python 沙箱 (Pyodide 或子进程)
        // 临时返回模拟结果
        return { code, inputs, executed: true };
    }

    validate(config: Record<string, any>): ValidationResult {
        if (!config.code || typeof config.code !== 'string') {
            return { valid: false, errors: ['Code is required'] };
        }
        return { valid: true };
    }
}
