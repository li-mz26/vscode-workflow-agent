/**
 * MCP 服务器 - 将 Engine 能力封装为 MCP 工具
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as http from 'http';
import { URL } from 'url';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkflowEngine, WorkflowLoader } from '../engine';
import { Workflow, NodeConfig, NodeType } from '../engine/types';

// ============ 工具定义 ============

const tools: Tool[] = [
  {
    name: 'workflow_load',
    description: '从目录加载工作流定义',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '工作流目录路径'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'workflow_create',
    description: '创建新的工作流',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '工作流名称'
        },
        description: {
          type: 'string',
          description: '工作流描述'
        },
        savePath: {
          type: 'string',
          description: '保存路径'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'workflow_save',
    description: '保存工作流到目录',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        },
        nodeConfigs: {
          type: 'object',
          description: '节点配置映射'
        },
        savePath: {
          type: 'string',
          description: '保存路径'
        }
      },
      required: ['workflow', 'savePath']
    }
  },
  {
    name: 'workflow_run',
    description: '执行工作流',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '工作流目录路径'
        },
        input: {
          type: 'object',
          description: '初始输入数据'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'workflow_validate',
    description: '验证工作流定义',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        }
      },
      required: ['workflow']
    }
  },
  {
    name: 'node_add',
    description: '向工作流添加节点',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        },
        node: {
          type: 'object',
          description: '节点定义'
        }
      },
      required: ['workflow', 'node']
    }
  },
  {
    name: 'node_remove',
    description: '从工作流移除节点',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        },
        nodeId: {
          type: 'string',
          description: '节点 ID'
        }
      },
      required: ['workflow', 'nodeId']
    }
  },
  {
    name: 'edge_add',
    description: '向工作流添加边',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        },
        edge: {
          type: 'object',
          description: '边定义'
        }
      },
      required: ['workflow', 'edge']
    }
  },
  {
    name: 'edge_remove',
    description: '从工作流移除边',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: '工作流定义'
        },
        edgeId: {
          type: 'string',
          description: '边 ID'
        }
      },
      required: ['workflow', 'edgeId']
    }
  },
  {
    name: 'node_types_list',
    description: '列出所有支持的节点类型',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// ============ 服务器类 ============

export class WorkflowMCPServer {
  private server: Server;
  private engine: WorkflowEngine;
  private loadedWorkflows: Map<string, { workflow: Workflow; nodeConfigs: Map<string, NodeConfig> }>;

  constructor() {
    this.engine = new WorkflowEngine();
    this.loadedWorkflows = new Map();
    
    const serverInfo = { name: 'vscode-workflow-agent', version: '0.1.0' };

    // 兼容不同版本 MCP SDK：
    // - 新版可能要求在构造函数中显式声明 capabilities
    // - 旧版仅接受 serverInfo 单参数
    try {
      this.server = new (Server as any)(serverInfo, {
        capabilities: {
          tools: {}
        }
      });
    } catch {
      this.server = new Server(serverInfo);
    }

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // 列出工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        let result: any;
        
        switch (name) {
          case 'workflow_load':
            result = await this.handleWorkflowLoad(args as any);
            break;
          case 'workflow_create':
            result = this.handleWorkflowCreate(args as any);
            break;
          case 'workflow_save':
            result = await this.handleWorkflowSave(args as any);
            break;
          case 'workflow_run':
            result = await this.handleWorkflowRun(args as any);
            break;
          case 'workflow_validate':
            result = this.handleWorkflowValidate(args as any);
            break;
          case 'node_add':
            result = this.handleNodeAdd(args as any);
            break;
          case 'node_remove':
            result = this.handleNodeRemove(args as any);
            break;
          case 'edge_add':
            result = this.handleEdgeAdd(args as any);
            break;
          case 'edge_remove':
            result = this.handleEdgeRemove(args as any);
            break;
          case 'node_types_list':
            result = this.handleNodeTypesList();
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  // ============ 工具处理函数 ============

  private async handleWorkflowLoad(args: { path: string }): Promise<any> {
    const result = await WorkflowLoader.loadFromDirectory(args.path);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // 缓存加载的工作流
    this.loadedWorkflows.set(args.path, {
      workflow: result.workflow!,
      nodeConfigs: result.nodeConfigs!
    });
    
    return {
      success: true,
      workflow: result.workflow,
      nodeConfigs: Object.fromEntries(result.nodeConfigs!)
    };
  }

  private handleWorkflowCreate(args: { name: string; description?: string; savePath?: string }): any {
    const workflow: Workflow = {
      id: `wf_${Date.now()}`,
      name: args.name,
      description: args.description || '',
      version: '1.0.0',
      nodes: [],
      edges: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    if (args.savePath) {
      this.loadedWorkflows.set(args.savePath, {
        workflow,
        nodeConfigs: new Map()
      });
    }

    return { success: true, workflow };
  }

  private async handleWorkflowSave(args: { workflow: Workflow; nodeConfigs?: Record<string, NodeConfig>; savePath: string }): Promise<any> {
    const nodeConfigsMap = new Map<string, NodeConfig>();
    if (args.nodeConfigs) {
      for (const [id, config] of Object.entries(args.nodeConfigs)) {
        nodeConfigsMap.set(id, config);
      }
    }

    const result = await WorkflowLoader.saveToDirectory(args.savePath, args.workflow, nodeConfigsMap);
    return { success: result.success, error: result.error };
  }

  private async handleWorkflowRun(args: { path: string; input?: any }): Promise<any> {
    // 尝试从缓存获取，否则加载
    let cached = this.loadedWorkflows.get(args.path);
    if (!cached) {
      const result = await WorkflowLoader.loadFromDirectory(args.path);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      cached = { workflow: result.workflow!, nodeConfigs: result.nodeConfigs! };
    }

    const executionResult = await this.engine.execute(cached.workflow, cached.nodeConfigs, args.input);
    return { success: true, result: executionResult };
  }

  private handleWorkflowValidate(args: { workflow: Workflow }): any {
    const issues: string[] = [];

    // 检查基本字段
    if (!args.workflow.id) issues.push('Missing workflow id');
    if (!args.workflow.name) issues.push('Missing workflow name');
    if (!args.workflow.version) issues.push('Missing workflow version');

    // 检查节点
    if (!args.workflow.nodes?.length) {
      issues.push('Workflow has no nodes');
    } else {
      const nodeIds = new Set<string>();
      for (const node of args.workflow.nodes) {
        if (!node.id) issues.push(`Node missing id: ${JSON.stringify(node)}`);
        if (nodeIds.has(node.id)) issues.push(`Duplicate node id: ${node.id}`);
        nodeIds.add(node.id);
      }

      // 检查边引用
      for (const edge of args.workflow.edges || []) {
        if (!nodeIds.has(edge.source.nodeId)) {
          issues.push(`Edge references non-existent source node: ${edge.source.nodeId}`);
        }
        if (!nodeIds.has(edge.target.nodeId)) {
          issues.push(`Edge references non-existent target node: ${edge.target.nodeId}`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  private handleNodeAdd(args: { workflow: Workflow; node: any }): any {
    const workflow = { ...args.workflow };
    workflow.nodes = [...(workflow.nodes || []), args.node];
    workflow.metadata = { ...workflow.metadata, updatedAt: new Date().toISOString() };
    return { success: true, workflow };
  }

  private handleNodeRemove(args: { workflow: Workflow; nodeId: string }): any {
    const workflow = { ...args.workflow };
    workflow.nodes = (workflow.nodes || []).filter(n => n.id !== args.nodeId);
    workflow.edges = (workflow.edges || []).filter(
      e => e.source.nodeId !== args.nodeId && e.target.nodeId !== args.nodeId
    );
    workflow.metadata = { ...workflow.metadata, updatedAt: new Date().toISOString() };
    return { success: true, workflow };
  }

  private handleEdgeAdd(args: { workflow: Workflow; edge: any }): any {
    const workflow = { ...args.workflow };
    workflow.edges = [...(workflow.edges || []), args.edge];
    workflow.metadata = { ...workflow.metadata, updatedAt: new Date().toISOString() };
    return { success: true, workflow };
  }

  private handleEdgeRemove(args: { workflow: Workflow; edgeId: string }): any {
    const workflow = { ...args.workflow };
    workflow.edges = (workflow.edges || []).filter(e => e.id !== args.edgeId);
    workflow.metadata = { ...workflow.metadata, updatedAt: new Date().toISOString() };
    return { success: true, workflow };
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

  // ============ 启动服务器 ============

  async runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Workflow MCP Server running on stdio');
  }

  async runHttp(host: string, port: number): Promise<void> {
    let sseTransport: SSEServerTransport | undefined;

    const setCorsHeaders = (res: http.ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id');
      res.setHeader('Access-Control-Max-Age', '86400');
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
        res.end(JSON.stringify({ ok: true, transport: 'sse' }));
        return;
      }

      if (req.method === 'GET' && (reqUrl.pathname === '/sse' || reqUrl.pathname === '/mcp')) {
        if (sseTransport) {
          res.writeHead(409, { 'content-type': 'text/plain' });
          res.end('SSE session already established');
          return;
        }

        sseTransport = new SSEServerTransport('/mcp', res);
        sseTransport.onclose = () => { sseTransport = undefined; };
        try {
          await this.server.connect(sseTransport);
        } catch (error) {
          console.error('Failed to connect SSE transport:', error);
          sseTransport = undefined;
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end('Failed to establish SSE transport');
          }
        }
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

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => resolve());
    });

    console.error(`Workflow MCP Server running at http://${host}:${port} (GET /mcp|/sse, POST /mcp|/message, GET /health, CORS enabled)`);
  }
}

// ============ CLI 入口 ============

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

  if (port > 0) {
    await server.runHttp(host, port);
  } else {
    await server.runStdio();
  }
}

export default WorkflowMCPServer;
