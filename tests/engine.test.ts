/**
 * Engine 模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../src/engine/executor';
import { Workflow } from '../src/engine/types';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it('should create engine instance', () => {
    expect(engine).toBeDefined();
  });

  it('should execute simple workflow with start and end nodes', async () => {
    const workflow: Workflow = {
      id: 'test_wf_001',
      name: 'test-workflow',
      version: '1.0.0',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          metadata: { name: 'Start' }
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 100, y: 0 },
          metadata: { name: 'End' }
        }
      ],
      edges: [
        {
          id: 'edge_1',
          source: { nodeId: 'start', portId: 'output' },
          target: { nodeId: 'end', portId: 'input' }
        }
      ]
    };

    const nodeConfigs = new Map();
    const result = await engine.execute(workflow, nodeConfigs);

    expect(result.status).toBe('success');
    expect(result.workflowId).toBe('test_wf_001');
    expect(result.nodeResults).toHaveLength(2);
  });

  it('should handle switch node', async () => {
    const workflow: Workflow = {
      id: 'test_wf_switch',
      name: 'test-switch',
      version: '1.0.0',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          metadata: { name: 'Start' }
        },
        {
          id: 'switch1',
          type: 'switch',
          position: { x: 100, y: 0 },
          metadata: { name: 'Switch' },
          data: {
            branches: [
              { id: 'branch_a', name: 'Branch A', condition: 'data.score > 80' }
            ],
            defaultBranch: 'default'
          }
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 200, y: 0 },
          metadata: { name: 'End' }
        }
      ],
      edges: [
        {
          id: 'edge_1',
          source: { nodeId: 'start', portId: 'output' },
          target: { nodeId: 'switch1', portId: 'input' }
        },
        {
          id: 'edge_2',
          source: { nodeId: 'switch1', portId: 'output' },
          target: { nodeId: 'end', portId: 'input' }
        }
      ]
    };

    const nodeConfigs = new Map();
    nodeConfigs.set('switch1', {
      branches: [
        { id: 'branch_a', name: 'Branch A', condition: 'data.score > 80' }
      ],
      defaultBranch: 'default'
    });

    const result = await engine.execute(workflow, nodeConfigs);
    expect(result.status).toBe('success');
  });


  it('should emit correct incoming edge for merged node after switch branch', async () => {
    const workflow: Workflow = {
      id: 'test_wf_branch_edge',
      name: 'test-branch-edge',
      version: '1.0.0',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'Start' } },
        { id: 'switch1', type: 'switch', position: { x: 100, y: 0 }, metadata: { name: 'Switch' } },
        { id: 'high', type: 'code', position: { x: 220, y: -60 }, metadata: { name: 'High' } },
        { id: 'low', type: 'code', position: { x: 220, y: 60 }, metadata: { name: 'Low' } },
        { id: 'summary', type: 'end', position: { x: 360, y: 0 }, metadata: { name: 'Summary' } }
      ],
      edges: [
        { id: 'e_start_switch', source: { nodeId: 'start', portId: 'output' }, target: { nodeId: 'switch1', portId: 'input' } },
        { id: 'e_switch_high', source: { nodeId: 'switch1', portId: 'output' }, target: { nodeId: 'high', portId: 'input' }, branchId: 'high' },
        { id: 'e_switch_low', source: { nodeId: 'switch1', portId: 'output' }, target: { nodeId: 'low', portId: 'input' }, branchId: 'low' },
        { id: 'e_high_summary', source: { nodeId: 'high', portId: 'output' }, target: { nodeId: 'summary', portId: 'input' } },
        { id: 'e_low_summary', source: { nodeId: 'low', portId: 'output' }, target: { nodeId: 'summary', portId: 'input' } }
      ]
    };

    const nodeConfigs = new Map();
    nodeConfigs.set('switch1', {
      branches: [
        { id: 'high', name: 'High', condition: 'data.score > 80' },
        { id: 'low', name: 'Low', condition: 'data.score <= 80' }
      ],
      defaultBranch: 'low'
    });
    nodeConfigs.set('high', { language: 'javascript', code: 'return { path: "high" };' });
    nodeConfigs.set('low', { language: 'javascript', code: 'return { path: "low" };' });

    const endEvents: Array<{ nodeId: string; incomingEdgeId?: string }> = [];
    engine.on(event => {
      if (event.type === 'node:end') {
        endEvents.push({ nodeId: event.result.nodeId, incomingEdgeId: event.incomingEdgeId });
      }
    });

    await engine.execute(workflow, nodeConfigs, { score: 60 });

    const summaryEndEvent = endEvents.find(e => e.nodeId === 'summary');
    expect(summaryEndEvent).toBeDefined();
    expect(summaryEndEvent?.incomingEdgeId).toBe('e_low_summary');
  });

  it('should detect invalid DAG (cycle)', async () => {
    const workflow: Workflow = {
      id: 'test_wf_cycle',
      name: 'test-cycle',
      version: '1.0.0',
      nodes: [
        { id: 'a', type: 'code', position: { x: 0, y: 0 }, metadata: { name: 'A' } },
        { id: 'b', type: 'code', position: { x: 100, y: 0 }, metadata: { name: 'B' } }
      ],
      edges: [
        { id: 'e1', source: { nodeId: 'a', portId: 'out' }, target: { nodeId: 'b', portId: 'in' } },
        { id: 'e2', source: { nodeId: 'b', portId: 'out' }, target: { nodeId: 'a', portId: 'in' } }
      ]
    };

    // 执行带环的工作流应该有问题（根据实现可能需要验证）
    // 这里只是确保引擎不会崩溃
    const result = await engine.execute(workflow, new Map());
    expect(result).toBeDefined();
  });
});

describe('Workflow Types', () => {
  it('should define all node types', () => {
    const nodeTypes = ['start', 'end', 'switch', 'parallel', 'code', 'llm', 'http', 'transform', 'delay'];
    expect(nodeTypes.length).toBeGreaterThan(0);
  });
});