import { describe, it, expect, beforeEach } from 'vitest';
import { 
    StartNodeExecutor,
    EndNodeExecutor,
    CodeNodeExecutor,
    LLMNodeExecutor,
    SwitchNodeExecutor,
    NodeExecutorFactory
} from '../../../src/core/execution/executors/NodeExecutorFactory';
import { NodeConfig, ExecutionContext } from '../../../src/shared/types';

describe('Node Executors', () => {
    describe('StartNodeExecutor', () => {
        let executor: StartNodeExecutor;

        beforeEach(() => {
            executor = new StartNodeExecutor();
        });

        it('should return correct type', () => {
            expect(executor.type).toBe('start');
        });

        it('should pass through inputs', async () => {
            const node: NodeConfig = {
                id: 'start',
                type: 'start',
                position: { x: 0, y: 0 },
                data: {},
                inputs: [],
                outputs: []
            };

            const context: ExecutionContext = {
                variables: new Map(),
                inputs: { test: 'value' },
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    executionId: 'test'
                }
            };

            const result = await executor.execute(node, context);
            
            expect(result.success).toBe(true);
            expect(result.outputs?.trigger).toEqual({ test: 'value' });
        });
    });

    describe('CodeNodeExecutor', () => {
        let executor: CodeNodeExecutor;

        beforeEach(() => {
            executor = new CodeNodeExecutor();
        });

        it('should validate missing code', () => {
            const result = executor.validate({});
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Code is required');
        });

        it('should validate with code', () => {
            const result = executor.validate({ code: 'print("hello")' });
            expect(result.valid).toBe(true);
        });
    });

    describe('LLMNodeExecutor', () => {
        let executor: LLMNodeExecutor;

        beforeEach(() => {
            executor = new LLMNodeExecutor();
        });

        it('should validate missing model', () => {
            const result = executor.validate({ prompt: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Model is required');
        });

        it('should validate missing prompt', () => {
            const result = executor.validate({ model: 'gpt-4' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Prompt is required');
        });

        it('should validate with all required fields', () => {
            const result = executor.validate({ 
                model: 'gpt-4', 
                prompt: 'test' 
            });
            expect(result.valid).toBe(true);
        });
    });

    describe('SwitchNodeExecutor', () => {
        let executor: SwitchNodeExecutor;

        beforeEach(() => {
            executor = new SwitchNodeExecutor();
        });

        it('should select correct branch', async () => {
            const node: NodeConfig = {
                id: 'switch',
                type: 'switch',
                position: { x: 0, y: 0 },
                data: {
                    conditions: [
                        { name: 'high', expression: 'input > 50', target: 'branch-high' },
                        { name: 'low', expression: 'input <= 50', target: 'branch-low' }
                    ],
                    defaultTarget: 'default'
                },
                inputs: [],
                outputs: []
            };

            const context: ExecutionContext = {
                variables: new Map(),
                inputs: { input: 75 },
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    executionId: 'test'
                }
            };

            const result = await executor.execute(node, context);
            
            expect(result.success).toBe(true);
            expect(result.outputs?.branch).toBe('branch-high');
        });

        it('should use default branch when no condition matches', async () => {
            const node: NodeConfig = {
                id: 'switch',
                type: 'switch',
                position: { x: 0, y: 0 },
                data: {
                    conditions: [
                        { name: 'match', expression: 'input === 100', target: 'branch-match' }
                    ],
                    defaultTarget: 'default-branch'
                },
                inputs: [],
                outputs: []
            };

            const context: ExecutionContext = {
                variables: new Map(),
                inputs: { input: 50 },
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    executionId: 'test'
                }
            };

            const result = await executor.execute(node, context);
            
            expect(result.success).toBe(true);
            expect(result.outputs?.branch).toBe('default-branch');
        });
    });

    describe('NodeExecutorFactory', () => {
        it('should create executor for all built-in types', () => {
            const types = ['start', 'end', 'code', 'llm', 'switch', 'parallel', 'merge'];
            
            for (const type of types) {
                const executor = NodeExecutorFactory.create(type);
                expect(executor).toBeDefined();
                expect(executor.type).toBe(type);
            }
        });

        it('should throw for unknown type', () => {
            expect(() => {
                NodeExecutorFactory.create('unknown');
            }).toThrow('No executor found');
        });
    });
});
