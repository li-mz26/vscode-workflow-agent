import { NodeExecutorBase } from './INodeExecutor';
import { Node, ExecutionContext, NodeExecutionResult, SwitchNodeConfig } from '../types';

/**
 * Switch 节点执行器
 * 根据条件表达式选择分支
 */
export class SwitchNodeExecutor extends NodeExecutorBase {
  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      const config = node.data as unknown as SwitchNodeConfig;
      
      if (!config) {
        throw new Error('Switch node configuration not found');
      }

      // 评估每个分支的条件
      for (const branch of config.branches) {
        const conditionResult = this.evaluateCondition(branch.condition, inputs);
        if (conditionResult) {
          return this.successResult({
            branchId: branch.id,
            branchName: branch.name,
            condition: branch.condition,
            data: inputs
          }, Date.now() - startTime);
        }
      }

      // 没有条件匹配，使用默认分支
      if (config.defaultBranch) {
        return this.successResult({
          branchId: config.defaultBranch,
          branchName: 'default',
          condition: 'default',
          data: inputs
        }, Date.now() - startTime);
      }

      throw new Error('No matching branch found and no default branch specified');
    } catch (error) {
      return this.errorResult(error as Error, Date.now() - startTime);
    }
  }

  /**
   * 评估条件表达式
   * 支持简单的表达式，如: input.value > 10, input.status === 'active'
   */
  private evaluateCondition(condition: string, inputs: Record<string, unknown>): boolean {
    try {
      // 创建安全的评估环境
      const sandbox = {
        input: inputs,
        ...inputs  // 展开输入以便直接访问
      };

      // 简单的表达式评估
      // 注意：实际生产环境应该使用更安全的表达式解析器
      const conditionFunc = new Function('input', `
        "use strict";
        try {
          return (${condition});
        } catch (e) {
          return false;
        }
      `);

      return conditionFunc(sandbox.input);
    } catch {
      return false;
    }
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    const config = node.data as unknown as SwitchNodeConfig;

    if (!config) {
      errors.push('Switch node requires configuration');
      return errors;
    }

    if (!config.branches || config.branches.length === 0) {
      errors.push('Switch node must have at least one branch');
    }

    // 检查分支ID唯一性
    const branchIds = new Set<string>();
    for (const branch of config.branches || []) {
      if (branchIds.has(branch.id)) {
        errors.push(`Duplicate branch ID: ${branch.id}`);
      }
      branchIds.add(branch.id);

      if (!branch.condition) {
        errors.push(`Branch ${branch.id} is missing condition`);
      }
    }

    return errors;
  }
}
