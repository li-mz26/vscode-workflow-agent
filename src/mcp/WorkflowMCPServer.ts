import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import * as vscode from 'vscode';
import { WorkflowEngine, WorkflowRunner } from '../engine';

/**
 * MCP Server
 * 将 Workflow Engine 的能力封装为 MCP 工具
 */
export class WorkflowMCPServer {
  private server: Server | null = null;
  private transport: StdioServerTransport | null = null;
  private isRunning = false;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private context: vscode.ExtensionContext,
    private engine: WorkflowEngine,
    private runner: WorkflowRunner
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Workflow MCP Server');
  }

  /**
   * 启动 MCP 服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      vscode.window.showWarningMessage('MCP server is already running');
      return;
    }

    try {
      this.server = new Server(
        {
          name: 'workflow-agent',
          version: '0.1.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // 注册工具列表处理器
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: this.getTools()
        };
      });

      // 注册工具调用处理器
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        return await this.handleToolCall(request.params.name, request.params.arguments);
      });

      // 创建传输层
      this.transport = new StdioServerTransport();
      
      // 连接服务器
      await this.server.connect(this.transport);
      
      this.isRunning = true;
      this.outputChannel.appendLine('MCP Server started successfully');
      vscode.window.showInformationMessage('Workflow MCP Server started');

    } catch (error) {
      this.outputChannel.appendLine(`Failed to start MCP Server: ${error}`);
      vscode.window.showErrorMessage(`Failed to start MCP Server: ${error}`);
      throw error;
    }
  }

  /**
   * 停止 MCP 服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.server) {
        await this.server.close();
        this.server = null;
      }
      
      this.transport = null;
      this.isRunning = false;
      
      this.outputChannel.appendLine('MCP Server stopped');
      vscode.window.showInformationMessage('Workflow MCP Server stopped');
    } catch (error) {
      this.outputChannel.appendLine(`Error stopping MCP Server: ${error}`);
      throw error;
    }
  }

  /**
   * 获取运行状态
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 定义可用的 MCP 工具
   */
  private getTools(): Tool[] {
    return [
      {
        name: 'list_workflows',
        description: 'List all available workflows in the workspace',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_workflow',
        description: 'Get the details of a specific workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'The ID of the workflow to retrieve'
            }
          },
          required: ['workflowId']
        }
      },
      {
        name: 'create_workflow',
        description: 'Create a new workflow',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the workflow'
            },
            description: {
              type: 'string',
              description: 'A description of what the workflow does'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'add_node',
        description: 'Add a node to a workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'The ID of the workflow'
            },
            type: {
              type: 'string',
              enum: ['start', 'end', 'code', 'llm', 'switch', 'parallel'],
              description: 'The type of node to add'
            },
            position: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              required: ['x', 'y']
            },
            config: {
              type: 'object',
              description: 'Node-specific configuration'
            }
          },
          required: ['workflowId', 'type', 'position']
        }
      },
      {
        name: 'connect_nodes',
        description: 'Connect two nodes with an edge',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'The ID of the workflow'
            },
            sourceNodeId: {
              type: 'string',
              description: 'The ID of the source node'
            },
            targetNodeId: {
              type: 'string',
              description: 'The ID of the target node'
            },
            condition: {
              type: 'string',
              description: 'Optional condition for switch branches'
            }
          },
          required: ['workflowId', 'sourceNodeId', 'targetNodeId']
        }
      },
      {
        name: 'execute_workflow',
        description: 'Execute a workflow with given inputs',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'The ID of the workflow to execute'
            },
            inputs: {
              type: 'object',
              description: 'Input parameters for the workflow'
            }
          },
          required: ['workflowId']
        }
      },
      {
        name: 'validate_workflow',
        description: 'Validate a workflow for errors',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'The ID of the workflow to validate'
            }
          },
          required: ['workflowId']
        }
      },
      {
        name: 'get_node_types',
        description: 'Get a list of available node types and their descriptions',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }

  /**
   * 处理工具调用
   */
  private async handleToolCall(
    name: string,
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    this.outputChannel.appendLine(`Tool called: ${name} with args: ${JSON.stringify(args)}`);

    try {
      switch (name) {
        case 'list_workflows':
          return await this.handleListWorkflows();

        case 'get_workflow':
          return await this.handleGetWorkflow(args);

        case 'create_workflow':
          return await this.handleCreateWorkflow(args);

        case 'add_node':
          return await this.handleAddNode(args);

        case 'connect_nodes':
          return await this.handleConnectNodes(args);

        case 'execute_workflow':
          return await this.handleExecuteWorkflow(args);

        case 'validate_workflow':
          return await this.handleValidateWorkflow(args);

        case 'get_node_types':
          return await this.handleGetNodeTypes();

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ]
      };
    }
  }

  /**
   * 处理列出工作流
   */
  private async handleListWorkflows(): Promise<{ content: TextContent[] }> {
    // 搜索工作区中的 .workflow.json 文件
    const workflowFiles = await vscode.workspace.findFiles('**/*.workflow.json');
    
    const workflows = workflowFiles.map(uri => ({
      id: path.basename(uri.fsPath, '.workflow.json'),
      path: uri.fsPath
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(workflows, null, 2)
        }
      ]
    };
  }

  /**
   * 处理获取工作流
   */
  private async handleGetWorkflow(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const workflowId = args?.workflowId as string;
    
    if (!workflowId) {
      throw new Error('workflowId is required');
    }

    const workflow = this.engine.getCurrentWorkflow();
    
    if (!workflow || workflow.id !== workflowId) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(workflow, null, 2)
        }
      ]
    };
  }

  /**
   * 处理创建工作流
   */
  private async handleCreateWorkflow(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const name = args?.name as string;
    const description = args?.description as string | undefined;
    
    if (!name) {
      throw new Error('name is required');
    }

    const workflow = this.engine.createWorkflow(name, description);

    return {
      content: [
        {
          type: 'text',
          text: `Workflow created successfully:\n${JSON.stringify(workflow, null, 2)}`
        }
      ]
    };
  }

  /**
   * 处理添加节点
   */
  private async handleAddNode(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const type = args?.type as string;
    const position = args?.position as { x: number; y: number };
    const config = args?.config as Record<string, unknown> | undefined;

    if (!type || !position) {
      throw new Error('type and position are required');
    }

    const node = this.engine.createNode(type as any, position);
    
    if (config) {
      Object.assign(node.data, config);
    }

    this.engine.addNode(node);

    return {
      content: [
        {
          type: 'text',
          text: `Node added successfully:\n${JSON.stringify(node, null, 2)}`
        }
      ]
    };
  }

  /**
   * 处理连接节点
   */
  private async handleConnectNodes(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const sourceNodeId = args?.sourceNodeId as string;
    const targetNodeId = args?.targetNodeId as string;
    const condition = args?.condition as string | undefined;

    if (!sourceNodeId || !targetNodeId) {
      throw new Error('sourceNodeId and targetNodeId are required');
    }

    const edge = {
      id: `edge_${Date.now()}`,
      source: { nodeId: sourceNodeId, portId: 'output' },
      target: { nodeId: targetNodeId, portId: 'input' },
      condition
    };

    this.engine.addEdge(edge);

    return {
      content: [
        {
          type: 'text',
          text: `Nodes connected successfully:\n${JSON.stringify(edge, null, 2)}`
        }
      ]
    };
  }

  /**
   * 处理执行工作流
   */
  private async handleExecuteWorkflow(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const workflowId = args?.workflowId as string;
    const inputs = (args?.inputs as Record<string, unknown>) || {};

    if (!workflowId) {
      throw new Error('workflowId is required');
    }

    const result = await this.runner.execute(undefined, inputs);

    return {
      content: [
        {
          type: 'text',
          text: `Workflow execution ${result.success ? 'succeeded' : 'failed'}:\n${JSON.stringify(result, null, 2)}`
        }
      ]
    };
  }

  /**
   * 处理验证工作流
   */
  private async handleValidateWorkflow(
    args: Record<string, unknown> | undefined
  ): Promise<{ content: TextContent[] }> {
    const workflow = this.engine.getCurrentWorkflow();
    
    if (!workflow) {
      throw new Error('No workflow loaded');
    }

    const errors = this.engine.validateWorkflow(workflow);

    if (errors.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Workflow is valid!'
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Workflow validation errors:\n${errors.join('\n')}`
        }
      ]
    };
  }

  /**
   * 处理获取节点类型
   */
  private async handleGetNodeTypes(): Promise<{ content: TextContent[] }> {
    const nodeTypes = [
      {
        type: 'start',
        name: 'Start',
        description: 'Entry point of the workflow. Defines how the workflow is triggered (manual, API, scheduled, webhook).'
      },
      {
        type: 'end',
        name: 'End',
        description: 'Exit point of the workflow. Defines the final output of the workflow.'
      },
      {
        type: 'code',
        name: 'Code',
        description: 'Executes custom code (JavaScript, TypeScript, or Python). Can be used for data transformation, API calls, etc.'
      },
      {
        type: 'llm',
        name: 'LLM',
        description: 'Calls a Large Language Model (like GPT-4) with a prompt. Can be used for text generation, analysis, etc.'
      },
      {
        type: 'switch',
        name: 'Switch',
        description: 'Conditional branching. Routes the workflow to different branches based on conditions.'
      },
      {
        type: 'parallel',
        name: 'Parallel',
        description: 'Executes multiple branches in parallel. Results can be merged or aggregated.'
      }
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(nodeTypes, null, 2)
        }
      ]
    };
  }
}

import * as path from 'path';
