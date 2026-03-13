/**
 * MCP 服务器 - 将 Engine 能力封装为 MCP 工具
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as http from 'http';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkflowEngine, WorkflowLoader } from '../engine';
import { Workflow, NodeConfig, NodeType, WorkflowEdge, WorkflowNode } from '../engine/types';

const tools: Tool[] = [
  {
    name: 'workflow_scan',
    description: '扫描目录下包含 *.workflow.json 的工作流文件夹路径',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '扫描根目录，默认使用 MCP Server 当前工作目录' }
      }
    }
  },
  {
    name: 'workflow_get',
    description: '通过工作流目录路径读取工作流与节点配置',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '工作流目录路径' } },
      required: ['path']
    }
  },
  {
    name: 'workflow_run',
    description: '执行指定目录的工作流',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '工作流目录路径' },
        input: { type: 'object', description: '初始输入数据' }
      },
      required: ['path']
    }
  },
  {
    name: 'workflow_validate',
    description: '验证指定目录的工作流结构',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '工作流目录路径' } },
      required: ['path']
    }
  },
  {
    name: 'node_add',
    description: '向指定工作流添加节点（参数化，安全封装）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '工作流目录路径' },
        nodeId: { type: 'string', description: '节点ID（唯一）' },
        nodeType: { type: 'string', description: '节点类型：start/end/code/llm/switch/parallel' },
        name: { type: 'string', description: '节点名称' },
        x: { type: 'number', description: '画布X位置' },
        y: { type: 'number', description: '画布Y位置' },
        description: { type: 'string', description: '节点描述（可选）' }
      },
      required: ['path', 'nodeId', 'nodeType', 'name', 'x', 'y']
    }
  },
  {
    name: 'node_update',
    description: '更新指定节点的基础属性（名称/描述/位置）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        nodeId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' }
      },
      required: ['path', 'nodeId']
    }
  },
  {
    name: 'node_remove',
    description: '从指定工作流移除节点（自动移除关联边）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        nodeId: { type: 'string' }
      },
      required: ['path', 'nodeId']
    }
  },
  {
    name: 'edge_add',
    description: '向指定工作流添加边（参数化，安全封装）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edgeId: { type: 'string' },
        sourceNodeId: { type: 'string' },
        targetNodeId: { type: 'string' },
        sourcePortId: { type: 'string' },
        targetPortId: { type: 'string' },
        label: { type: 'string' },
        branchId: { type: 'string' }
      },
      required: ['path', 'sourceNodeId', 'targetNodeId']
    }
  },
  {
    name: 'edge_update',
    description: '更新边的元数据（label/branchId）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edgeId: { type: 'string' },
        label: { type: 'string' },
        branchId: { type: 'string' }
      },
      required: ['path', 'edgeId']
    }
  },
  {
    name: 'edge_remove',
    description: '从指定工作流移除边',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edgeId: { type: 'string' }
      },
      required: ['path', 'edgeId']
    }
  },
  {
    name: 'node_config_get',
    description: '读取节点配置',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        nodeId: { type: 'string' }
      },
      required: ['path', 'nodeId']
    }
  },
  {
    name: 'node_config_set_value',
    description: '更新节点配置中的单个键值（避免整段JSON覆盖）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        nodeId: { type: 'string' },
        key: { type: 'string' },
        value: { description: '要写入的值（任意JSON值）' }
      },
      required: ['path', 'nodeId', 'key', 'value']
    }
  },
  {
    name: 'node_config_set_code',
    description: '更新 code 节点的代码内容',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        nodeId: { type: 'string' },
        code: { type: 'string' }
      },
      required: ['path', 'nodeId', 'code']
    }
  },
  {
    name: 'node_types_list',
    description: '列出所有支持的节点类型',
    inputSchema: { type: 'object', properties: {} }
  }
];

type HttpTransportMode = 'sse' | 'streamable-http';

type WorkflowContext = { workflow: Workflow; nodeConfigs: Map<string, NodeConfig> };

export class WorkflowMCPServer {
  private server: Server;
  private engine: WorkflowEngine;
  private loadedWorkflows: Map<string, WorkflowContext>;

  constructor() {
    this.engine = new WorkflowEngine();
    this.loadedWorkflows = new Map();

    const serverInfo = { name: 'vscode-workflow-agent', version: '0.1.0' };
    try {
      this.server = new (Server as any)(serverInfo, { capabilities: { tools: {} } });
    } catch {
      this.server = new Server(serverInfo);
    }

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.executeTool(name, args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(error) }, null, 2) }],
          isError: true
        };
      }
    });
  }

  private async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'workflow_scan': return this.handleWorkflowScan(args || {});
      case 'workflow_get': return this.handleWorkflowGet(args);
      case 'workflow_run': return this.handleWorkflowRun(args);
      case 'workflow_validate': return this.handleWorkflowValidate(args);
      case 'node_add': return this.handleNodeAdd(args);
      case 'node_update': return this.handleNodeUpdate(args);
      case 'node_remove': return this.handleNodeRemove(args);
      case 'edge_add': return this.handleEdgeAdd(args);
      case 'edge_update': return this.handleEdgeUpdate(args);
      case 'edge_remove': return this.handleEdgeRemove(args);
      case 'node_config_get': return this.handleNodeConfigGet(args);
      case 'node_config_set_value': return this.handleNodeConfigSetValue(args);
      case 'node_config_set_code': return this.handleNodeConfigSetCode(args);
      case 'node_types_list': return this.handleNodeTypesList();
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async loadContext(dirPath: string): Promise<WorkflowContext> {
    const result = await WorkflowLoader.loadFromDirectory(dirPath);
    if (!result.success || !result.workflow || !result.nodeConfigs) {
      throw new Error(result.error || `Failed to load workflow from ${dirPath}`);
    }

    const ctx = { workflow: result.workflow, nodeConfigs: result.nodeConfigs };
    this.loadedWorkflows.set(dirPath, ctx);
    return ctx;
  }

  private async getContext(dirPath: string): Promise<WorkflowContext> {
    return this.loadedWorkflows.get(dirPath) || this.loadContext(dirPath);
  }

  private async saveContext(dirPath: string, ctx: WorkflowContext): Promise<void> {
    const saveResult = await WorkflowLoader.saveToDirectory(dirPath, ctx.workflow, ctx.nodeConfigs);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Save workflow failed');
    }
    this.loadedWorkflows.set(dirPath, ctx);
  }

  private async handleWorkflowScan(args: { path?: string }): Promise<any> {
    const root = path.resolve(args.path || process.cwd());
    const folders = new Set<string>();

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          scanDir(fullPath);
        } else if (entry.name.endsWith('.workflow.json')) {
          folders.add(path.dirname(fullPath));
        }
      }
    };

    scanDir(root);
    return { success: true, root, folders: [...folders].sort() };
  }

  private async handleWorkflowGet(args: { path: string }): Promise<any> {
    const ctx = await this.loadContext(args.path);
    return {
      success: true,
      workflow: ctx.workflow,
      nodeConfigs: Object.fromEntries(ctx.nodeConfigs)
    };
  }

  private async handleWorkflowRun(args: { path: string; input?: any }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const executionResult = await this.engine.execute(ctx.workflow, ctx.nodeConfigs, args.input);
    return { success: true, result: executionResult };
  }

  private async handleWorkflowValidate(args: { path: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const saveProbe = await WorkflowLoader.saveToDirectory(args.path, ctx.workflow, ctx.nodeConfigs);
    return { valid: saveProbe.success, error: saveProbe.error };
  }

  private async handleNodeAdd(args: { path: string; nodeId: string; nodeType: NodeType; name: string; x: number; y: number; description?: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    if (ctx.workflow.nodes.some(n => n.id === args.nodeId)) {
      throw new Error(`Node already exists: ${args.nodeId}`);
    }

    const node: WorkflowNode = {
      id: args.nodeId,
      type: args.nodeType,
      position: { x: args.x, y: args.y },
      metadata: { name: args.name, description: args.description || '' }
    };

    ctx.workflow.nodes = [...ctx.workflow.nodes, node];
    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true, node };
  }

  private async handleNodeUpdate(args: { path: string; nodeId: string; name?: string; description?: string; x?: number; y?: number }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const node = ctx.workflow.nodes.find(n => n.id === args.nodeId);
    if (!node) throw new Error(`Node not found: ${args.nodeId}`);

    if (args.name !== undefined) node.metadata.name = args.name;
    if (args.description !== undefined) node.metadata.description = args.description;
    if (args.x !== undefined) node.position.x = args.x;
    if (args.y !== undefined) node.position.y = args.y;

    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true, node };
  }

  private async handleNodeRemove(args: { path: string; nodeId: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const exists = ctx.workflow.nodes.some(n => n.id === args.nodeId);
    if (!exists) throw new Error(`Node not found: ${args.nodeId}`);

    ctx.workflow.nodes = ctx.workflow.nodes.filter(n => n.id !== args.nodeId);
    ctx.workflow.edges = ctx.workflow.edges.filter(e => e.source.nodeId !== args.nodeId && e.target.nodeId !== args.nodeId);
    ctx.nodeConfigs.delete(args.nodeId);

    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true };
  }

  private async handleEdgeAdd(args: { path: string; edgeId?: string; sourceNodeId: string; targetNodeId: string; sourcePortId?: string; targetPortId?: string; label?: string; branchId?: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const sourceExists = ctx.workflow.nodes.some(n => n.id === args.sourceNodeId);
    const targetExists = ctx.workflow.nodes.some(n => n.id === args.targetNodeId);
    if (!sourceExists || !targetExists) throw new Error('Source/target node not found');

    const edge: WorkflowEdge = {
      id: args.edgeId || `edge_${Date.now()}`,
      source: { nodeId: args.sourceNodeId, portId: args.sourcePortId || 'output' },
      target: { nodeId: args.targetNodeId, portId: args.targetPortId || 'input' },
      label: args.label,
      branchId: args.branchId
    };

    if (ctx.workflow.edges.some(e => e.id === edge.id)) throw new Error(`Edge already exists: ${edge.id}`);
    ctx.workflow.edges = [...ctx.workflow.edges, edge];
    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true, edge };
  }

  private async handleEdgeUpdate(args: { path: string; edgeId: string; label?: string; branchId?: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const edge = ctx.workflow.edges.find(e => e.id === args.edgeId);
    if (!edge) throw new Error(`Edge not found: ${args.edgeId}`);

    if (args.label !== undefined) edge.label = args.label;
    if (args.branchId !== undefined) edge.branchId = args.branchId;
    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true, edge };
  }

  private async handleEdgeRemove(args: { path: string; edgeId: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const before = ctx.workflow.edges.length;
    ctx.workflow.edges = ctx.workflow.edges.filter(e => e.id !== args.edgeId);
    if (ctx.workflow.edges.length === before) throw new Error(`Edge not found: ${args.edgeId}`);

    ctx.workflow.metadata = { ...ctx.workflow.metadata, updatedAt: new Date().toISOString() };
    await this.saveContext(args.path, ctx);
    return { success: true };
  }

  private async handleNodeConfigGet(args: { path: string; nodeId: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    if (!ctx.workflow.nodes.some(n => n.id === args.nodeId)) throw new Error(`Node not found: ${args.nodeId}`);
    return { success: true, nodeId: args.nodeId, config: ctx.nodeConfigs.get(args.nodeId) || null };
  }

  private async handleNodeConfigSetValue(args: { path: string; nodeId: string; key: string; value: any }): Promise<any> {
    const ctx = await this.getContext(args.path);
    if (!ctx.workflow.nodes.some(n => n.id === args.nodeId)) throw new Error(`Node not found: ${args.nodeId}`);

    const current = (ctx.nodeConfigs.get(args.nodeId) || {}) as any;
    current[args.key] = args.value;
    ctx.nodeConfigs.set(args.nodeId, current);

    await this.saveContext(args.path, ctx);
    return { success: true, nodeId: args.nodeId, config: current };
  }

  private async handleNodeConfigSetCode(args: { path: string; nodeId: string; code: string }): Promise<any> {
    const ctx = await this.getContext(args.path);
    const node = ctx.workflow.nodes.find(n => n.id === args.nodeId);
    if (!node) throw new Error(`Node not found: ${args.nodeId}`);
    if (node.type !== 'code') throw new Error(`Node ${args.nodeId} is not code type`);

    const current = (ctx.nodeConfigs.get(args.nodeId) || { language: 'python' }) as any;
    current.code = args.code;
    if (!current.language) current.language = 'python';
    ctx.nodeConfigs.set(args.nodeId, current);

    await this.saveContext(args.path, ctx);
    return { success: true, nodeId: args.nodeId, config: current };
  }

  private handleNodeTypesList(): any {
    const types: { type: NodeType; description: string }[] = [
      { type: 'start', description: '开始节点 - 工作流入口，支持手动/API触发' },
      { type: 'end', description: '结束节点 - 工作流出口，定义输出格式' },
      { type: 'code', description: '代码执行 - 运行 Python 代码' },
      { type: 'llm', description: 'LLM 调用 - 调用大语言模型进行文本生成' },
      { type: 'switch', description: '条件分支 - 根据条件路由到不同分支' },
      { type: 'parallel', description: '并行执行 - 同时执行多个分支' }
    ];
    return { types };
  }

  async runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Workflow MCP Server running on stdio');
  }

  async runHttp(host: string, port: number, mode: HttpTransportMode = 'sse'): Promise<void> {
    let sseTransport: SSEServerTransport | undefined;

    const setCorsHeaders = (res: http.ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version');
      res.setHeader('Access-Control-Max-Age', '86400');
    };

    const readJsonBody = async (req: http.IncomingMessage): Promise<any> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      return raw ? JSON.parse(raw) : {};
    };

    const sendJsonRpc = (res: http.ServerResponse, id: any, payload: any, isError = false) => {
      const body = isError ? { jsonrpc: '2.0', id, error: payload } : { jsonrpc: '2.0', id, result: payload };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const httpServer = http.createServer(async (req, res) => {
      setCorsHeaders(res);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);

      if (req.method === 'GET' && reqUrl.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, transport: mode }));
        return;
      }

      if (mode === 'sse') {
        if (req.method === 'GET' && (reqUrl.pathname === '/sse' || reqUrl.pathname === '/mcp')) {
          if (sseTransport) {
            res.writeHead(409, { 'content-type': 'text/plain' });
            res.end('SSE session already established');
            return;
          }

          sseTransport = new SSEServerTransport('/mcp', res);
          sseTransport.onclose = () => { sseTransport = undefined; };
          await this.server.connect(sseTransport);
          return;
        }

        if (req.method === 'POST' && (reqUrl.pathname === '/message' || reqUrl.pathname === '/mcp')) {
          if (!sseTransport) {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('SSE session not established');
            return;
          }

          const sessionId = reqUrl.searchParams.get('sessionId');
          if (sessionId !== sseTransport.sessionId) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('Unknown sessionId');
            return;
          }

          await sseTransport.handlePostMessage(req, res);
          return;
        }
      }

      if (mode === 'streamable-http' && req.method === 'POST' && reqUrl.pathname === '/mcp') {
        try {
          const message = await readJsonBody(req);
          const id = message?.id;
          const method = message?.method;
          const params = message?.params || {};

          if (!method) {
            sendJsonRpc(res, id ?? null, { code: -32600, message: 'Invalid Request' }, true);
            return;
          }

          if (method === 'initialize') {
            sendJsonRpc(res, id, {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'vscode-workflow-agent', version: '0.1.0' }
            });
            return;
          }

          if (method === 'notifications/initialized') {
            res.writeHead(202);
            res.end();
            return;
          }

          if (method === 'tools/list') {
            sendJsonRpc(res, id, { tools });
            return;
          }

          if (method === 'tools/call') {
            const toolResult = await this.executeTool(params.name, params.arguments || {});
            sendJsonRpc(res, id, {
              content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
            });
            return;
          }

          sendJsonRpc(res, id, { code: -32601, message: `Method not found: ${method}` }, true);
          return;
        } catch (error) {
          sendJsonRpc(res, null, { code: -32603, message: String(error) }, true);
          return;
        }
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => resolve());
    });

    console.error(`Workflow MCP Server running at http://${host}:${port} mode=${mode} (GET /health, /mcp)`);
  }
}

export async function runMCPServer(): Promise<void> {
  const server = new WorkflowMCPServer();

  const cwd = process.env.WORKFLOW_MCP_CWD;
  if (cwd) {
    try {
      process.chdir(cwd);
    } catch (error) {
      console.error('Failed to change cwd:', error);
    }
  }

  const host = process.env.WORKFLOW_MCP_HOST || '127.0.0.1';
  const port = Number(process.env.WORKFLOW_MCP_PORT || 0);
  const transport = (process.env.WORKFLOW_MCP_TRANSPORT || 'streamable-http') as HttpTransportMode;

  if (port > 0) {
    await server.runHttp(host, port, transport);
  } else {
    await server.runStdio();
  }
}

export default WorkflowMCPServer;
