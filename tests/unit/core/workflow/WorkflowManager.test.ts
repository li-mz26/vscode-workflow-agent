import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowManager } from '../../../src/core/workflow/WorkflowManager';
import { Workflow, CreateWorkflowDTO } from '../../../src/shared/types';

// Mock VSCode API
const mockWorkspaceFolders = [{
    uri: { fsPath: '/test/workspace' }
}];

vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: mockWorkspaceFolders,
        createFileSystemWatcher: vi.fn(() => ({
            onDidCreate: vi.fn(),
            onDidChange: vi.fn(),
            onDidDelete: vi.fn()
        })),
        findFiles: vi.fn().mockResolvedValue([])
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}));

describe('WorkflowManager', () => {
    let manager: WorkflowManager;
    let mockContext: any;

    beforeEach(() => {
        mockContext = {
            extensionPath: '/test/extension'
        };
        manager = new WorkflowManager(mockContext);
    });

    describe('createWorkflow', () => {
        it('should create workflow with correct structure', async () => {
            const dto: CreateWorkflowDTO = {
                name: 'Test Workflow',
                description: 'A test workflow'
            };

            const workflow = await manager.createWorkflow(dto);

            expect(workflow).toBeDefined();
            expect(workflow.name).toBe('Test Workflow');
            expect(workflow.description).toBe('A test workflow');
            expect(workflow.id).toBeDefined();
            expect(workflow.version).toBe('1.0.0');
        });

        it('should create workflow with default nodes', async () => {
            const workflow = await manager.createWorkflow({ name: 'Test' });

            expect(workflow.nodes.length).toBeGreaterThanOrEqual(2);
            
            const startNode = workflow.nodes.find(n => n.type === 'start');
            const endNode = workflow.nodes.find(n => n.type === 'end');
            
            expect(startNode).toBeDefined();
            expect(endNode).toBeDefined();
        });
    });

    describe('validateWorkflow', () => {
        it('should validate workflow with start and end nodes', () => {
            const workflow: Workflow = {
                id: 'test',
                name: 'Test',
                version: '1.0.0',
                nodes: [
                    {
                        id: 'start',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    },
                    {
                        id: 'end',
                        type: 'end',
                        position: { x: 100, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    }
                ],
                edges: [],
                variables: [],
                settings: { timeout: 30, logLevel: 'info' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const result = manager.validateWorkflow(workflow);
            expect(result.valid).toBe(true);
        });

        it('should fail validation without start node', () => {
            const workflow: Workflow = {
                id: 'test',
                name: 'Test',
                version: '1.0.0',
                nodes: [
                    {
                        id: 'end',
                        type: 'end',
                        position: { x: 0, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    }
                ],
                edges: [],
                variables: [],
                settings: { timeout: 30, logLevel: 'info' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const result = manager.validateWorkflow(workflow);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Workflow must have a Start node');
        });

        it('should fail validation without end node', () => {
            const workflow: Workflow = {
                id: 'test',
                name: 'Test',
                version: '1.0.0',
                nodes: [
                    {
                        id: 'start',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    }
                ],
                edges: [],
                variables: [],
                settings: { timeout: 30, logLevel: 'info' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const result = manager.validateWorkflow(workflow);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Workflow must have an End node');
        });

        it('should detect duplicate node IDs', () => {
            const workflow: Workflow = {
                id: 'test',
                name: 'Test',
                version: '1.0.0',
                nodes: [
                    {
                        id: 'same-id',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    },
                    {
                        id: 'same-id',
                        type: 'end',
                        position: { x: 100, y: 0 },
                        data: {},
                        inputs: [],
                        outputs: []
                    }
                ],
                edges: [],
                variables: [],
                settings: { timeout: 30, logLevel: 'info' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const result = manager.validateWorkflow(workflow);
            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('Duplicate'))).toBe(true);
        });
    });
});
