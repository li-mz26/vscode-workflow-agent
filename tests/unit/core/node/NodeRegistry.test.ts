import { describe, it, expect, beforeEach } from 'vitest';
import { NodeRegistry } from '../../../src/core/node/NodeRegistry';
import { Position } from '../../../src/shared/types';

describe('NodeRegistry', () => {
    let registry: NodeRegistry;

    beforeEach(() => {
        registry = new NodeRegistry();
    });

    describe('getDefinition', () => {
        it('should return definition for built-in types', () => {
            const startDef = registry.getDefinition('start');
            expect(startDef).toBeDefined();
            expect(startDef?.name).toBe('Start');
            expect(startDef?.type).toBe('start');
        });

        it('should return undefined for unknown types', () => {
            const def = registry.getDefinition('unknown');
            expect(def).toBeUndefined();
        });
    });

    describe('getAllDefinitions', () => {
        it('should return all built-in node types', () => {
            const defs = registry.getAllDefinitions();
            expect(defs.length).toBeGreaterThanOrEqual(7);
            
            const types = defs.map(d => d.type);
            expect(types).toContain('start');
            expect(types).toContain('end');
            expect(types).toContain('code');
            expect(types).toContain('llm');
            expect(types).toContain('switch');
            expect(types).toContain('parallel');
            expect(types).toContain('merge');
        });
    });

    describe('getCategories', () => {
        it('should return all categories', () => {
            const categories = registry.getCategories();
            expect(categories).toContain('basic');
            expect(categories).toContain('flow');
        });
    });

    describe('createNode', () => {
        it('should create a node with correct type', () => {
            const position: Position = { x: 100, y: 200 };
            const node = registry.createNode('start', position);

            expect(node.type).toBe('start');
            expect(node.position).toEqual(position);
            expect(node.id).toBeDefined();
            expect(node.data).toBeDefined();
        });

        it('should create node with default data', () => {
            const node = registry.createNode('code', { x: 0, y: 0 });
            
            expect(node.data.code).toBeDefined();
            expect(node.data.timeout).toBe(30);
        });

        it('should create node with metadata', () => {
            const node = registry.createNode('llm', { x: 0, y: 0 });
            
            expect(node.metadata).toBeDefined();
            expect(node.metadata?.name).toBe('LLM');
            expect(node.metadata?.color).toBe('#9C27B0');
        });

        it('should throw error for unknown type', () => {
            expect(() => {
                registry.createNode('unknown', { x: 0, y: 0 });
            }).toThrow('Unknown node type');
        });
    });

    describe('register', () => {
        it('should register custom node type', () => {
            registry.register({
                type: 'custom',
                category: 'test',
                name: 'Custom Node',
                description: 'A custom node',
                icon: 'test',
                color: '#000000',
                inputs: [],
                outputs: [],
                configSchema: { type: 'object' },
                defaultData: {},
                executor: 'CustomExecutor'
            });

            const def = registry.getDefinition('custom');
            expect(def).toBeDefined();
            expect(def?.name).toBe('Custom Node');
        });
    });
});
