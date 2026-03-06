/**
 * Webhook 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class WebhookNodeExecutor implements INodeExecutor {
    readonly type = 'webhook';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            provider = 'generic',
            webhookUrl,
            message,
            title,
            severity = 'info'
        } = node.data;
        
        if (!webhookUrl) {
            return { success: false, error: new Error('Webhook URL is required') };
        }
        
        try {
            const payload = this.buildPayload(provider, { title, message, severity });
            
            // TODO: 实际发送 Webhook
            
            return {
                success: true,
                outputs: {
                    sent: true,
                    provider,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error
            };
        }
    }
    
    private buildPayload(provider: string, options: any): any {
        const { title, message, severity } = options;
        
        switch (provider) {
            case 'slack':
                return {
                    text: title,
                    attachments: [{
                        color: this.getColor(severity),
                        text: message
                    }]
                };
            case 'dingtalk':
                return {
                    msgtype: 'markdown',
                    markdown: { title, text: message }
                };
            default:
                return { title, message, severity };
        }
    }
    
    private getColor(severity: string): string {
        const colors: Record<string, string> = {
            info: '#36a64f',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
        };
        return colors[severity] || colors.info;
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        const errors: string[] = [];
        if (!config.webhookUrl) errors.push('Webhook URL is required');
        if (!config.message) errors.push('Message is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
