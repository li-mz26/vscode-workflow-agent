import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
import { NodeExecutor } from './NodeExecutor';

export class HTTPNodeExecutor extends NodeExecutor {
    type = 'http';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            method = 'GET',
            url,
            headers = {},
            body,
            timeout = 30000,
            retryCount = 0,
            retryDelay = 1000
        } = node.data;

        if (!url) {
            return { success: false, error: new Error('URL is required') };
        }

        // 渲染模板变量
        const renderedUrl = this.renderTemplate(url, context);
        const renderedHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
            renderedHeaders[key] = this.renderTemplate(String(value), context);
        }
        const renderedBody = body ? this.renderTemplate(body, context) : undefined;

        let lastError: Error | undefined;
        
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const response = await this.makeRequest({
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
                        statusText: response.statusText,
                        headers: response.headers,
                        body: response.body,
                        json: response.json
                    }
                };
            } catch (error) {
                lastError = error as Error;
                if (attempt < retryCount) {
                    await this.sleep(retryDelay * Math.pow(2, attempt));
                }
            }
        }

        return {
            success: false,
            error: lastError,
            outputs: { error: lastError?.message }
        };
    }

    private async makeRequest(options: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
        timeout: number;
    }): Promise<any> {
        const { method, url, headers, body, timeout } = options;

        // Node.js 环境使用内置 http/https 模块
        const http = await import('http');
        const https = await import('https');
        const { URL } = await import('url');

        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const req = client.request(
                {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers
                    },
                    timeout
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        let json = null;
                        try {
                            json = JSON.parse(data);
                        } catch {
                            // Not JSON
                        }

                        resolve({
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            headers: res.headers,
                            body: data,
                            json
                        });
                    });
                }
            );

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) {
                req.write(body);
            }
            req.end();
        });
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

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        
        if (!config.url) {
            errors.push('URL is required');
        }
        
        if (config.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method)) {
            errors.push('Invalid HTTP method');
        }

        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
