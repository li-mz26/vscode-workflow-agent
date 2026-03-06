/**
 * Schedule 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class ScheduleNodeExecutor implements INodeExecutor {
    readonly type = 'schedule';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            cronExpression,
            timezone = 'UTC',
            enabled = true
        } = node.data;
        
        if (!cronExpression) {
            return { success: false, error: new Error('Cron expression is required') };
        }
        
        if (!this.isValidCron(cronExpression)) {
            return { success: false, error: new Error('Invalid cron expression') };
        }
        
        return {
            success: true,
            outputs: {
                schedule: {
                    cron: cronExpression,
                    timezone,
                    enabled,
                    nextRun: this.getNextRunTime(cronExpression)
                }
            }
        };
    }
    
    private isValidCron(cron: string): boolean {
        const parts = cron.trim().split(/\s+/);
        return parts.length >= 5 && parts.length <= 6;
    }
    
    private getNextRunTime(cron: string): string {
        // 简化实现，返回1分钟后
        return new Date(Date.now() + 60000).toISOString();
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        const errors: string[] = [];
        if (!config.cronExpression) errors.push('Cron expression is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
