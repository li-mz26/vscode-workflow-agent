import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
import { NodeExecutor } from './NodeExecutor';

export class WebhookNodeExecutor extends NodeExecutor {
    type = 'webhook';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            provider = 'generic',
            webhookUrl,
            message,
            title,
            severity = 'info',
            fields = [],
            mentions = []
        } = node.data;

        if (!webhookUrl) {
            return { success: false, error: new Error('Webhook URL is required') };
        }

        try {
            let payload: any;

            switch (provider) {
                case 'slack':
                    payload = this.buildSlackPayload({ title, message, severity, fields, mentions });
                    break;
                case 'dingtalk':
                    payload = this.buildDingTalkPayload({ title, message, severity, fields, mentions });
                    break;
                case 'discord':
                    payload = this.buildDiscordPayload({ title, message, severity, fields, mentions });
                    break;
                case 'pagerduty':
                    payload = this.buildPagerDutyPayload({ title, message, severity, fields });
                    break;
                default:
                    payload = { title, message, severity, fields, timestamp: new Date().toISOString() };
            }

            // 使用 HTTP 发送
            const https = await import('https');
            const { URL } = await import('url');
            const parsedUrl = new URL(webhookUrl);

            await new Promise((resolve, reject) => {
                const data = JSON.stringify(payload);
                const req = https.request(
                    {
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(data)
                        }
                    },
                    (res) => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(undefined);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    }
                );

                req.on('error', reject);
                req.write(data);
                req.end();
            });

            return {
                success: true,
                outputs: { sent: true, provider, timestamp: new Date().toISOString() }
            };

        } catch (error) {
            return {
                success: false,
                error: error as Error,
                outputs: { sent: false, error: (error as Error).message }
            };
        }
    }

    private buildSlackPayload(options: any): any {
        const { title, message, severity, fields, mentions } = options;
        
        const colorMap: Record<string, string> = {
            info: '#36a64f',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
        };

        return {
            text: title,
            attachments: [{
                color: colorMap[severity] || colorMap.info,
                text: message,
                fields: fields.map((f: any) => ({
                    title: f.name,
                    value: f.value,
                    short: f.short !== false
                })),
                footer: 'Workflow Agent',
                ts: Math.floor(Date.now() / 1000)
            }],
            mentions: mentions.map((m: string) => `<@${m}>`).join(' ')
        };
    }

    private buildDingTalkPayload(options: any): any {
        const { title, message, severity, fields } = options;
        
        const colorMap: Record<string, string> = {
            info: '#00ff00',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
        };

        const text = fields.map((f: any) => `**${f.name}**: ${f.value}`).join('\n');

        return {
            msgtype: 'markdown',
            markdown: {
                title,
                text: `## ${title}\n\n${message}\n\n${text}`
            }
        };
    }

    private buildDiscordPayload(options: any): any {
        const { title, message, severity, fields } = options;
        
        const colorMap: Record<string, number> = {
            info: 3066993,
            warning: 15105570,
            error: 15158332,
            critical: 10038562
        };

        return {
            embeds: [{
                title,
                description: message,
                color: colorMap[severity] || colorMap.info,
                fields: fields.map((f: any) => ({
                    name: f.name,
                    value: f.value,
                    inline: f.short !== false
                })),
                timestamp: new Date().toISOString()
            }]
        };
    }

    private buildPagerDutyPayload(options: any): any {
        const { title, message, severity, fields } = options;
        
        return {
            payload: {
                summary: title,
                severity: severity === 'critical' ? 'critical' : severity === 'error' ? 'error' : 'warning',
                source: 'Workflow Agent',
                custom_details: {
                    message,
                    fields: Object.fromEntries(fields.map((f: any) => [f.name, f.value]))
                }
            }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        
        if (!config.webhookUrl) {
            errors.push('Webhook URL is required');
        }
        
        if (!config.message) {
            errors.push('Message is required');
        }

        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
