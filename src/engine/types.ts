/**
 * 工作流核心类型定义
 */

// ============ 基础类型 ============

/** 端口定义 - 节点的输入/输出端口 */
export interface PortDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  required?: boolean;
  description?: string;
  defaultValue?: any;
}

/** 位置信息 - 用于可视化布局 */
export interface Position {
  x: number;
  y: number;
}

/** 节点元数据 */
export interface NodeMetadata {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

// ============ 节点类型定义 ============

/** 节点类型枚举 */
export type NodeType = 
  | 'start'      // 开始节点
  | 'end'        // 结束节点
  | 'code'       // 代码执行
  | 'llm'        // LLM 调用
  | 'switch'     // 条件分支
  | 'parallel';  // 并行执行

/** 开始节点触发方式 */
export type StartTriggerType = 'manual' | 'api' | 'schedule' | 'webhook';

/** 开始节点配置 */
export interface StartNodeConfig {
  triggerType: StartTriggerType;
  schedule?: {
    cron: string;
    timezone?: string;
  };
  webhook?: {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  };
  api?: {
    path: string;
    method: 'GET' | 'POST';
  };
}

/** 结束节点配置 */
export interface EndNodeConfig {
  outputMode: 'last' | 'merge' | 'select';
  selectedOutputs?: string[];
}

/** Switch 分支条件 */
export interface SwitchBranch {
  id: string;
  name: string;
  condition: string;  // 表达式，如 "data.score > 80"
  priority?: number;
}

/** Switch 节点配置 */
export interface SwitchNodeConfig {
  branches: SwitchBranch[];
  defaultBranch: string;
  evaluationMode: 'first-match' | 'all-match';
}

/** 并行分支配置 */
export interface ParallelBranch {
  id: string;
  name: string;
}

/** 并行节点配置 */
export interface ParallelNodeConfig {
  branches: ParallelBranch[];
  waitMode: 'all' | 'any' | 'n';
  waitCount?: number;
  failMode: 'continue' | 'stop';
}

/** 代码执行配置 */
export interface CodeNodeConfig {
  language: 'javascript' | 'python' | 'typescript';
  code: string;
  timeout?: number;
  env?: Record<string, string>;
}

/** LLM 模型配置 */
export interface LLMModelConfig {
  provider: 'openai' | 'anthropic' | 'azure' | 'custom';
  model: string;
  endpoint?: string;
  apiKey?: string;
}

/** LLM 节点配置 */
export interface LLMNodeConfig {
  model: LLMModelConfig;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

/** 节点配置联合类型 */
export type NodeConfig = 
  | StartNodeConfig 
  | EndNodeConfig 
  | CodeNodeConfig 
  | LLMNodeConfig 
  | SwitchNodeConfig 
  | ParallelNodeConfig;

// ============ 节点定义 ============

/** 输入输出定义 */
export interface IODefinition {
  [key: string]: string;  // 字段名 -> 类型 (如 "id": "int", "data": "object")
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: Position;
  configRef?: string;  // 指向 nodes/ 目录下的配置文件
  inputs?: IODefinition;
  outputs?: IODefinition;
  metadata: NodeMetadata;
  data?: Record<string, any>;  // 运行时数据
}

// ============ 边定义 ============

/** 端口引用 */
export interface PortRef {
  nodeId: string;
  portId: string;
}

/** 工作流边 */
export interface WorkflowEdge {
  id: string;
  source: PortRef;
  target: PortRef;
  label?: string;
  condition?: string;  // 条件表达式（用于 switch 分支）
}

// ============ 工作流定义 ============

/** 工作流元信息 */
export interface WorkflowMeta {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** 工作流定义 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: {
    author?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

/** 工作流文件结构 */
export interface WorkflowFile {
  workflow: Workflow;
  nodeConfigs: Map<string, NodeConfig>;
}

// ============ 执行相关 ============

/** 节点执行状态 */
export type NodeExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'success' 
  | 'failed' 
  | 'skipped';

/** 节点执行结果 */
export interface NodeExecutionResult {
  nodeId: string;
  status: NodeExecutionStatus;
  input?: any;
  output?: any;
  error?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

/** 工作流执行状态 */
export type WorkflowExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'success' 
  | 'failed' 
  | 'cancelled';

/** 工作流执行上下文 */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  variables: Record<string, any>;
  nodeResults: Map<string, NodeExecutionResult>;
  startTime: number;
  status: WorkflowExecutionStatus;
}

/** 工作流执行结果 */
export interface WorkflowExecutionResult {
  workflowId: string;
  executionId: string;
  status: WorkflowExecutionStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  nodeResults: NodeExecutionResult[];
  output?: any;
  error?: string;
}