/**
 * 节点执行器接口
 * 每个节点类型对应一个执行器
 */

import { NodeConfig } from '../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../domain/Execution';

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
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] };
}

/**
 * 执行器工厂接口
 */
export interface IExecutorFactory {
    /**
     * 创建执行器
     */
    create(type: string): INodeExecutor;
    
    /**
     * 注册执行器
     */
    register(type: string, executor: new () => INodeExecutor): void;
    
    /**
     * 检查是否支持某类型
     */
    supports(type: string): boolean;
}
