/**
 * LLM 节点执行器
 */

import { INodeExecutor } from '../INodeExecutor';
import { NodeConfig } from '../../../domain/Workflow';
import { ExecutionContext, NodeExecutionResult } from '../../../domain/Execution';

export class LLMNodeExecutor implements INodeExecutor {
    readonly type = 'llm';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const {
            model,
            prompt: promptTemplate,
            systemPrompt: systemTemplate,
            temperature = 0.7,
            maxTokens = 2000
        } = node.data;
        
        try {
            const prompt = this.renderTemplate(promptTemplate, context);
            const system = systemTemplate ? this.renderTemplate(systemTemplate, context) : undefined;
            
            // TODO: 调用实际的 LLM API
            const mockResponse = await this.callLLM(model, prompt, system, temperature, maxTokens);
            
            return {
                success: true,
                outputs: {
                    content: mockResponse.content,
                    usage: mockResponse.usage
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
    
    private async callLLM(
        model: string,
        prompt: string,
        systemPrompt: string | undefined,
        temperature: number,
        maxTokens: number
    ): Promise<{ content: string; usage: any }> {
        // TODO: 集成实际的 LLM 调用
        return {
            content: `Mock response for: ${prompt.substring(0, 50)}...`,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        };
    }
    
    validate(config: Record<string, any>): { valid: boolean; errors?: string[] } {
        const errors: string[] = [];
        if (!config.model) errors.push('Model is required');
        if (!config.prompt) errors.push('Prompt is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
