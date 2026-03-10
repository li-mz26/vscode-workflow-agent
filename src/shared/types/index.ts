// ============================================
// 共享类型定义
// ============================================

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

// 端口定义
export interface Port {
    id: string;
    name: string;
    type: 'data' | 'control';
    dataType: string;
    required: boolean;
    description?: string;
}

// 节点配置文件格式 - 不同类型节点的配置
export interface CodeNodeConfig {
    /** Python 代码 */
    code?: string;
    /** 执行超时时间（秒） */
    timeout?: number;
    /** 环境变量 */
    environment?: Record<string, string>;
    /** 描述 */
    description?: string;
}

export interface LLMNodeConfig {
    /** 模型名称 */
    model: string;
    /** 系统提示词 */
    systemPrompt?: string;
    /** 用户提示词模板 */
    userPrompt?: string;
    /** 温度参数 */
    temperature?: number;
    /** 最大 token 数 */
    maxTokens?: number;
    /** 变量映射 */
    variables?: Array<{
        name: string;
        source: string;
        required?: boolean;
    }>;
    /** 描述 */
    description?: string;
}

export interface SwitchCondition {
    /** 分支名称 */
    name: string;
    /** 条件表达式 */
    expression: string;
    /** 目标节点 ID */
    target?: string;
}

export interface SwitchNodeConfig {
    /** 条件列表 */
    conditions: SwitchCondition[];
    /** 默认分支目标 */
    defaultTarget: string;
    /** 描述 */
    description?: string;
}

export interface HTTPNodeConfig {
    /** HTTP 方法 */
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** 请求 URL */
    url: string;
    /** 请求头 */
    headers?: Record<string, string>;
    /** 请求体 */
    body?: any;
    /** 超时时间（毫秒） */
    timeout?: number;
    /** 重试次数 */
    retryCount?: number;
    /** 描述 */
    description?: string;
}

export interface WebhookNodeConfig {
    /** Webhook 提供商 */
    provider: 'slack' | 'dingtalk' | 'discord' | 'pagerduty' | 'generic';
    /** Webhook URL */
    webhookUrl: string;
    /** 消息标题 */
    title?: string;
    /** 消息内容 */
    message?: string;
    /** 严重级别 */
    severity?: 'info' | 'warning' | 'error' | 'critical';
    /** 描述 */
    description?: string;
}

export interface StartNodeConfig {
    /** 触发类型 */
    triggerType: 'manual' | 'api' | 'schedule';
    /** 描述 */
    description?: string;
}

export interface EndNodeConfig {
    /** 输出映射 */
    outputMapping?: Record<string, string>;
    /** 描述 */
    description?: string;
}

export type NodeConfigData =
    | CodeNodeConfig
    | LLMNodeConfig
    | SwitchNodeConfig
    | HTTPNodeConfig
    | WebhookNodeConfig
    | StartNodeConfig
    | EndNodeConfig
    | Record<string, any>;

// 节点配置
export interface NodeConfig {
    /** 节点唯一 ID */
    id: string;
    /** 节点类型 */
    type: string;
    /** 画布位置 */
    position: Position;
    /** 节点大小 */
    size?: Size;
    /** 内联数据（简化模式或临时存储） */
    data?: Record<string, any>;
    /** 输入端口 */
    inputs: Port[];
    /** 输出端口 */
    outputs: Port[];
    /** 元数据 */
    metadata?: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
    };
    /** 外部配置文件引用（相对于工作流文件的路径） */
    configRef?: string;
}

// 节点配置文件扩展名映射
export const NODE_CONFIG_EXTENSIONS: Record<string, string> = {
    code: '.py',
    llm: '.json',
    switch: '.json',
    http: '.json',
    webhook: '.json',
    start: '.json',
    end: '.json',
    parallel: '.json',
    merge: '.json',
    schedule: '.json'
};

// 边（连接）定义
export interface Edge {
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
    condition?: string;
}

// 变量定义
export interface Variable {
    name: string;
    type: string;
    defaultValue?: any;
    description?: string;
}

// 工作流定义
export interface Workflow {
    id: string;
    name: string;
    description?: string;
    version: string;
    nodes: NodeConfig[];
    edges: Edge[];
    variables: Variable[];
    settings: WorkflowSettings;
    createdAt: string;
    updatedAt: string;
    filePath?: string;
}

// 工作流设置
export interface WorkflowSettings {
    timeout: number;
    retryPolicy?: RetryPolicy;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    schedule?: {
        cron: string;
        timezone: string;
        enabled: boolean;
    };
}

export interface RetryPolicy {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
}

// 节点类型定义
export interface NodeTypeDefinition {
    type: string;
    category: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    inputs: Port[];
    outputs: Port[];
    configSchema: JSONSchema;
    defaultData: Record<string, any>;
    executor: string;
}

// JSON Schema 类型
export interface JSONSchema {
    type: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    enum?: any[];
    description?: string;
    default?: any;
    minimum?: number;
    maximum?: number;
    items?: JSONSchema;
}

// 创建工作流 DTO
export interface CreateWorkflowDTO {
    name: string;
    description?: string;
    nodes?: NodeConfig[];
    edges?: Edge[];
    variables?: Variable[];
    settings?: Partial<WorkflowSettings>;
    folderPath?: string;
}

// 执行状态
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

// 日志条目
export interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    nodeId?: string;
    message: string;
    data?: any;
}

// 执行结果
export interface ExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs: LogEntry[];
    duration: number;
}

// 执行上下文
export interface ExecutionContext {
    variables: Map<string, any>;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
    metadata: {
        startTime: Date;
        endTime?: Date;
        executionId: string;
    };
}

// 节点执行结果
export interface NodeExecutionResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: Error;
    logs?: string[];
}

// 验证结果
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
}

// 工作流摘要
export interface WorkflowSummary {
    id: string;
    name: string;
    description?: string;
    nodeCount: number;
    updatedAt: string;
    filePath: string;
}

// 工作流变更事件
export interface WorkflowChangeEvent {
    type: 'created' | 'updated' | 'deleted';
    workflowId: string;
    workflow?: Workflow;
}
