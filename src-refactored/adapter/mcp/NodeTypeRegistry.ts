/**
 * 节点类型注册表
 */

import { NodeTypeDefinition } from '../../domain/Execution';

export class NodeTypeRegistry {
    private types: Map<string, NodeTypeDefinition> = new Map();
    
    constructor() {
        this.registerDefaultTypes();
    }
    
    private registerDefaultTypes(): void {
        this.register({
            type: 'start',
            category: 'basic',
            name: 'Start',
            description: 'Entry point',
            icon: 'play',
            color: '#4CAF50',
            inputs: [],
            outputs: [{ id: 'trigger', name: 'trigger', type: 'data', dataType: 'object' }],
            configSchema: { type: 'object', properties: {} },
            defaultData: {},
            executor: 'StartNodeExecutor'
        });
        
        this.register({
            type: 'end',
            category: 'basic',
            name: 'End',
            description: 'Exit point',
            icon: 'stop',
            color: '#F44336',
            inputs: [{ id: 'result', name: 'result', type: 'data', dataType: 'any' }],
            outputs: [],
            configSchema: { type: 'object', properties: {} },
            defaultData: {},
            executor: 'EndNodeExecutor'
        });
        
        this.register({
            type: 'code',
            category: 'basic',
            name: 'Code',
            description: 'Execute Python code',
            icon: 'code',
            color: '#2196F3',
            inputs: [{ id: 'input', name: 'input', type: 'data', dataType: 'any' }],
            outputs: [{ id: 'output', name: 'output', type: 'data', dataType: 'any' }],
            configSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
            defaultData: { code: 'def main(ctx):\n    return ctx.input' },
            executor: 'CodeNodeExecutor'
        });
        
        this.register({
            type: 'llm',
            category: 'basic',
            name: 'LLM',
            description: 'Call language model',
            icon: 'sparkle',
            color: '#9C27B0',
            inputs: [{ id: 'prompt', name: 'prompt', type: 'data', dataType: 'string' }],
            outputs: [{ id: 'content', name: 'content', type: 'data', dataType: 'string' }],
            configSchema: { type: 'object', properties: { model: { type: 'string' }, prompt: { type: 'string' } }, required: ['model', 'prompt'] },
            defaultData: { model: 'gpt-4', temperature: 0.7 },
            executor: 'LLMNodeExecutor'
        });
        
        this.register({
            type: 'switch',
            category: 'flow',
            name: 'Switch',
            description: 'Conditional branching',
            icon: 'split',
            color: '#FF9800',
            inputs: [{ id: 'input', name: 'input', type: 'data', dataType: 'any' }],
            outputs: [],
            configSchema: { type: 'object', properties: { conditions: { type: 'array' } } },
            defaultData: { conditions: [] },
            executor: 'SwitchNodeExecutor'
        });
        
        this.register({
            type: 'parallel',
            category: 'flow',
            name: 'Parallel',
            description: 'Parallel execution',
            icon: 'parallel',
            color: '#00BCD4',
            inputs: [{ id: 'input', name: 'input', type: 'data', dataType: 'any' }],
            outputs: [],
            configSchema: { type: 'object', properties: { branches: { type: 'array' } } },
            defaultData: { branches: [] },
            executor: 'ParallelNodeExecutor'
        });
        
        this.register({
            type: 'merge',
            category: 'flow',
            name: 'Merge',
            description: 'Merge branches',
            icon: 'merge',
            color: '#795548',
            inputs: [],
            outputs: [{ id: 'result', name: 'result', type: 'data', dataType: 'object' }],
            configSchema: { type: 'object', properties: { strategy: { type: 'string' } } },
            defaultData: { strategy: 'all' },
            executor: 'MergeNodeExecutor'
        });
        
        this.register({
            type: 'http',
            category: 'integration',
            name: 'HTTP',
            description: 'HTTP request',
            icon: 'globe',
            color: '#607D8B',
            inputs: [{ id: 'input', name: 'input', type: 'data', dataType: 'any' }],
            outputs: [{ id: 'response', name: 'response', type: 'data', dataType: 'object' }],
            configSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' } }, required: ['url'] },
            defaultData: { method: 'GET', url: '' },
            executor: 'HTTPNodeExecutor'
        });
        
        this.register({
            type: 'webhook',
            category: 'integration',
            name: 'Webhook',
            description: 'Send webhook notification',
            icon: 'bell',
            color: '#E91E63',
            inputs: [{ id: 'input', name: 'input', type: 'data', dataType: 'any' }],
            outputs: [{ id: 'sent', name: 'sent', type: 'data', dataType: 'boolean' }],
            configSchema: { type: 'object', properties: { webhookUrl: { type: 'string' }, message: { type: 'string' } }, required: ['webhookUrl', 'message'] },
            defaultData: { provider: 'slack' },
            executor: 'WebhookNodeExecutor'
        });
        
        this.register({
            type: 'schedule',
            category: 'flow',
            name: 'Schedule',
            description: 'Schedule trigger',
            icon: 'clock',
            color: '#FF5722',
            inputs: [],
            outputs: [{ id: 'trigger', name: 'trigger', type: 'data', dataType: 'object' }],
            configSchema: { type: 'object', properties: { cronExpression: { type: 'string' } }, required: ['cronExpression'] },
            defaultData: { timezone: 'UTC', enabled: true },
            executor: 'ScheduleNodeExecutor'
        });
    }
    
    register(definition: NodeTypeDefinition): void {
        this.types.set(definition.type, definition);
    }
    
    get(type: string): NodeTypeDefinition | undefined {
        return this.types.get(type);
    }
    
    getAllTypes(): NodeTypeDefinition[] {
        return Array.from(this.types.values());
    }
    
    getByCategory(category: string): NodeTypeDefinition[] {
        return this.getAllTypes().filter(t => t.category === category);
    }
}
