# VSCode Workflow Agent - 架构设计文档

## 1. 整体架构

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VSCode Extension Host                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Webview    │  │   Extension  │  │  MCP Server  │  │   Execution  │ │
│  │   Frontend   │◄─┤   Backend    │◄─┤   (stdio)    │◄─┤    Engine    │ │
│  │  (React/Vue) │  │  (TypeScript)│  │              │  │   (Python)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │         │
│         └─────────────────┴─────────────────┴─────────────────┘         │
│                              VSCode API                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         File System / Storage                            │
│                    (.workflow.json files / VSCode State)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 模块职责

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| Webview Frontend | 可视化编辑器 UI | React + TypeScript |
| Extension Backend | VSCode 集成、状态管理 | TypeScript |
| MCP Server | 对外暴露工具接口 | TypeScript |
| Execution Engine | 工作流执行 | Python |

---

## 2. 目录结构

```
vscode-workflow-agent/
├── .vscode/                    # VSCode 调试配置
├── docs/                       # 文档
│   ├── PRD.md
│   ├── UI_DESIGN.md
│   └── ARCHITECTURE.md
├── src/
│   ├── extension.ts            # 扩展入口
│   ├── core/                   # 核心模块
│   │   ├── workflow/           # 工作流管理
│   │   ├── node/               # 节点系统
│   │   ├── execution/          # 执行引擎
│   │   └── mcp/                # MCP 服务
│   ├── webview/                # Webview 前端
│   │   ├── components/         # UI 组件
│   │   ├── canvas/             # 画布引擎
│   │   ├── stores/             # 状态管理
│   │   └── App.tsx
│   ├── shared/                 # 共享类型和工具
│   │   ├── types/              # TypeScript 类型
│   │   └── utils/              # 工具函数
│   └── python/                 # Python 执行引擎
│       ├── engine/
│       ├── nodes/
│       └── sandbox/
├── tests/
│   ├── unit/                   # 单元测试
│   ├── integration/            # 集成测试
│   └── e2e/                    # E2E 测试
├── media/                      # 静态资源
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

---

## 3. 核心类设计

### 3.1 工作流领域模型

```typescript
// ============================================
// 基础类型定义
// ============================================

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

// 端口定义
interface Port {
  id: string;
  name: string;
  type: 'data' | 'control';
  dataType: string;  // 'string', 'number', 'object', 'any', etc.
  required: boolean;
  description?: string;
}

// 节点配置
interface NodeConfig {
  id: string;
  type: string;
  position: Position;
  size?: Size;
  data: Record<string, any>;  // 节点特定配置
  inputs: Port[];
  outputs: Port[];
  metadata?: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
  };
}

// 边（连接）定义
interface Edge {
  id: string;
  source: {
    nodeId: string;
    portId: string;
  };
  target: {
    nodeId: string;
    portId: string;
  };
  type?: 'default' | 'conditional';
  condition?: string;  // 条件表达式（用于 Switch 分支）
}

// 工作流定义
interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  nodes: NodeConfig[];
  edges: Edge[];
  variables: Variable[];  // 全局变量定义
  settings: WorkflowSettings;
  createdAt: string;
  updatedAt: string;
}

// 变量定义
interface Variable {
  name: string;
  type: string;
  defaultValue?: any;
  description?: string;
}

// 工作流设置
interface WorkflowSettings {
  timeout: number;           // 默认超时（秒）
  retryPolicy?: RetryPolicy;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
}
```

### 3.2 核心类

```typescript
// ============================================
// WorkflowManager - 工作流管理器
// ============================================

class WorkflowManager {
  private workflows: Map<string, Workflow>;
  private storage: IWorkflowStorage;
  private eventEmitter: EventEmitter;

  constructor(storage: IWorkflowStorage);
  
  // CRUD 操作
  async createWorkflow(config: CreateWorkflowDTO): Promise<Workflow>;
  async getWorkflow(id: string): Promise<Workflow | null>;
  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;
  async deleteWorkflow(id: string): Promise<void>;
  async listWorkflows(): Promise<WorkflowSummary[]>;
  
