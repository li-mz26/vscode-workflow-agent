import { 
    NodeConfig, 
    NodeTypeDefinition, 
    Position, 
    Port 
} from '../../shared/types';

export class NodeRegistry {
    private nodeTypes: Map<string, NodeTypeDefinition> = new Map();

    constructor() {
        this.registerDefaultNodes();
    }

    private registerDefaultNodes(): void {
        // Start 节点
        this.register({
            type: 'start',
            category: 'basic',
            name: 'Start',
            description: 'Entry point of the workflow',
            icon: 'play',
            color: '#4CAF50',
            inputs: [],
            outputs: [
                { id: 'trigger', name: 'trigger', type: 'data', dataType: 'object', required: true }
            ],
            configSchema: {
                type: 'object',
                properties: {
                    triggerType: {
                        type: 'string',
                        enum: ['manual', 'api', 'schedule'],
                        default: 'manual',
                        description: 'How the workflow is triggered'
                    }
                }
            },
            defaultData: { triggerType: 'manual' },
            executor: 'StartNodeExecutor'
        });

        // End 节点
        this.register({
            type: 'end',
            category: 'basic',
            name: 'End',
            description: 'Exit point of the workflow',
            icon: 'stop',
            color: '#F44336',
            inputs: [
                { id: 'result', name: 'result', type: 'data', dataType: 'any', required: false }
            ],
            outputs: [],
            configSchema: {
                type: 'object',
                properties: {
                    outputMapping: {
                        type: 'object',
                        description: 'Map outputs to workflow results'
                    }
                }
            },
            defaultData: { outputMapping: {} },
            executor: 'EndNodeExecutor'
        });

        // Code 节点
        this.register({
            type: 'code',
            category: 'basic',
            name: 'Code',
            description: 'Execute Python code',
            icon: 'code',
            color: '#2196F3',
            inputs: [
                { id: 'input', name: 'input', type: 'data', dataType: 'any', required: false }
            ],
            outputs: [
                { id: 'output', name: 'output', type: 'data', dataType: 'any', required: true }
            ],
            configSchema: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'Python code to execute',
                        default: 'def main(ctx):\n    return ctx.input'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Execution timeout in seconds',
                        default: 30
                    },
                    environment: {
                        type: 'object',
                        description: 'Environment variables'
                    }
                },
                required: ['code']
            },
            defaultData: {
                code: 'def main(ctx):\n    return ctx.input',
                timeout: 30,
                environment: {}
            },
            executor: 'CodeNodeExecutor'
        });

        // LLM 节点
        this.register({
            type: 'llm',
            category: 'basic',
            name: 'LLM',
            description: 'Call language model',
            icon: 'sparkle',
            color: '#9C27B0',
            inputs: [
                { id: 'prompt', name: 'prompt', type: 'data', dataType: 'string', required: true },
                { id: 'context', name: 'context', type: 'data', dataType: 'string', required: false }
            ],
            outputs: [
                { id: 'content', name: 'content', type: 'data', dataType: 'string', required: true },
                { id: 'usage', name: 'usage', type: 'data', dataType: 'object', required: true }
            ],
            configSchema: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        description: 'Model to use',
                        default: 'gpt-4'
                    },
                    systemPrompt: {
                        type: 'string',
                        description: 'System prompt'
                    },
                    temperature: {
                        type: 'number',
                        description: 'Temperature (0-2)',
                        default: 0.7,
                        minimum: 0,
                        maximum: 2
                    },
                    maxTokens: {
                        type: 'number',
                        description: 'Maximum tokens to generate',
                        default: 2000
                    }
                },
                required: ['model']
            },
            defaultData: {
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 2000
            },
            executor: 'LLMNodeExecutor'
        });

        // Switch 节点
        this.register({
            type: 'switch',
            category: 'flow',
            name: 'Switch',
            description: 'Conditional branching',
            icon: 'split-horizontal',
            color: '#FF9800',
            inputs: [
                { id: 'input', name: 'input', type: 'data', dataType: 'any', required: true }
            ],
            outputs: [],  // 动态输出，根据条件数量
            configSchema: {
                type: 'object',
                properties: {
                    conditions: {
                        type: 'array',
                        description: 'Branch conditions',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                expression: { type: 'string' },
                                target: { type: 'string' }
                            }
                        }
                    },
                    defaultTarget: {
                        type: 'string',
                        description: 'Default branch if no condition matches'
                    }
                }
            },
            defaultData: {
                conditions: [],
                defaultTarget: 'default'
            },
            executor: 'SwitchNodeExecutor'
        });

        // Parallel 节点
        this.register({
            type: 'parallel',
            category: 'flow',
            name: 'Parallel',
            description: 'Execute branches in parallel',
            icon: 'git-branch',
            color: '#00BCD4',
            inputs: [
                { id: 'input', name: 'input', type: 'data', dataType: 'any', required: false }
            ],
            outputs: [],  // 动态输出
            configSchema: {
                type: 'object',
                properties: {
                    branches: {
                        type: 'array',
                        description: 'Parallel branches',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                id: { type: 'string' }
                            }
                        }
                    }
                }
            },
            defaultData: {
                branches: [
                    { name: 'Branch 1', id: 'branch1' },
                    { name: 'Branch 2', id: 'branch2' }
                ]
            },
            executor: 'ParallelNodeExecutor'
        });

        // Merge 节点
        this.register({
            type: 'merge',
            category: 'flow',
            name: 'Merge',
            description: 'Merge parallel branches',
            icon: 'git-merge',
            color: '#795548',
            inputs: [],  // 动态输入
            outputs: [
                { id: 'result', name: 'result', type: 'data', dataType: 'object', required: true }
            ],
            configSchema: {
                type: 'object',
                properties: {
                    strategy: {
                        type: 'string',
                        enum: ['all', 'any'],
                        default: 'all',
                        description: 'Wait for all branches or any branch'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in seconds',
                        default: 60
                    }
                }
            },
            defaultData: {
                strategy: 'all',
                timeout: 60
            },
            executor: 'MergeNodeExecutor'
        });
    }

    register(definition: NodeTypeDefinition): void {
        this.nodeTypes.set(definition.type, definition);
    }

    unregister(type: string): void {
        this.nodeTypes.delete(type);
    }

    getDefinition(type: string): NodeTypeDefinition | undefined {
        return this.nodeTypes.get(type);
    }

    getAllDefinitions(): NodeTypeDefinition[] {
        return Array.from(this.nodeTypes.values());
    }

    getDefinitionsByCategory(category: string): NodeTypeDefinition[] {
        return this.getAllDefinitions().filter(d => d.category === category);
    }

    getCategories(): string[] {
        const categories = new Set<string>();
        this.nodeTypes.forEach(d => categories.add(d.category));
        return Array.from(categories);
    }

    createNode(type: string, position: Position): NodeConfig {
        const definition = this.nodeTypes.get(type);
        if (!definition) {
            throw new Error(`Unknown node type: ${type}`);
        }

        const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return {
            id,
            type,
            position,
            data: { ...definition.defaultData },
            inputs: definition.inputs.map(p => ({ ...p })),
            outputs: definition.outputs.map(p => ({ ...p })),
            metadata: {
                name: definition.name,
                description: definition.description,
                icon: definition.icon,
                color: definition.color
            }
        };
    }

    // 为 Switch 节点生成动态输出
    getSwitchOutputs(conditions: Array<{ name: string; target: string }>): Port[] {
        return conditions.map((c, i) => ({
            id: `branch_${i}`,
            name: c.name || `Branch ${i + 1}`,
            type: 'control',
            dataType: 'any',
            required: false
        }));
    }

    // 为 Parallel 节点生成动态输出
    getParallelOutputs(branches: Array<{ name: string; id: string }>): Port[] {
        return branches.map(b => ({
            id: b.id,
            name: b.name,
            type: 'control',
            dataType: 'any',
            required: false
        }));
    }

    // 为 Merge 节点生成动态输入
    getMergeInputs(branchCount: number): Port[] {
        return Array.from({ length: branchCount }, (_, i) => ({
            id: `input_${i}`,
            name: `Branch ${i + 1}`,
            type: 'data',
            dataType: 'any',
            required: false
        }));
    }
}
