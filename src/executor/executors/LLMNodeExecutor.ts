// ============================================
// Executor 层 - LLM 节点执行器
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../domain';
import { NodeExecutorBase } from '../NodeExecutorBase';

export class LLMNodeExecutor extends NodeExecutorBase {
    type = 'llm';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { 
            model, 
            prompt: promptTemplate, 
            systemPrompt: systemTemplate,
            temperature = 0.7, 
            maxTokens = 2000 
        } = node.data;

        const inputs = this.resolveInputs(node, context);

        try {
            // 渲染模板
            const prompt = this.renderTemplate(promptTemplate, inputs, context);
            const system = systemTemplate ? this.renderTemplate(systemTemplate, inputs, context) : undefined;

            // TODO: 调用实际的 LLM API
            // 临时返回模拟结果
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

    private renderTemplate(
        template: string, 
        inputs: Record<string, any>, 
        context: ExecutionContext
    ): string {
        // 简单的模板替换: {{variable}} 或 {{ctx.variable}}
        return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (match, name, subname) => {
            if (name === 'ctx' && subname) {
                return context.variables.get(subname) ?? match;
            }
            return inputs[name] ?? context.variables.get(name) ?? match;
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
        // 临时返回模拟结果
        return {
            content: `Mock response for: ${prompt.substring(0, 50)}...`,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        };
    }

    validate(config: Record<string, any>): ValidationResult {
        const errors: string[] = [];
        if (!config.model) errors.push('Model is required');
        if (!config.prompt) errors.push('Prompt is required');
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