  // 文件操作
  async loadFromFile(path: string): Promise<Workflow>;
  async saveToFile(workflow: Workflow, path: string): Promise<void>;
  
  // 验证
  validateWorkflow(workflow: Workflow): ValidationResult;
  
  // 事件
  onWorkflowChanged(callback: (event: WorkflowChangeEvent) => void): void;
}

// ============================================
// NodeRegistry - 节点注册表
// ============================================

class NodeRegistry {
  private nodeTypes: Map<string, NodeTypeDefinition>;
  
  // 注册节点类型
  register(type: string, definition: NodeTypeDefinition): void;
  unregister(type: string): void;
  
  // 查询
  getDefinition(type: string): NodeTypeDefinition | undefined;
  getAllDefinitions(): NodeTypeDefinition[];
  getDefinitionsByCategory(category: string): NodeTypeDefinition[];
  
  // 创建节点实例
  createNode(type: string, position: Position): NodeConfig;
}

interface NodeTypeDefinition {
  type: string;
  category: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  inputs: Port[];
  outputs: Port[];
  configSchema: JSONSchema;  // 配置表单 Schema
  defaultData: Record<string, any>;
  executor: string;  // 执行器标识
}

// ============================================
// CanvasEngine - 画布引擎
// ============================================

class CanvasEngine {
  private workflow: Workflow;
  private viewport: Viewport;
  private renderer: CanvasRenderer;
  private interactionManager: InteractionManager;
  private selectionManager: SelectionManager;
  private historyManager: HistoryManager;
  
  // 初始化
  constructor(container: HTMLElement, options: CanvasOptions);
  mount(): void;
  destroy(): void;
  
  // 视图控制
  setZoom(level: number): void;
  getZoom(): number;
  panTo(x: number, y: number): void;
  fitToView(): void;
  
  // 节点操作
  addNode(type: string, position: Position): NodeConfig;
  removeNode(nodeId: string): void;
  updateNode(nodeId: string, updates: Partial<NodeConfig>): void;
  moveNode(nodeId: string, position: Position): void;
  
  // 边操作
  addEdge(edge: Edge): void;
  removeEdge(edgeId: string): void;
  updateEdge(edgeId: string, updates: Partial<Edge>): void;
  
  // 选择
  selectNode(nodeId: string, multi?: boolean): void;
  selectNodes(nodeIds: string[]): void;
  deselectAll(): void;
  getSelectedNodes(): NodeConfig[];
  
  // 历史
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  
  // 序列化
  toWorkflow(): Workflow;
  fromWorkflow(workflow: Workflow): void;
  
  // 事件
  on(event: CanvasEvent, callback: Function): void;
  off(event: CanvasEvent, callback: Function): void;
}

type CanvasEvent = 
  | 'node:added' | 'node:removed' | 'node:updated' | 'node:moved'
  | 'edge:added' | 'edge:removed' | 'edge:updated'
  | 'selection:changed' | 'viewport:changed'
  | 'history:changed';

// ============================================
// ExecutionEngine - 执行引擎
// ============================================

class ExecutionEngine {
  private workflow: Workflow;
  private context: ExecutionContext;
  private nodeExecutors: Map<string, NodeExecutor>;
  private eventEmitter: EventEmitter;
  private state: ExecutionState;
  
  constructor(workflow: Workflow, options?: ExecutionOptions);
  
  // 执行控制
  async start(inputs?: Record<string, any>): Promise<ExecutionResult>;
  async pause(): Promise<void>;
  async resume(): Promise<void>;
  async stop(): Promise<void>;
  
  // 调试
  async stepOver(): Promise<void>;
  async stepInto(): Promise<void>;
  async stepOut(): Promise<void>;
  async continue(): Promise<void>;
  
  // 状态
  getState(): ExecutionState;
  getCurrentNode(): string | null;
  getVariables(): Record<string, any>;
  getLogs(): LogEntry[];
  
