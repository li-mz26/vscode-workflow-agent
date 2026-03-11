import { INodeExecutor } from './INodeExecutor';
import { StartNodeExecutor, EndNodeExecutor } from './StartEndExecutors';
import { CodeNodeExecutor } from './CodeNodeExecutor';
import { SwitchNodeExecutor } from './SwitchNodeExecutor';
import { ParallelNodeExecutor } from './ParallelNodeExecutor';
import { LLMNodeExecutor } from './LLMNodeExecutor';
import { NodeType } from '../types';

/**
 * 节点执行器工厂
 * 负责创建和管理各种类型的节点执行器
 */
export class ExecutorFactory {
  private executors: Map<NodeType, INodeExecutor> = new Map();

  constructor() {
    // 注册默认执行器
    this.register('start', new StartNodeExecutor());
    this.register('end', new EndNodeExecutor());
    this.register('code', new CodeNodeExecutor());
    this.register('switch', new SwitchNodeExecutor());
    this.register('parallel', new ParallelNodeExecutor());
    this.register('llm', new LLMNodeExecutor());
  }

  /**
   * 注册执行器
   */
  register(type: NodeType, executor: INodeExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * 获取执行器
   */
  get(type: NodeType): INodeExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for node type: ${type}`);
    }
    return executor;
  }

  /**
   * 检查是否支持某类型
   */
  has(type: NodeType): boolean {
    return this.executors.has(type);
  }

  /**
   * 获取所有支持的类型
   */
  getSupportedTypes(): NodeType[] {
    return Array.from(this.executors.keys());
  }
}

// 导出单例实例
export const executorFactory = new ExecutorFactory();

// 重新导出所有执行器
export * from './INodeExecutor';
export * from './StartEndExecutors';
export * from './CodeNodeExecutor';
export * from './SwitchNodeExecutor';
export * from './ParallelNodeExecutor';
export * from './LLMNodeExecutor';
