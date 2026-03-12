// ============================================
// Executor 层 - End 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class EndNodeExecutor extends NodeExecutorBase {
    type = 'end';

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
        // 支持简单的路径解析: nodeId.portId
        const parts = path.split('.');
        if (parts.length === 2) {
            return context.variables.get(path);
        }
        return undefined;
    }

    validate(config: Record<string, any>): ValidationResult {
        return { valid: true };
    }
}
