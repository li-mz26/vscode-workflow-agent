// ============================================
// Executor 层 - 节点执行器接口
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../domain';

export interface INodeExecutor {
    /**
     * 执行器类型
     */
    readonly type: string;

    /**
     * 执行节点
     */
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;

    /**
     * 验证节点配置
     */
    validate(config: Record<string, any>): ValidationResult;
}
