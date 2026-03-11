import { NodeExecutorBase } from './INodeExecutor';
import { Node, ExecutionContext, NodeExecutionResult, ParallelNodeConfig } from '../types';

/**
 * Parallel 节点执行器
 * 并行执行多个分支
 */
export class ParallelNodeExecutor extends NodeExecutorBase {
  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      const config = node.data as unknown as ParallelNodeConfig;
      
      if (!config) {
        throw new Error('Parallel node configuration not found');
      }

      // 注意：实际的并行执行需要工作流执行器协调
      // 这里只返回分支配置，真正的并行执行由 WorkflowRunner 处理
      return this.successResult({
        branches: config.branches,
        aggregation: config.aggregation,
        input: inputs,
        // 标记这是一个需要特殊处理的并行节点
        _parallelNode: true
      }, Date.now() - startTime);
    } catch (error) {
      return this.errorResult(error as Error, Date.now() - startTime);
    }
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    const config = node.data as unknown as ParallelNodeConfig;

    if (!config) {
      errors.push('Parallel node requires configuration');
      return errors;
    }

    if (!config.branches || config.branches.length === 0) {
      errors.push('Parallel node must have at least one branch');
    }

    const validAggregations = ['merge', 'first', 'all'];
    if (!config.aggregation || !validAggregations.includes(config.aggregation)) {
      errors.push(`Aggregation must be one of: ${validAggregations.join(', ')}`);
    }

    return errors;
  }
}
