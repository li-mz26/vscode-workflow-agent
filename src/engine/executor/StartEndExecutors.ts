import { NodeExecutorBase } from './INodeExecutor';
import { Node, ExecutionContext, NodeExecutionResult } from '../types';

/**
 * 开始节点执行器
 */
export class StartNodeExecutor extends NodeExecutorBase {
  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    // 开始节点直接透传输入数据
    return this.successResult(inputs, Date.now() - startTime);
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    // 开始节点不需要特殊配置验证
    return errors;
  }
}

/**
 * 结束节点执行器
 */
export class EndNodeExecutor extends NodeExecutorBase {
  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    // 结束节点返回输入作为最终输出
    return this.successResult(inputs, Date.now() - startTime);
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    return errors;
  }
}
