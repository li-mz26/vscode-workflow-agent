import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../../shared/types/index';
import { NodeExecutor } from './NodeExecutorFactory';
import * as https from 'https';

export class LLMNodeExecutor extends NodeExecutor {
    type = 'llm';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { 
            model = 'gpt-4',
            prompt: promptTemplate, 
            systemPrompt: systemTemplate,
            temperature = 0.7, 
            maxTokens = 2000 
        } = node.data;

        const inputs = this.resolveInputs(node, context);

        if (!promptTemplate) {
            return {
                success: false,
                error: new Error('Prompt is required'),
                outputs: {}
            };
        }

        try {
            // 渲染模板
            const prompt = this.renderTemplate(promptTemplate, inputs, context);
            const system = systemTemplate ? this.renderTemplate(systemTemplate, inputs, context) : undefined;

            // 判断模型提供商
            const provider = this.getProvider(model);
            
            let response: { content: string; usage: any };
            
            if (provider === 'openai') {
                response = await this.callOpenAI(model, prompt, system, temperature, maxTokens);
            } else if (provider === 'anthropic') {
                response = await this.callAnthropic(model, prompt, system, temperature, maxTokens);
            } else {
                return {
                    success: false,
                    error: new Error(`Unsupported model: ${model}. Use OpenAI (gpt-*) or Anthropic (claude-*) models.`),
                    outputs: {}
                };
            }

            return {
                success: true,
                outputs: {
                    content: response.content,
                    usage: response.usage
                },
                logs: [`LLM call successful. Tokens: ${JSON.stringify(response.usage)}`]
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                outputs: {}
            };
        }
    }

    private getProvider(model: string): 'openai' | 'anthropic' | null {
        const lowerModel = model.toLowerCase();
        if (lowerModel.startsWith('gpt-') || lowerModel.startsWith('text-')) {
            return 'openai';
        }
        if (lowerModel.startsWith('claude-')) {
            return 'anthropic';
        }
        return null;
    }

    private async callOpenAI(
        model: string,
        prompt: string,
        systemPrompt: string | undefined,
        temperature: number,
        maxTokens: number
    ): Promise<{ content: string; usage: any }> {
        const apiKey = process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable not set');
        }

        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const payload = {
            model,
            messages,
            temperature,
            max_tokens: maxTokens
        };

        const result = await this.makeHTTPRequest(
            'api.openai.com',
            '/v1/chat/completions',
            'POST',
            { 'Authorization': `Bearer ${apiKey}` },
            payload
        );

        if (result.error) {
            throw new Error(`OpenAI API error: ${result.error.message}`);
        }

        return {
            content: result.choices[0].message.content,
            usage: result.usage
        };
    }

    private async callAnthropic(
        model: string,
        prompt: string,
        systemPrompt: string | undefined,
        temperature: number,
        maxTokens: number
    ): Promise<{ content: string; usage: any }> {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable not set');
        }

        const payload: any = {
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }]
        };

        if (systemPrompt) {
            payload.system = systemPrompt;
        }

        const result = await this.makeHTTPRequest(
            'api.anthropic.com',
            '/v1/messages',
            'POST',
            { 
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            payload
        );

        if (result.error) {
            throw new Error(`Anthropic API error: ${result.error.message}`);
        }

        return {
            content: result.content[0].text,
            usage: result.usage
        };
    }

    private makeHTTPRequest(
        hostname: string,
        path: string,
        method: string,
        headers: Record<string, string>,
        payload: any
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            
            const options = {
                hostname,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    ...headers
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${responseData}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.write(data);
            req.end();
        });
    }

    private renderTemplate(
        template: string, 
        inputs: Record<string, any>, 
        context: ExecutionContext
    ): string {
        // 支持 {{variable}} 或 {{ctx.variable}} 语法
        return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match, name, subname) => {
            if (name === 'ctx' && subname) {
                return context.variables.get(subname) ?? match;
            }
            return inputs[name] ?? context.variables.get(name) ?? match;
        });
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        if (!config.model) errors.push('Model is required');
        if (!config.prompt) errors.push('Prompt is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