  // 断点
  setBreakpoint(nodeId: string): void;
  removeBreakpoint(nodeId: string): void;
  getBreakpoints(): string[];
  
  // 事件
  on(event: ExecutionEvent, callback: Function): void;
}

type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

type ExecutionEvent = 
  | 'started' | 'completed' | 'failed' | 'stopped'
  | 'node:started' | 'node:completed' | 'node:failed'
  | 'paused' | 'resumed' | 'breakpoint:hit';

interface ExecutionContext {
  variables: Map<string, any>;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  metadata: {
    startTime: Date;
    endTime?: Date;
    executionId: string;
  };
}

interface ExecutionResult {
  success: boolean;
  outputs?: Record<string, any>;
  error?: Error;
  logs: LogEntry[];
  duration: number;
}
```

### 3.3 节点执行器

```typescript
// ============================================
// NodeExecutor - 节点执行器抽象
// ============================================

abstract class NodeExecutor {
  abstract readonly type: string;
  
  // 执行节点
  abstract execute(
    node: NodeConfig, 
    context: ExecutionContext
  ): Promise<NodeExecutionResult>;
  
  // 验证配置
  abstract validate(config: Record<string, any>): ValidationResult;
  
  // 获取输入输出定义（动态）
  getInputs?(config: Record<string, any>): Port[];
  getOutputs?(config: Record<string, any>): Port[];
}

interface NodeExecutionResult {
  success: boolean;
  outputs?: Record<string, any>;
  error?: Error;
  logs?: string[];
}

// ============================================
// 具体执行器实现
// ============================================

class StartNodeExecutor extends NodeExecutor {
  type = 'start';
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    // Start 节点直接透传输入
    return {
      success: true,
      outputs: { trigger: context.inputs }
    };
  }
  
  validate(config: Record<string, any>): ValidationResult {
    return { valid: true };
  }
}

class CodeNodeExecutor extends NodeExecutor {
  type = 'code';
  private pythonSandbox: PythonSandbox;
  
  constructor(pythonSandbox: PythonSandbox) {
    super();
    this.pythonSandbox = pythonSandbox;
  }
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { code, timeout = 30 } = node.data;
    
    // 准备输入变量
    const inputs = this.resolveInputs(node, context);
    
    // 在沙箱中执行 Python 代码
    const result = await this.pythonSandbox.execute({
      code,
      variables: inputs,
      timeout: timeout * 1000
    });
    
    return {
      success: result.success,
      outputs: result.outputs,
      error: result.error,
      logs: result.logs
    };
  }
  
  validate(config: Record<string, any>): ValidationResult {
    if (!config.code || typeof config.code !== 'string') {
      return { valid: false, errors: ['Code is required'] };
    }
    return { valid: true };
  }
  
  private resolveInputs(node: NodeConfig, context: ExecutionContext): Record<string, any> {
    // 从上游节点获取输入值
    // ...
    return {};
  }
}

class LLMNodeExecutor extends NodeExecutor {
  type = 'llm';
  private llmProvider: LLMProvider;
  
  constructor(llmProvider: LLMProvider) {
    super();
    this.llmProvider = llmProvider;
  }
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { 
      model, 
      prompt, 
      systemPrompt, 
      temperature = 0.7, 
      maxTokens = 2000 
    } = node.data;
    
    // 渲染模板
    const renderedPrompt = this.renderTemplate(prompt, context);
    const renderedSystem = systemPrompt ? this.renderTemplate(systemPrompt, context) : undefined;
    
    // 调用 LLM
    const response = await this.llmProvider.complete({
      model,
      messages: [
        ...(renderedSystem ? [{ role: 'system', content: renderedSystem }] : []),
        { role: 'user', content: renderedPrompt }
      ],
      temperature,
      maxTokens
    });
    
