import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { runWorkflowConsoleServer } from '../src/web/consoleServer';
import { WorkflowLoader } from '../src/engine';
import { Workflow } from '../src/engine/types';
import { addEdgeIfNotExists } from '../src/shared/canvas/graphOps';

function requestJson<T>(port: number, method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload)
            }
          : undefined
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve(JSON.parse(raw) as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Web Console API consistency regression', () => {
  let tmpRoot = '';
  let workflowDir = '';
  let server: http.Server | null = null;
  let port = 0;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-web-console-'));
    workflowDir = path.join(tmpRoot, 'demo-workflow');
    fs.mkdirSync(workflowDir, { recursive: true });

    const workflow: Workflow = {
      id: 'wf_web_console',
      name: 'demo-workflow',
      version: '1.0.0',
      nodes: [
        { id: 'start', type: 'start', position: { x: 100, y: 120 }, metadata: { name: 'Start' } },
        { id: 'end', type: 'end', position: { x: 480, y: 120 }, metadata: { name: 'End' } }
      ],
      edges: [
        {
          id: 'e1',
          source: { nodeId: 'start', portId: 'output' },
          target: { nodeId: 'end', portId: 'input' }
        }
      ]
    };

    await WorkflowLoader.saveToDirectory(workflowDir, workflow, new Map());

    port = 39000 + Math.floor(Math.random() * 1000);
    server = await runWorkflowConsoleServer({
      host: '127.0.0.1',
      port,
      workspaceRoot: tmpRoot
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('should save and re-load workflow edits consistently', async () => {
    const loadResp = await requestJson<any>(
      port,
      'GET',
      `/api/workflows/load?path=${encodeURIComponent(workflowDir)}`
    );

    expect(loadResp.success).toBe(true);
    expect(loadResp.data.workflow.name).toBe('demo-workflow');

    const workflow = loadResp.data.workflow as Workflow;
    workflow.name = 'demo-workflow-updated';
    workflow.nodes[0].position.x = 220;

    const saveResp = await requestJson<any>(port, 'POST', '/api/workflows/save', {
      path: workflowDir,
      workflow,
      nodeConfigs: loadResp.data.nodeConfigs || {}
    });

    expect(saveResp.success).toBe(true);

    const reloaded = await requestJson<any>(
      port,
      'GET',
      `/api/workflows/load?path=${encodeURIComponent(workflowDir)}`
    );

    expect(reloaded.success).toBe(true);
    expect(reloaded.data.workflow.name).toBe('demo-workflow-updated');
    expect(reloaded.data.workflow.nodes[0].position.x).toBe(220);
  });

  it('should validate workflow from path and report invalid DAG for payload', async () => {
    const validResp = await requestJson<any>(port, 'POST', '/api/workflows/validate', {
      path: workflowDir
    });

    expect(validResp.success).toBe(true);
    expect(validResp.data.valid).toBe(true);
    expect(validResp.data.errors).toEqual([]);

    const invalidWorkflow: Workflow = {
      id: 'wf_invalid',
      name: 'invalid',
      version: '1.0.0',
      nodes: [
        { id: 'a', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'A' } },
        { id: 'b', type: 'end', position: { x: 20, y: 0 }, metadata: { name: 'B' } }
      ],
      edges: [
        { id: 'ab', source: { nodeId: 'a', portId: 'output' }, target: { nodeId: 'b', portId: 'input' } },
        { id: 'ba', source: { nodeId: 'b', portId: 'output' }, target: { nodeId: 'a', portId: 'input' } }
      ]
    };

    const invalidResp = await requestJson<any>(port, 'POST', '/api/workflows/validate', {
      workflow: invalidWorkflow
    });

    expect(invalidResp.success).toBe(true);
    expect(invalidResp.data.valid).toBe(false);
    expect(invalidResp.data.errors.some((msg: string) => msg.includes('DAG'))).toBe(true);
  });

  it('graph operations should keep edge uniqueness consistent with workspace behavior', () => {
    const wf: Workflow = {
      id: 'wf_graph',
      name: 'graph',
      version: '1.0.0',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, metadata: { name: 'Start' } },
        { id: 'code', type: 'code', position: { x: 50, y: 0 }, metadata: { name: 'Code' } }
      ],
      edges: []
    };

    const first = addEdgeIfNotExists(wf, {
      edgeId: 'e1',
      sourceNodeId: 'start',
      targetNodeId: 'code'
    });

    expect(first.added?.id).toBe('e1');

    const second = addEdgeIfNotExists(first.updated, {
      edgeId: 'e2',
      sourceNodeId: 'start',
      targetNodeId: 'code'
    });

    expect(second.added).toBeUndefined();
    expect(second.updated.edges).toHaveLength(1);
  });
});
