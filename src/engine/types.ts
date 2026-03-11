/**
 * 工作流引擎类型定义
 * 
 * 工作流是一个有向无环图（DAG），主要元素是node和edge
 * 每个node的输入输出都是单一json体，edge将两个node的输出与输入连接起来
 */

/** 节点类型 */
export type NodeType = 
  | 'start'      // 开始节点
  | 'end'        // 结束节点
  | 'switch'     // 条件分支
  | 'parallel'   // 并行执行
  | 'code'       // 代码执行
  | 'llm';       // LLM调用

/** 节点位置 */
export interface Position {
  x: number;
  y: number;
}

/** 节点端口 */
export interface Port {
  id: string;
  name: string;
  type: 'input' | 'output';
  schema?: JSONSchema;
}

/** JSON Schema 简化定义 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
}

/** 节点定义 */
export interface Node {
  id: string;
  type: NodeType;
  position: Position;
  configRef: string;  // 配置文件引用路径，如 "nodes/node1_code.py"
  inputs: Record<string, string>;  // 输入schema: { fieldName: type }
  outputs: Record<string, string>; // 输出schema: { fieldName: type }
  metadata: {
    name: string;
    description: string;
  };
  data: Record<string, unknown>;  // 节点特定数据
}

/** 边的连接点 */
export interface Connection {
  nodeId: string;
  portId: string;
}

/** 边定义 */
export interface Edge {
  id: string;
  source: Connection;
  target: Connection;
  condition?: string;  // 条件表达式（用于switch节点）
}

/** 工作流定义 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    author?: string;
    tags?: string[];
  };
}

/** 工作流文件夹结构 */
export interface WorkflowFolder {
  workflowJson: Workflow;
  nodeConfigs: Map<string, NodeConfig>;
}

/** 节点配置类型 */
export type NodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | SwitchNodeConfig
  | ParallelNodeConfig
  | CodeNodeConfig
  | LLMNodeConfig;

/** 开始节点配置 */
export interface StartNodeConfig {
  triggerType: 'manual' | 'api' | 'scheduled' | 'webhook';
  schedule?: string;        // cron表达式（定时触发）
  webhookPath?: string;     // webhook路径
  inputSchema: JSONSchema;  // 输入参数schema
}

/** 结束节点配置 */
export interface EndNodeConfig {
  outputMapping: Record<string, string>;  // 输出字段映射
}

/** Switch分支 */
export interface Branch {
  id: string;
  name: string;
  condition: string;  // 条件表达式
}

/** Switch节点配置 */
export interface SwitchNodeConfig {
  branches: Branch[];
  defaultBranch?: string;
}

/** 并行节点配置 */
export interface ParallelNodeConfig {
  branches: string[];  // 并行分支的节点ID列表
  aggregation: 'merge' | 'first' | 'all';  // 结果聚合方式
}

/** 代码节点配置 */
export interface CodeNodeConfig {
  language: 'python' | 'javascript' | 'typescript';
  code: string;         // 代码内容或文件路径
  entryFunction?: string;  // 入口函数名
  timeout?: number;     // 超时时间（秒）
  environment?: Record<string, string>;  // 环境变量
}

/** LLM节点配置 */
export interface LLMNodeConfig {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
  topP?: number;
  tools?: string[];     // 可用工具列表
  responseFormat?: 'text' | 'json';  // 响应格式
}

/** 执行上下文 */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  variables: Map<string, unknown>;
  nodeOutputs: Map<string, unknown>;
  startTime: Date;
  metadata: Record<string, unknown>;
}

/** 节点执行结果 */
export interface NodeExecutionResult {
  success: boolean;
  output?: unknown;
  error?: Error;
  executionTime: number;
  logs?: string[];
}

/** 工作流执行结果 */
export interface WorkflowExecutionResult {
  success: boolean;
  executionId: string;
  output?: unknown;
  error?: Error;
  nodeResults: Map<string, NodeExecutionResult>;
  startTime: Date;
  endTime: Date;
}

/** 执行状态 */
export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/** WebView 消息类型 */
export interface WebViewMessage {
  type: string;
  payload?: unknown;
}

/** 工作流变更事件 */
export interface WorkflowChangeEvent {
  type: 'nodeAdded' | 'nodeRemoved' | 'nodeUpdated' | 'edgeAdded' | 'edgeRemoved' | 'edgeUpdated';
  nodeId?: string;
  edgeId?: string;
  data?: unknown;
}