    return {
      success: true,
      outputs: {
        content: response.content,
        usage: response.usage
      }
    };
  }
  
  private renderTemplate(template: string, context: ExecutionContext): string {
    // 使用模板引擎渲染
    // 支持 {{variable}} 语法
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return context.variables.get(name) ?? match;
    });
  }
  
  validate(config: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    if (!config.model) errors.push('Model is required');
    if (!config.prompt) errors.push('Prompt is required');
    return { valid: errors.length === 0, errors };
  }
}

class SwitchNodeExecutor extends NodeExecutor {
  type = 'switch';
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { conditions } = node.data;
    const input = this.getInputValue(node, context);
    
    // 按顺序评估条件
    for (const condition of conditions) {
      const result = this.evaluateCondition(condition.expression, input, context);
      if (result) {
        return {
          success: true,
          outputs: { branch: condition.target }
        };
      }
    }
    
    // 默认分支
    return {
      success: true,
      outputs: { branch: 'default' }
    };
  }
  
  private evaluateCondition(expression: string, input: any, context: ExecutionContext): boolean {
    // 使用安全的表达式求值
    // 支持简单的比较操作和逻辑运算
    try {
      const fn = new Function('input', 'ctx', `return ${expression}`);
      return fn(input, Object.fromEntries(context.variables));
    } catch (e) {
      return false;
    }
  }
  
  validate(config: Record<string, any>): ValidationResult {
    if (!Array.isArray(config.conditions)) {
      return { valid: false, errors: ['Conditions must be an array'] };
    }
    return { valid: true };
  }
}

class ParallelNodeExecutor extends NodeExecutor {
  type = 'parallel';
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    // Parallel 节点只是标记，实际并行由执行引擎调度
    return {
      success: true,
      outputs: { parallel: true }
    };
  }
  
  validate(): ValidationResult {
    return { valid: true };
  }
}

class MergeNodeExecutor extends NodeExecutor {
  type = 'merge';
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { strategy = 'all' } = node.data;  // 'all' | 'any'
    
    // 收集所有上游分支的结果
    const inputs = this.collectBranchInputs(node, context);
    
    return {
      success: true,
      outputs: {
        merged: inputs,
        strategy
      }
    };
  }
  
  private collectBranchInputs(node: NodeConfig, context: ExecutionContext): any[] {
    // 从所有输入端口收集数据
    // ...
    return [];
  }
  
  validate(): ValidationResult {
    return { valid: true };
  }
}

class EndNodeExecutor extends NodeExecutor {
  type = 'end';
  
  async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { outputMapping } = node.data;
    
    // 根据映射规则整理输出
    const outputs: Record<string, any> = {};
    for (const [key, path] of Object.entries(outputMapping || {})) {
      outputs[key] = this.resolvePath(path, context);
    }
    
    return {
      success: true,
      outputs
    };
  }
  
  private resolvePath(path: string, context: ExecutionContext): any {
    // 从上下文中解析路径
    // 支持 'nodeId.outputName' 格式
    // ...
    return null;
  }
  
  validate(): ValidationResult {
    return { valid: true };
  }
}
```

---

## 4. MCP 服务设计

```typescript
// ============================================
// MCP Server - Model Context Protocol 服务
// ============================================

class WorkflowMCPServer {
  private server: Server;
  private workflowManager: WorkflowManager;
  private executionEngine: ExecutionEngine | null;
  
  constructor(workflowManager: WorkflowManager) {
    this.workflowManager = workflowManager;
    this.server = new Server({
      name: 'vscode-workflow-agent',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });
    
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }
  
