// ============================================
// Executor 层 - 节点执行器工厂
// ============================================

import { INodeExecutor } from './INodeExecutor';
import { StartNodeExecutor } from './executors/StartNodeExecutor';
import { EndNodeExecutor } from './executors/EndNodeExecutor';
import { CodeNodeExecutor } from './executors/CodeNodeExecutor';
import { LLMNodeExecutor } from './executors/LLMNodeExecutor';
import { SwitchNodeExecutor } from './executors/SwitchNodeExecutor';
import { ParallelNodeExecutor } from './executors/ParallelNodeExecutor';
import { MergeNodeExecutor } from './executors/MergeNodeExecutor';
import { HTTPNodeExecutor } from './executors/HTTPNodeExecutor';
import { WebhookNodeExecutor } from './executors/WebhookNodeExecutor';
import { ScheduleNodeExecutor } from './executors/ScheduleNodeExecutor';

/**
 * 节点执行器工厂
 * 统一管理所有节点类型的执行器
 */
export class NodeExecutorFactory {
    private static executors: Map<string, new () => INodeExecutor> = new Map([
        ['start', StartNodeExecutor],
        ['end', EndNodeExecutor],
        ['code', CodeNodeExecutor],
        ['llm', LLMNodeExecutor],
        ['switch', SwitchNodeExecutor],
        ['parallel', ParallelNodeExecutor],
        ['merge', MergeNodeExecutor],
        ['http', HTTPNodeExecutor],
        ['webhook', WebhookNodeExecutor],
        ['schedule', ScheduleNodeExecutor]
    ]);

    /**
     * 创建指定类型的执行器实例
     */
    static create(type: string): INodeExecutor {
        const ExecutorClass = this.executors.get(type);

        if (!ExecutorClass) {
            throw new Error(`No executor found for node type: ${type}`);
        }

        return new ExecutorClass();
    }

    /**
     * 注册自定义执行器
     */
    static register(type: string, executorClass: new () => INodeExecutor): void {
        this.executors.set(type, executorClass);
    }

    /**
     * 检查是否支持指定类型的执行器
     */
    static has(type: string): boolean {
        return this.executors.has(type);
    }

    /**
     * 获取所有支持的节点类型
     */
    static getSupportedTypes(): string[] {
        return Array.from(this.executors.keys());
    }
}