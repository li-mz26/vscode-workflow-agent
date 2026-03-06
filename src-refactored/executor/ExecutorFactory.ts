/**
 * 执行器工厂实现
 */

import { INodeExecutor, IExecutorFactory } from './INodeExecutor';
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

export class ExecutorFactory implements IExecutorFactory {
    private executors: Map<string, new () => INodeExecutor> = new Map();
    
    constructor() {
        this.registerDefaultExecutors();
    }
    
    private registerDefaultExecutors(): void {
        this.register('start', StartNodeExecutor);
        this.register('end', EndNodeExecutor);
        this.register('code', CodeNodeExecutor);
        this.register('llm', LLMNodeExecutor);
        this.register('switch', SwitchNodeExecutor);
        this.register('parallel', ParallelNodeExecutor);
        this.register('merge', MergeNodeExecutor);
        this.register('http', HTTPNodeExecutor);
        this.register('webhook', WebhookNodeExecutor);
        this.register('schedule', ScheduleNodeExecutor);
    }
    
    register(type: string, executorClass: new () => INodeExecutor): void {
        this.executors.set(type, executorClass);
    }
    
    create(type: string): INodeExecutor {
        const ExecutorClass = this.executors.get(type);
        if (!ExecutorClass) {
            throw new Error(`No executor found for node type: ${type}`);
        }
        return new ExecutorClass();
    }
    
    supports(type: string): boolean {
        return this.executors.has(type);
    }
}