  private registerTools(): void {
    // 工作流管理工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_workflows',
          description: 'List all available workflows',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_workflow',
          description: 'Get workflow details by ID',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Workflow ID' }
            },
            required: ['id']
          }
        },
        {
          name: 'create_workflow',
          description: 'Create a new workflow',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              nodes: { type: 'array' },
              edges: { type: 'array' }
            },
            required: ['name']
          }
        },
        {
          name: 'update_workflow',
          description: 'Update an existing workflow',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['id', 'updates']
          }
        },
        {
          name: 'delete_workflow',
          description: 'Delete a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            },
            required: ['id']
          }
        },
        {
          name: 'add_node',
          description: 'Add a node to a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              type: { type: 'string' },
              position: { type: 'object' },
              data: { type: 'object' }
            },
            required: ['workflowId', 'type', 'position']
          }
        },
        {
          name: 'update_node',
          description: 'Update a node in a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              nodeId: { type: 'string' },
              updates: { type: 'object' }
            },
            required: ['workflowId', 'nodeId', 'updates']
          }
        },
        {
          name: 'delete_node',
          description: 'Delete a node from a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              nodeId: { type: 'string' }
            },
            required: ['workflowId', 'nodeId']
          }
        },
        {
          name: 'connect_nodes',
          description: 'Connect two nodes in a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              sourceNodeId: { type: 'string' },
              sourcePortId: { type: 'string' },
              targetNodeId: { type: 'string' },
              targetPortId: { type: 'string' }
            },
            required: ['workflowId', 'sourceNodeId', 'targetNodeId']
          }
        },
        {
          name: 'execute_workflow',
          description: 'Execute a workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              inputs: { type: 'object' }
            },
            required: ['workflowId']
          }
        },
        {
          name: 'get_execution_status',
          description: 'Get workflow execution status',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' }
            },
            required: ['executionId']
          }
        },
        {
          name: 'list_node_types',
          description: 'List all available node types',
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    }));
    
    // 工具调用处理
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'list_workflows':
          return this.handleListWorkflows();
        case 'get_workflow':
          return this.handleGetWorkflow(args);
        case 'create_workflow':
          return this.handleCreateWorkflow(args);
        case 'update_workflow':
          return this.handleUpdateWorkflow(args);
        case 'delete_workflow':
          return this.handleDeleteWorkflow(args);
        case 'add_node':
          return this.handleAddNode(args);
        case 'update_node':
          return this.handleUpdateNode(args);
        case 'delete_node':
          return this.handleDeleteNode(args);
        case 'connect_nodes':
          return this.handleConnectNodes(args);
        case 'execute_workflow':
          return this.handleExecuteWorkflow(args);
        case 'get_execution_status':
          return this.handleGetExecutionStatus(args);
        case 'list_node_types':
          return this.handleListNodeTypes();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }
  
  private registerResources(): void {
    // 注册资源处理器
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'workflow://list',
          name: 'Workflow List',
          mimeType: 'application/json'
        }
      ]
    }));
    
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      if (uri.startsWith('workflow://')) {
        const workflowId = uri.replace('workflow://', '');
        const workflow = await this.workflowManager.getWorkflow(workflowId);
        if (!workflow) {
          throw new Error(`Workflow not found: ${workflowId}`);
        }
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(workflow, null, 2)
          }]
        };
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });
  }
  
  private registerPrompts(): void {
    // 注册提示模板
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'workflow_assistant',
          description: 'Assistant for creating and managing workflows'
        },
        {
          name: 'workflow_debugger',
          description: 'Debugger for troubleshooting workflow execution'
        }
      ]
    }));
    
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const name = request.params.name;
      
      if (name === 'workflow_assistant') {
        return {
          messages: [
            {
              role: 'system',
              content: {
                type: 'text',
                text: `You are a workflow automation assistant. You can help users create, edit, and execute workflows using the available tools. 
                
Available node types:
- start: Entry point of the workflow
- end: Exit point of the workflow  
- code: Execute Python code
- llm: Call language models
- switch: Conditional branching
- parallel: Execute branches in parallel
- merge: Merge parallel branches

When creating workflows:
1. Always include a start and end node
2. Connect nodes logically
3. Configure each node with appropriate settings
4. Test the workflow before finalizing`
              }
            }
          ]
        };
      }
      
      throw new Error(`Unknown prompt: ${name}`);
    });
  }
  
  // 工具处理实现
  private async handleListWorkflows() {
    const workflows = await this.workflowManager.listWorkflows();
    return {
      content: [{ type: 'text', text: JSON.stringify(workflows, null, 2) }]
    };
  }
  
  private async handleGetWorkflow(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.id}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }]
    };
  }
  
  private async handleCreateWorkflow(args: any) {
    const workflow = await this.workflowManager.createWorkflow(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }]
    };
  }
  
  private async handleUpdateWorkflow(args: any) {
    const workflow = await this.workflowManager.updateWorkflow(args.id, args.updates);
    return {
      content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }]
    };
  }
  
  private async handleDeleteWorkflow(args: any) {
    await this.workflowManager.deleteWorkflow(args.id);
    return {
      content: [{ type: 'text', text: `Workflow ${args.id} deleted successfully` }]
    };
  }
  
  private async handleAddNode(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    const node = {
      id: `node_${Date.now()}`,
      type: args.type,
      position: args.position,
      data: args.data || {},
      inputs: [],
      outputs: []
    };
    
    workflow.nodes.push(node);
    await this.workflowManager.updateWorkflow(args.workflowId, { nodes: workflow.nodes });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(node, null, 2) }]
    };
  }
  
  private async handleUpdateNode(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    const nodeIndex = workflow.nodes.findIndex(n => n.id === args.nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Node not found: ${args.nodeId}`);
    }
    
    workflow.nodes[nodeIndex] = { ...workflow.nodes[nodeIndex], ...args.updates };
    await this.workflowManager.updateWorkflow(args.workflowId, { nodes: workflow.nodes });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(workflow.nodes[nodeIndex], null, 2) }]
    };
  }
  
  private async handleDeleteNode(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    workflow.nodes = workflow.nodes.filter(n => n.id !== args.nodeId);
    workflow.edges = workflow.edges.filter(
      e => e.source.nodeId !== args.nodeId && e.target.nodeId !== args.nodeId
    );
    
    await this.workflowManager.updateWorkflow(args.workflowId, { 
      nodes: workflow.nodes, 
      edges: workflow.edges 
    });
    
    return {
      content: [{ type: 'text', text: `Node ${args.nodeId} deleted successfully` }]
    };
  }
  
  private async handleConnectNodes(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    const edge: Edge = {
      id: `edge_${Date.now()}`,
      source: {
        nodeId: args.sourceNodeId,
        portId: args.sourcePortId || 'output'
      },
      target: {
        nodeId: args.targetNodeId,
        portId: args.targetPortId || 'input'
      }
    };
    
    workflow.edges.push(edge);
    await this.workflowManager.updateWorkflow(args.workflowId, { edges: workflow.edges });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(edge, null, 2) }]
    };
  }
  
  private async handleExecuteWorkflow(args: any) {
    const workflow = await this.workflowManager.getWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    const engine = new ExecutionEngine(workflow);
    const result = await engine.start(args.inputs);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
  
  private async handleGetExecutionStatus(args: any) {
    // 实现执行状态查询
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'unknown' }) }]
    };
  }
  
  private async handleListNodeTypes() {
    const types = [
      { type: 'start', name: 'Start', description: 'Entry point' },
      { type: 'end', name: 'End', description: 'Exit point' },
      { type: 'code', name: 'Code', description: 'Execute Python code' },
      { type: 'llm', name: 'LLM', description: 'Call language model' },
      { type: 'switch', name: 'Switch', description: 'Conditional branching' },
      { type: 'parallel', name: 'Parallel', description: 'Parallel execution' },
      { type: 'merge', name: 'Merge', description: 'Merge branches' }
    ];
    
    return {
      content: [{ type: 'text', text: JSON.stringify(types, null, 2) }]
    };
  }
  
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('MCP Server started');
  }
  
  async stop(): Promise<void> {
    await this.server.close();
  }
}
```

---

## 5. 通信协议

### 5.1 Webview ↔ Extension 通信

```typescript
// ============================================
// 消息协议定义
// ============================================

// 消息类型
enum MessageType {
  // 工作流操作
  WORKFLOW_LOAD = 'workflow:load',
  WORKFLOW_SAVE = 'workflow:save',
  WORKFLOW_UPDATE = 'workflow:update',
  
  // 节点操作
  NODE_ADD = 'node:add',
  NODE_UPDATE = 'node:update',
  NODE_DELETE = 'node:delete',
  NODE_MOVE = 'node:move',
  
  // 边操作
  EDGE_ADD = 'edge:add',
  EDGE_DELETE = 'edge:delete',
  
  // 选择
  SELECTION_CHANGE = 'selection:change',
  
  // 执行
  EXECUTION_START = 'execution:start',
  EXECUTION_PAUSE = 'execution:pause',
  EXECUTION_STOP = 'execution:stop',
  EXECUTION_STEP = 'execution:step',
  EXECUTION_STATUS = 'execution:status',
  
  // 历史
  HISTORY_UNDO = 'history:undo',
  HISTORY_REDO = 'history:redo',
  
  // 配置
  CONFIG_GET = 'config:get',
  CONFIG_UPDATE = 'config:update',
  
  // 通知
  NOTIFY = 'notify',
  ERROR = 'error'
}

// 消息接口
interface Message {
  type: MessageType;
  payload?: any;
  id?: string;  // 用于请求-响应匹配
}

// ============================================
// MessageBridge - 消息桥接
// ============================================

class WebviewMessageBridge {
  private webview: Webview;
  private handlers: Map<MessageType, Function[]>;
  
  constructor(webview: Webview) {
    this.webview = webview;
    this.handlers = new Map();
    this.setupListener();
  }
  
  private setupListener(): void {
    this.webview.onDidReceiveMessage((message: Message) => {
      this.handleMessage(message);
    });
  }
  
  postMessage(message: Message): void {
    this.webview.postMessage(message);
  }
  
  on(type: MessageType, handler: Function): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }
  
  off(type: MessageType, handler: Function): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  private handleMessage(message: Message): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message.payload));
    }
  }
}
```

---

## 6. 状态管理

```typescript
// ============================================
// 使用 Zustand 进行状态管理
// ============================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface WorkflowState {
  // 当前工作流
  workflow: Workflow | null;
  isDirty: boolean;
  
  // 画布状态
  viewport: {
    zoom: number;
    position: Position;
  };
  
  // 选择状态
  selectedNodes: string[];
  selectedEdges: string[];
  
  // 执行状态
  execution: {
    state: ExecutionState;
    currentNode: string | null;
    logs: LogEntry[];
    variables: Record<string, any>;
  } | null;
  
  // 历史状态
  history: {
    canUndo: boolean;
    canRedo: boolean;
  };
  
  // Actions
  setWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (updates: Partial<Workflow>) => void;
  
  addNode: (node: NodeConfig) => void;
  updateNode: (nodeId: string, updates: Partial<NodeConfig>) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, position: Position) => void;
  
  addEdge: (edge: Edge) => void;
  deleteEdge: (edgeId: string) => void;
  
  selectNodes: (nodeIds: string[], multi?: boolean) => void;
  deselectAll: () => void;
  
  setViewport: (viewport: { zoom: number; position: Position }) => void;
  
  setExecution: (execution: WorkflowState['execution']) => void;
  updateExecution: (updates: Partial<NonNullable<WorkflowState['execution']>>) => void;
  
  setHistoryState: (state: { canUndo: boolean; canRedo: boolean }) => void;
  
  markDirty: () => void;
  markClean: () => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set) => ({
    workflow: null,
    isDirty: false,
    viewport: { zoom: 1, position: { x: 0, y: 0 } },
    selectedNodes: [],
    selectedEdges: [],
    execution: null,
    history: { canUndo: false, canRedo: false },
    
    setWorkflow: (workflow) => set({ workflow, isDirty: false }),
    
    updateWorkflow: (updates) =>
      set((state) => {
        if (state.workflow) {
          Object.assign(state.workflow, updates);
          state.isDirty = true;
        }
      }),
    
    addNode: (node) =>
      set((state) => {
        state.workflow?.nodes.push(node);
        state.isDirty = true;
      }),
    
    updateNode: (nodeId, updates) =>
      set((state) => {
        const node = state.workflow?.nodes.find((n) => n.id === nodeId);
        if (node) {
          Object.assign(node, updates);
          state.isDirty = true;
        }
      }),
    
    deleteNode: (nodeId) =>
      set((state) => {
        if (state.workflow) {
          state.workflow.nodes = state.workflow.nodes.filter((n) => n.id !== nodeId);
          state.workflow.edges = state.workflow.edges.filter(
            (e) => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
          );
          state.isDirty = true;
        }
      }),
    
    moveNode: (nodeId, position) =>
      set((state) => {
        const node = state.workflow?.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.position = position;
          state.isDirty = true;
        }
      }),
    
    addEdge: (edge) =>
      set((state) => {
        state.workflow?.edges.push(edge);
        state.isDirty = true;
      }),
    
    deleteEdge: (edgeId) =>
      set((state) => {
        if (state.workflow) {
          state.workflow.edges = state.workflow.edges.filter((e) => e.id !== edgeId);
          state.isDirty = true;
        }
      }),
    
    selectNodes: (nodeIds, multi = false) =>
      set((state) => {
        if (multi) {
          state.selectedNodes = [...new Set([...state.selectedNodes, ...nodeIds])];
        } else {
          state.selectedNodes = nodeIds;
        }
      }),
    
    deselectAll: () =>
      set((state) => {
        state.selectedNodes = [];
        state.selectedEdges = [];
      }),
    
    setViewport: (viewport) => set({ viewport }),
    
    setExecution: (execution) => set({ execution }),
    
    updateExecution: (updates) =>
      set((state) => {
        if (state.execution) {
          Object.assign(state.execution, updates);
        }
      }),
    
    setHistoryState: (historyState) =>
      set((state) => {
        state.history = historyState;
      }),
    
    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),
  }))
);
```

---

## 7. 扩展点设计

```typescript
// ============================================
// 扩展接口定义
// ============================================

// 自定义节点扩展
interface CustomNodeExtension {
  type: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  
  // 配置 Schema（用于生成表单）
  configSchema: JSONSchema;
  
  // 默认配置
  defaultConfig: Record<string, any>;
  
  // 端口定义
  inputs: Port[];
  outputs: Port[];
  
  // 执行器（可以是 JS 函数或 Python 代码）
  executor: {
    type: 'javascript' | 'python';
    code: string;
  };
}

// 主题扩展
interface ThemeExtension {
  name: string;
  colors: {
    canvas: {
      background: string;
      grid: string;
    };
    node: {
      background: string;
      border: string;
      text: string;
      selected: string;
    };
    edge: {
      default: string;
      selected: string;
    };
  };
}

// 插件 API
interface WorkflowPluginAPI {
  // 注册节点类型
  registerNodeType(definition: CustomNodeExtension): void;
  
  // 注册主题
  registerTheme(theme: ThemeExtension): void;
  
  // 添加菜单项
  addMenuItem(location: string, item: MenuItem): void;
  
  // 添加工具栏按钮
  addToolbarButton(button: ToolbarButton): void;
  
  // 监听事件
  on(event: string, callback: Function): void;
  
  // 获取当前工作流
  getCurrentWorkflow(): Workflow | null;
  
  // 执行命令
  executeCommand(command: string, args?: any): Promise<any>;
}
```

---

## 8. 关键技术选型

| 领域 | 技术 | 理由 |
|------|------|------|
| 前端框架 | React 18 | 组件化、生态丰富 |
| 状态管理 | Zustand + Immer | 轻量、TypeScript 友好 |
| 画布渲染 | SVG + CSS Transform | 性能好、可缩放 |
| 拖拽交互 | @dnd-kit | 现代化、可访问性好 |
| 代码编辑 | Monaco Editor | VSCode 同款 |
| Python 执行 | Pyodide / 子进程 | 浏览器沙箱或本地执行 |
| MCP SDK | @modelcontextprotocol/sdk | 官方 SDK |
| 测试 | Vitest + Testing Library | 快速、现代 |
