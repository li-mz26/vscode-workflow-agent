import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../../shared/types/index';
import { NodeExecutor } from './NodeExecutorFactory';

export class ScheduleNodeExecutor extends NodeExecutor {
    type = 'schedule';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            cronExpression,
            timezone = 'UTC',
            enabled = true,
            maxRuns,
            endDate
        } = node.data;

        if (!cronExpression) {
            return { success: false, error: new Error('Cron expression is required') };
        }

        // 验证 cron 表达式
        if (!this.isValidCron(cronExpression)) {
            return { success: false, error: new Error('Invalid cron expression') };
        }

        // Schedule 节点主要用于配置，实际调度由外部调度器处理
        // 这里返回调度配置信息
        const nextRun = this.getNextRunTime(cronExpression, timezone);

        return {
            success: true,
            outputs: {
                schedule: {
                    cron: cronExpression,
                    timezone,
                    enabled,
                    nextRun,
                    maxRuns,
                    endDate
                },
                triggered: context.inputs.trigger === 'scheduled',
                runCount: context.inputs.runCount || 0
            }
        };
    }

    private isValidCron(cron: string): boolean {
        // 简单的 cron 验证: 5 或 6 个字段
        const parts = cron.trim().split(/\s+/);
        return parts.length >= 5 && parts.length <= 6;
    }

    private getNextRunTime(cron: string, timezone: string): string {
        // 简化的下次运行时间计算
        // 实际应该使用 cron-parser 库
        const now = new Date();
        return new Date(now.getTime() + 60000).toISOString(); // 默认 1 分钟后
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        
        if (!config.cronExpression) {
            errors.push('Cron expression is required');
        } else if (!this.isValidCron(config.cronExpression)) {
            errors.push('Invalid cron expression format');
        }

        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
