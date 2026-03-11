import { NodeExecutorBase } from './INodeExecutor';
import { Node, ExecutionContext, NodeExecutionResult, LLMNodeConfig } from '../types';
import * as vscode from 'vscode';

/**
 * LLM 节点执行器
 * 调用大语言模型进行推理
 */
export class LLMNodeExecutor extends NodeExecutorBase {
  private defaultModel: string;
  private apiKey: string | undefined;

  constructor() {
    super();
    const config = vscode.workspace.getConfiguration('workflowAgent.llm');
    this.defaultModel = config.get('defaultModel') || 'gpt-4';
    this.apiKey = config.get('apiKey');
  }

  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      const config = node.data as unknown as LLMNodeConfig;
      
      if (!config) {
        throw new Error('LLM node configuration not found');
      }

      // 替换提示词中的变量
      const systemPrompt = this.interpolateTemplate(config.systemPrompt, inputs);
      const userPrompt = this.interpolateTemplate(config.userPrompt, inputs);

      // 调用 LLM API
      const response = await this.callLLM({
        model: config.model || this.defaultModel,
        systemPrompt,
        userPrompt,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens,
        topP: config.topP,
        tools: config.tools,
        responseFormat: config.responseFormat
      });

      return this.successResult({
        response: response.text,
        structured: response.structured,
        usage: response.usage,
        model: config.model || this.defaultModel
      }, Date.now() - startTime);
    } catch (error) {
      return this.errorResult(error as Error, Date.now() - startTime);
    }
  }

  /**
   * 调用 LLM API
   * 这里使用 OpenAI 兼容的 API 格式
   */
  private async callLLM(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens?: number;
    topP?: number;
    tools?: string[];
    responseFormat?: 'text' | 'json';
  }): Promise<{
    text: string;
    structured?: unknown;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    // 这里应该使用实际的 LLM API
    // 目前提供 OpenAI 兼容的实现框架
    
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('LLM API key not configured. Please set workflowAgent.llm.apiKey');
    }

    // OpenAI API 端点（可以根据需要配置）
    const apiUrl = vscode.workspace.getConfiguration('workflowAgent.llm').get('apiUrl') || 'https://api.openai.com/v1/chat/completions';

    const messages = [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt }
    ];

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      temperature: params.temperature,
      ...(params.maxTokens && { max_tokens: params.maxTokens }),
      ...(params.topP && { top_p: params.topP }),
      ...(params.responseFormat === 'json' && { response_format: { type: 'json_object' } })
    };

    // 实际的 HTTP 请求
    const response = await fetch(apiUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${error}`);
    }

    const data = await response.json() as any;
    
    let text = data.choices[0]?.message?.content || '';
    let structured: unknown | undefined;

    // 如果请求了 JSON 格式，尝试解析
    if (params.responseFormat === 'json') {
      try {
        structured = JSON.parse(text);
      } catch {
        // 解析失败，保留原始文本
      }
    }

    return {
      text,
      structured,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  /**
   * 模板插值
   * 将 {{variable}} 替换为实际值
   */
  private interpolateTemplate(template: string, inputs: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = inputs[key];
      if (value === undefined) {
        return match; // 保留原样
      }
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    });
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    const config = node.data as unknown as LLMNodeConfig;

    if (!config) {
      errors.push('LLM node requires configuration');
      return errors;
    }

    if (!config.userPrompt) {
      errors.push('User prompt is required');
    }

    if (config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    return errors;
  }
}
