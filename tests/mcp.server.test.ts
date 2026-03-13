import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowMCPServer } from '../src/mcp/server';
import { Workflow } from '../src/engine/types';

describe('WorkflowMCPServer', () => {
  it('should create/validate workflow structures', () => {
    const server = new WorkflowMCPServer() as any;

    const created = server.handleWorkflowCreate({ name: 'mcp-test' });
    expect(created.success).toBe(true);
    expect(created.workflow.name).toBe('mcp-test');

    const valid = server.handleWorkflowValidate({
      workflow: {
        ...created.workflow,
        nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'Start' } }],
        edges: []
      }
    });
    expect(valid.valid).toBe(true);

    const invalid = server.handleWorkflowValidate({
      workflow: {
        ...created.workflow,
        nodes: [
          { id: 'n1', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'A' } },
          { id: 'n1', type: 'end', position: { x: 100, y: 0 }, metadata: { name: 'B' } }
        ],
        edges: []
      }
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((x: string) => x.includes('Duplicate node id'))).toBe(true);
  });

  it('should save, load and run workflow from filesystem', async () => {
    const server = new WorkflowMCPServer() as any;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mcp-'));

    const workflow: Workflow = {
      id: 'wf_mcp_run',
      name: 'wf-mcp-run',
      version: '1.0.0',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'Start' } },
        { id: 'end', type: 'end', position: { x: 100, y: 0 }, metadata: { name: 'End' } }
      ],
      edges: [
        { id: 'e1', source: { nodeId: 'start', portId: 'output' }, target: { nodeId: 'end', portId: 'input' } }
      ]
    };

    const save = await server.handleWorkflowSave({ workflow, nodeConfigs: {}, savePath: dir });
    expect(save.success).toBe(true);

    const load = await server.handleWorkflowLoad({ path: dir });
    expect(load.success).toBe(true);
    expect(load.workflow.id).toBe('wf_mcp_run');

    const run = await server.handleWorkflowRun({ path: dir, input: { foo: 'bar' } });
    expect(run.success).toBe(true);
    expect(run.result.status).toBe('success');
    expect(Array.isArray(run.result.nodeResults)).toBe(true);
  });


  it('should scan workflow folders under current working directory', async () => {
    const server = new WorkflowMCPServer() as any;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-scan-'));
    const wfDir = path.join(dir, 'demo-a');
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, 'demo-a.workflow.json'), JSON.stringify({ id: 'x', name: 'x', version: '1.0.0', nodes: [], edges: [] }));

    const nested = path.join(dir, 'nested', 'demo-b');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'demo-b.workflow.json'), JSON.stringify({ id: 'y', name: 'y', version: '1.0.0', nodes: [], edges: [] }));

    const result = await server.handleWorkflowScan({ path: dir });
    expect(result.success).toBe(true);
    expect(result.folders).toContain(wfDir);
    expect(result.folders).toContain(nested);
  });

  it('should expose supported node types', () => {
    const server = new WorkflowMCPServer() as any;
    const result = server.handleNodeTypesList();
    expect(result.types.some((t: { type: string }) => t.type === 'switch')).toBe(true);
    expect(result.types.some((t: { type: string }) => t.type === 'parallel')).toBe(true);
  });
});
