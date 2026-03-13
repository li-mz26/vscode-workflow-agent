import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowMCPServer } from '../src/mcp/server';
import { WorkflowLoader } from '../src/engine/loader';
import { Workflow } from '../src/engine/types';

describe('WorkflowMCPServer', () => {
  it('should save/load/run workflow via path-indexed tools', async () => {
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

    const save = await WorkflowLoader.saveToDirectory(dir, workflow, new Map());
    expect(save.success).toBe(true);

    const getResult = await server.executeTool('workflow_get', { path: dir });
    expect(getResult.success).toBe(true);
    expect(getResult.workflow.id).toBe('wf_mcp_run');

    const runResult = await server.executeTool('workflow_run', { path: dir, input: { foo: 'bar' } });
    expect(runResult.success).toBe(true);
    expect(runResult.result.status).toBe('success');

    const validate = await server.executeTool('workflow_validate', { path: dir });
    expect(validate.valid).toBe(true);
  });

  it('should support node/edge/config editing tools with required parameters', async () => {
    const server = new WorkflowMCPServer() as any;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mcp-edit-'));

    const workflow: Workflow = {
      id: 'wf_mcp_edit',
      name: 'wf-mcp-edit',
      version: '1.0.0',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'Start' } }
      ],
      edges: []
    };
    await WorkflowLoader.saveToDirectory(dir, workflow, new Map());

    const nodeAdd = await server.executeTool('node_add', {
      path: dir,
      nodeId: 'code1',
      nodeType: 'code',
      name: 'Code Node',
      x: 120,
      y: 40
    });
    expect(nodeAdd.success).toBe(true);

    const edgeAdd = await server.executeTool('edge_add', {
      path: dir,
      sourceNodeId: 'start',
      targetNodeId: 'code1'
    });
    expect(edgeAdd.success).toBe(true);

    const cfgSet = await server.executeTool('node_config_set_value', {
      path: dir,
      nodeId: 'code1',
      key: 'language',
      value: 'python'
    });
    expect(cfgSet.success).toBe(true);

    const codeSet = await server.executeTool('node_config_set_code', {
      path: dir,
      nodeId: 'code1',
      code: 'def main(input):\n    return {"ok": True}'
    });
    expect(codeSet.success).toBe(true);

    const cfgGet = await server.executeTool('node_config_get', { path: dir, nodeId: 'code1' });
    expect(cfgGet.success).toBe(true);
    expect(cfgGet.config.language).toBe('python');
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

    const result = await server.executeTool('workflow_scan', { path: dir });
    expect(result.success).toBe(true);
    expect(result.folders).toContain(wfDir);
    expect(result.folders).toContain(nested);
  });

  it('should expose supported node types', async () => {
    const server = new WorkflowMCPServer() as any;
    const result = await server.executeTool('node_types_list', {});
    expect(result.types.some((t: { type: string }) => t.type === 'switch')).toBe(true);
    expect(result.types.some((t: { type: string }) => t.type === 'parallel')).toBe(true);
  });
});
