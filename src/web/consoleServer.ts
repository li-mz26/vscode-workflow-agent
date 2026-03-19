import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowLoader, WorkflowEngine } from '../engine';
import { NodeConfig, Workflow } from '../engine/types';

interface JsonResponse {
  success: boolean;
  data?: any;
  error?: string;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: JsonResponse): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload));
}

function safeResolvePath(baseDir: string, targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(baseDir);
  if (!resolved.startsWith(root)) {
    throw new Error(`路径超出允许范围: ${targetPath}`);
  }
  return resolved;
}

function findWorkflowDirs(rootPath: string): string[] {
  const dirs: string[] = [];

  const walk = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    let hasWorkflow = false;

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.workflow.json')) {
        hasWorkflow = true;
      }
    }

    if (hasWorkflow) {
      dirs.push(current);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(path.join(current, entry.name));
    }
  };

  walk(rootPath);
  return dirs.sort();
}

interface ConsoleServerOptions {
  host?: string;
  port?: number;
  workspaceRoot?: string;
  mcp?: { host: string; port: number; transport: 'sse' | 'streamable-http' };
}

interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

function validateWorkflowDefinition(workflow: Workflow): WorkflowValidationResult {
  const errors: string[] = [];
  if (!workflow.id || !workflow.name || !workflow.version) {
    errors.push('工作流缺少必需字段: id, name, version');
  }
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push('工作流必须包含至少一个节点');
  }

  const nodeIds = new Set<string>();
  for (const node of workflow.nodes || []) {
    if (nodeIds.has(node.id)) {
      errors.push(`重复的节点 ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  for (const edge of workflow.edges || []) {
    if (!nodeIds.has(edge.source.nodeId)) {
      errors.push(`边引用了不存在的源节点: ${edge.source.nodeId}`);
    }
    if (!nodeIds.has(edge.target.nodeId)) {
      errors.push(`边引用了不存在的目标节点: ${edge.target.nodeId}`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const node of workflow.nodes || []) {
    adjacency.set(node.id, []);
  }
  for (const edge of workflow.edges || []) {
    adjacency.get(edge.source.nodeId)?.push(edge.target.nodeId);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) {
      if (!visited.has(next)) {
        if (hasCycle(next)) return true;
      } else if (recursionStack.has(next)) {
        return true;
      }
    }
    recursionStack.delete(nodeId);
    return false;
  };
  for (const node of workflow.nodes || []) {
    if (!visited.has(node.id) && hasCycle(node.id)) {
      errors.push('工作流必须是有向无环图 (DAG)');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

function getConsoleHtml(defaultRoot: string, mcpInfo?: { host: string; port: number; transport: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow 控制台</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; background: #f3f4f6; color: #111827; }
    .header { padding: 12px 16px; background: #111827; color: #f9fafb; display: flex; justify-content: space-between; }
    .container { display: grid; grid-template-columns: 340px 1fr; gap: 12px; padding: 12px; height: calc(100vh - 52px); }
    .panel { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; overflow: auto; }
    .row { display: flex; gap: 8px; margin-bottom: 8px; }
    input, button, select, textarea { padding: 8px; font-size: 13px; }
    input, select, textarea { border: 1px solid #d1d5db; border-radius: 6px; }
    button { border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; cursor: pointer; }
    button:hover { background: #f3f4f6; }
    #workflowList { width: 100%; min-height: 160px; }
    .workspace { display: grid; grid-template-rows: 48px 1fr 180px; gap: 10px; height: 100%; }
    .workspace-toolbar { display: flex; gap: 8px; align-items: center; }
    .workspace-tabs button.active { background: #111827; color: #fff; }
    .view { display: none; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; position: relative; }
    .view.active { display: block; }
    #visual-canvas { width: 100%; height: 100%; position: relative; overflow: auto; background: #fafafa; }
    #canvas-stage { position: relative; width: 2600px; height: 1800px; }
    #edges-layer { position: absolute; inset: 0; pointer-events: none; }
    #nodes-layer { position: absolute; inset: 0; }
    .node { position: absolute; width: 170px; min-height: 64px; border: 2px solid #d1d5db; border-radius: 8px; background: #fff; cursor: move; }
    .node.selected { border-color: #2563eb; box-shadow: 0 0 0 2px #bfdbfe; }
    .node-head { background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; font-weight: 600; font-size: 12px; }
    .node-body { padding: 8px; font-size: 12px; color: #6b7280; }
    .port { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; transform: translateY(-50%); background: #2563eb; }
    .port.in { left: -7px; }
    .port.out { right: -7px; cursor: crosshair; }
    #json-view, #result-view { width: 100%; height: 100%; margin: 0; border: none; border-radius: 8px; padding: 10px; font-family: Menlo, monospace; font-size: 12px; }
    #result-view { background: #111827; color: #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <div>Workflow 控制台（Web Workspace 编辑器）</div>
    <div>MCP：${mcpInfo ? `http://${mcpInfo.host}:${mcpInfo.port}/mcp (${mcpInfo.transport})` : '未配置'}</div>
  </div>

  <div class="container">
    <aside class="panel">
      <div class="row">
        <input id="rootPath" style="flex:1;" value="${defaultRoot}" />
      </div>
      <div class="row">
        <button onclick="scanWorkflows()">扫描</button>
        <button onclick="loadWorkflow()">加载</button>
      </div>
      <select id="workflowList" size="10"></select>
      <hr />
      <div class="row">
        <button onclick="addNode('code')">+ Code 节点</button>
        <button onclick="addNode('switch')">+ Switch 节点</button>
      </div>
      <div class="row">
        <button onclick="saveWorkflow()">保存工作流</button>
      </div>
      <div class="row">
        <textarea id="runInput" style="width:100%;height:110px;" placeholder='运行输入 JSON'>{}</textarea>
      </div>
      <div class="row">
        <button onclick="runWorkflow()">运行工作流</button>
      </div>
    </aside>

    <main class="workspace">
      <div class="workspace-toolbar">
        <div class="workspace-tabs">
          <button id="tab-visual" class="active" onclick="switchView('visual')">可视化</button>
          <button id="tab-json" onclick="switchView('json')">JSON</button>
        </div>
        <div id="statusText" style="margin-left:auto;color:#6b7280;font-size:12px;">未加载工作流</div>
      </div>

      <section id="visual" class="view active">
        <div id="visual-canvas">
          <div id="canvas-stage">
            <svg id="edges-layer"></svg>
            <div id="nodes-layer"></div>
          </div>
        </div>
      </section>

      <section id="json" class="view">
        <textarea id="json-view" spellcheck="false"></textarea>
      </section>

      <section class="view active" style="display:block;">
        <pre id="result-view">尚未运行</pre>
      </section>
    </main>
  </div>

  <script>
    let workflow = null;
    let nodeConfigs = {};
    let currentPath = '';
    let selectedNodeId = null;
    let dragging = null;
    let connectFrom = null;

    const workflowList = document.getElementById('workflowList');
    const nodesLayer = document.getElementById('nodes-layer');
    const edgesLayer = document.getElementById('edges-layer');
    const jsonView = document.getElementById('json-view');
    const resultView = document.getElementById('result-view');
    const statusText = document.getElementById('statusText');

    async function callApi(url, options = {}) {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '请求失败');
      return data.data;
    }

    function switchView(view) {
      document.getElementById('visual').classList.toggle('active', view === 'visual');
      document.getElementById('json').classList.toggle('active', view === 'json');
      document.getElementById('tab-visual').classList.toggle('active', view === 'visual');
      document.getElementById('tab-json').classList.toggle('active', view === 'json');
      if (view === 'json' && workflow) {
        jsonView.value = JSON.stringify(workflow, null, 2);
      }
    }

    function render() {
      if (!workflow) {
        nodesLayer.innerHTML = '';
        edgesLayer.innerHTML = '';
        return;
      }

      edgesLayer.setAttribute('viewBox', '0 0 2600 1800');
      edgesLayer.setAttribute('width', '2600');
      edgesLayer.setAttribute('height', '1800');

      nodesLayer.innerHTML = workflow.nodes.map(node => {
        const selectedClass = selectedNodeId === node.id ? 'selected' : '';
        const displayName = (node.metadata && node.metadata.name) ? node.metadata.name : node.id;
        return '<div class="node ' + selectedClass + '" data-id="' + node.id + '" style="left:' + node.position.x + 'px;top:' + node.position.y + 'px;">' +
          '<div class="port in"></div>' +
          '<div class="port out" data-port-out="' + node.id + '"></div>' +
          '<div class="node-head">' + displayName + ' (' + node.type + ')</div>' +
          '<div class="node-body">id: ' + node.id + '</div>' +
          '</div>';
      }).join('');

      edgesLayer.innerHTML = (workflow.edges || []).map(edge => {
        const s = workflow.nodes.find(n => n.id === edge.source.nodeId);
        const t = workflow.nodes.find(n => n.id === edge.target.nodeId);
        if (!s || !t) return '';
        const x1 = s.position.x + 170;
        const y1 = s.position.y + 32;
        const x2 = t.position.x;
        const y2 = t.position.y + 32;
        const c1 = x1 + 60;
        const c2 = x2 - 60;
        return '<path d="M ' + x1 + ' ' + y1 + ' C ' + c1 + ' ' + y1 + ', ' + c2 + ' ' + y2 + ', ' + x2 + ' ' + y2 + '" stroke="#6366f1" fill="none" stroke-width="2" />';
      }).join('');

      jsonView.value = JSON.stringify(workflow, null, 2);

      document.querySelectorAll('.node').forEach(el => {
        el.addEventListener('mousedown', e => {
          if (e.target.classList.contains('out')) {
            connectFrom = el.dataset.id;
            return;
          }
          selectedNodeId = el.dataset.id;
          const node = workflow.nodes.find(n => n.id === selectedNodeId);
          dragging = {
            id: selectedNodeId,
            startX: e.clientX,
            startY: e.clientY,
            originX: node.position.x,
            originY: node.position.y
          };
          render();
        });
      });
    }

    document.addEventListener('mousemove', e => {
      if (!dragging || !workflow) return;
      const node = workflow.nodes.find(n => n.id === dragging.id);
      if (!node) return;
      node.position.x = dragging.originX + (e.clientX - dragging.startX);
      node.position.y = dragging.originY + (e.clientY - dragging.startY);
      render();
    });

    document.addEventListener('mouseup', e => {
      dragging = null;
      if (!connectFrom || !workflow) return;

      const targetEl = e.target.closest('.node');
      const targetId = targetEl?.dataset?.id;
      if (targetId && targetId !== connectFrom) {
        const exists = workflow.edges.some(edge => edge.source.nodeId === connectFrom && edge.target.nodeId === targetId);
        if (!exists) {
          workflow.edges.push({
            id: 'edge_' + Date.now(),
            source: { nodeId: connectFrom, portId: 'output' },
            target: { nodeId: targetId, portId: 'input' }
          });
          render();
        }
      }

      connectFrom = null;
    });

    async function scanWorkflows() {
      const rootPath = document.getElementById('rootPath').value;
      const data = await callApi('/api/workflows/scan?root=' + encodeURIComponent(rootPath));
      workflowList.innerHTML = '';
      data.directories.forEach(dir => {
        const option = document.createElement('option');
        option.value = dir;
        option.textContent = dir;
        workflowList.appendChild(option);
      });
      statusText.textContent = '扫描到 ' + data.directories.length + ' 个工作流目录';
    }

    async function loadWorkflow() {
      const dir = workflowList.value;
      if (!dir) return;
      const data = await callApi('/api/workflows/load?path=' + encodeURIComponent(dir));
      currentPath = data.path;
      workflow = data.workflow;
      nodeConfigs = data.nodeConfigs || {};
      selectedNodeId = null;
      render();
      statusText.textContent = '已加载：' + workflow.name + '（' + workflow.nodes.length + ' 节点）';
    }

    function addNode(type) {
      if (!workflow) return;
      const id = type + '_' + Date.now();
      const node = {
        id,
        type,
        position: { x: 140 + workflow.nodes.length * 30, y: 120 + workflow.nodes.length * 20 },
        metadata: { name: type.toUpperCase(), description: '' }
      };
      workflow.nodes.push(node);
      render();
      statusText.textContent = '已添加节点：' + id;
    }

    async function saveWorkflow() {
      if (!workflow || !currentPath) return;
      if (document.getElementById('json').classList.contains('active')) {
        try {
          workflow = JSON.parse(jsonView.value);
        } catch (err) {
          alert('JSON 解析失败: ' + err.message);
          return;
        }
      }
      await callApi('/api/workflows/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: currentPath, workflow, nodeConfigs })
      });
      statusText.textContent = '已保存：' + workflow.name;
    }

    async function runWorkflow() {
      if (!workflow || !currentPath) return;
      let input = {};
      try {
        input = JSON.parse(document.getElementById('runInput').value || '{}');
      } catch (err) {
        alert('运行输入 JSON 非法: ' + err.message);
        return;
      }

      const data = await callApi('/api/workflows/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: currentPath, input })
      });
      resultView.textContent = JSON.stringify(data.result, null, 2);
    }

    scanWorkflows().catch(err => {
      statusText.textContent = '初始化失败: ' + err.message;
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export async function runWorkflowConsoleServer(options: ConsoleServerOptions = {}): Promise<http.Server> {
  const host = options.host || process.env.WORKFLOW_WEB_HOST || '127.0.0.1';
  const port = options.port || Number(process.env.WORKFLOW_WEB_PORT || 3030);
  const workspaceRoot = options.workspaceRoot || process.env.WORKFLOW_WEB_ROOT || process.cwd();
  const engine = new WorkflowEngine();

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { success: false, error: 'Empty url' });
      return;
    }

    const requestUrl = new URL(req.url, `http://${host}:${port}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(getConsoleHtml(workspaceRoot, options.mcp));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/workflows/scan') {
        const rootParam = requestUrl.searchParams.get('root') || workspaceRoot;
        const root = safeResolvePath(workspaceRoot, rootParam);
        const directories = findWorkflowDirs(root);
        sendJson(res, 200, { success: true, data: { root, directories } });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/workflows/load') {
        const pathParam = requestUrl.searchParams.get('path');
        if (!pathParam) throw new Error('缺少 path 参数');

        const workflowPath = safeResolvePath(workspaceRoot, pathParam);
        const result = await WorkflowLoader.loadFromDirectory(workflowPath);
        if (!result.success || !result.workflow) {
          throw new Error(result.error || '工作流加载失败');
        }

        sendJson(res, 200, {
          success: true,
          data: {
            path: workflowPath,
            workflow: result.workflow,
            nodeConfigs: Object.fromEntries(result.nodeConfigs || new Map())
          }
        });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/workflows/save') {
        const body = await readJsonBody(req);
        if (!body.path) throw new Error('缺少 path 参数');
        if (!body.workflow) throw new Error('缺少 workflow 参数');

        const workflowPath = safeResolvePath(workspaceRoot, body.path);
        const workflow = body.workflow as Workflow;
        const nodeConfigs = new Map<string, NodeConfig>(Object.entries((body.nodeConfigs || {}) as Record<string, NodeConfig>));

        const saveResult = await WorkflowLoader.saveToDirectory(workflowPath, workflow, nodeConfigs);
        if (!saveResult.success) {
          throw new Error(saveResult.error || '工作流保存失败');
        }

        sendJson(res, 200, { success: true, data: { path: workflowPath } });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/workflows/validate') {
        const body = await readJsonBody(req);
        let workflow: Workflow | undefined;
        let workflowPath: string | undefined;

        if (body.path) {
          workflowPath = safeResolvePath(workspaceRoot, body.path);
          const loaded = await WorkflowLoader.loadFromDirectory(workflowPath);
          if (!loaded.success || !loaded.workflow) {
            throw new Error(loaded.error || '工作流加载失败');
          }
          workflow = loaded.workflow;
        } else if (body.workflow) {
          workflow = body.workflow as Workflow;
        } else {
          throw new Error('缺少 path 或 workflow 参数');
        }

        const validation = validateWorkflowDefinition(workflow);
        sendJson(res, 200, {
          success: true,
          data: {
            path: workflowPath,
            valid: validation.valid,
            errors: validation.errors
          }
        });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/workflows/run') {
        const body = await readJsonBody(req);
        if (!body.path) throw new Error('缺少 path 参数');

        const workflowPath = safeResolvePath(workspaceRoot, body.path);
        const loaded = await WorkflowLoader.loadFromDirectory(workflowPath);
        if (!loaded.success || !loaded.workflow || !loaded.nodeConfigs) {
          throw new Error(loaded.error || '工作流加载失败');
        }

        const result = await engine.execute(loaded.workflow, loaded.nodeConfigs, body.input || {});
        sendJson(res, 200, { success: true, data: { result } });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/mcp/status') {
        sendJson(res, 200, { success: true, data: options.mcp || null });
        return;
      }

      sendJson(res, 404, { success: false, error: 'Not found' });
    } catch (error) {
      sendJson(res, 400, { success: false, error: String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`Workflow Web Console running at http://${host}:${port} (root=${workspaceRoot})`);
  return server;
}

if (require.main === module) {
  runWorkflowConsoleServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
