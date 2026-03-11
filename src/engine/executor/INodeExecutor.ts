import {
  Node,
  ExecutionContext,
  NodeExecutionResult,
  CodeNodeConfig,
  LLMNodeConfig,
  SwitchNodeConfig,
  ParallelNodeConfig
} from '../types';

/**
 * 节点执行器接口
 */
export interface INodeExecutor {
  /**
   * 执行节点
   * @param node 节点定义
   * @param context 执行上下文
   * @param inputs 输入数据
   * @returns 执行结果
   */
  execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult>;

  /**
   * 验证节点配置
   */
  validateConfig(node: Node): string[];
}

/**
 * 节点执行器基类
 */
export abstract class NodeExecutorBase implements INodeExecutor {
  abstract execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult>;

  abstract validateConfig(node: Node): string[];

  /**
   * 创建成功结果
   */
  protected successResult(output: unknown, executionTime: number): NodeExecutionResult {
    return {
      success: true,
      output,
      executionTime
    };
  }

  /**
   * 创建失败结果
   */
  protected errorResult(error: Error, executionTime: number): NodeExecutionResult {
    return {
      success: false,
      error,
      executionTime
    };
  }
}
