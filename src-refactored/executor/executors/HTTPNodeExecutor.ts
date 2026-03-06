/**
 * HTTP 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class HTTPNodeExecutor implements INodeExecutor {
    readonly type = 'http';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            method = 'GET',
            url,
            headers = {},
            body,
            timeout = 30000
        } = node.data;
        
        if (!url) {
            return { success: false, error: new Error('URL is required') };
        }
        
        try {
            const renderedUrl = this.renderTemplate(url, context);
            const renderedHeaders: Record<string, string> = {};
            
            for (const [key, value] of Object.entries(headers)) {
                renderedHeaders[key] = this.renderTemplate(String(value), context);
            }
            
            const renderedBody = body ? this.renderTemplate(body, context) : undefined;
            
            // TODO: 实际 HTTP 调用
            const response = await this.mockRequest({
                method,
                url: renderedUrl,
                headers: renderedHeaders,
                body: renderedBody,
                timeout
            });
            
            return {
                success: true,
                outputs: {
                    status: response.status,
                    body: response.body,
                    json: response.json
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error
            };
        }
    }
    
    private renderTemplate(template: string, context: ExecutionContext): string {
        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
            const parts = path.split('.');
            let value: any = context.inputs;
            
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }
            
            if (value === undefined) {
                value = context.variables.get(path);
            }
            
            return value !== undefined ? String(value) : match;
        });
    }
    
    private async mockRequest(options: any): Promise<any> {
        // 模拟 HTTP 响应
        return {
            status: 200,
            body: JSON.stringify({ mock: true }),
            json: { mock: true }
        };
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        const errors: string[] = [];
        if (!config.url) errors.push('URL is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
