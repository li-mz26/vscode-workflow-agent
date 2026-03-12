# VSCode Workflow Agent - 重构说明

## 📁 新架构目录结构

```
src-refactored/
├── domain/                    # 领域层 - 实体和值对象
│   ├── Workflow.ts           # 工作流、节点、边定义
│   └── Execution.ts          # 执行上下文、结果定义
│
├── repository/               # 存储层 - 数据持久化抽象
│   ├── IWorkflowRepository.ts    # 存储接口
│   └── MemoryWorkflowRepository.ts   # 内存实现
│
├── service/                  # 服务层 - 业务逻辑
│   ├── EventBus.ts          # 事件总线
│   ├── WorkflowService.ts   # 工作流管理服务
│   └── ExecutionService.ts  # 执行引擎服务
│
├── executor/                 # 执行器层 - 节点执行
│   ├── INodeExecutor.ts     # 执行器接口
│   ├── ExecutorFactory.ts   # 执行器工厂
│   └── executors/           # 具体执行器实现
│       ├── StartNodeExecutor.ts
│       ├── EndNodeExecutor.ts
│       ├── CodeNodeExecutor.ts
│       ├── LLMNodeExecutor.ts
│       ├── SwitchNodeExecutor.ts
│       ├── ParallelNodeExecutor.ts
│       ├── MergeNodeExecutor.ts
│       ├── HTTPNodeExecutor.ts
│       ├── WebhookNodeExecutor.ts
│       └── ScheduleNodeExecutor.ts
│
├── adapter/                  # 适配器层 - 外部集成
│   └── mcp/
│       ├── MCPServerAdapter.ts   # MCP 服务器适配器
│       └── NodeTypeRegistry.ts   # 节点类型注册表
│
├── container/               # 依赖注入
│   └── DIContainer.ts       # IoC 容器
│
└── index.ts                 # 入口文件
```

## 🏗️ 架构分层

### 1. Domain 层（领域层）
- **职责**: 定义核心业务实体和值对象
- **包含**: Workflow, Node, Edge, ExecutionContext 等
- **原则**: 不包含任何业务逻辑，纯数据结构

### 2. Repository 层（存储层）
- **职责**: 数据持久化抽象
- **接口**: `IWorkflowRepository`
- **实现**: `MemoryWorkflowRepository`（可替换为 File/DB）
- **原则**: 依赖接口，不依赖具体实现

### 3. Service 层（服务层）
- **职责**: 业务逻辑编排
- **组件**:
  - `WorkflowService`: 工作流 CRUD + 验证
  - `ExecutionService`: 工作流执行引擎
  - `EventBus`: 事件总线，解耦模块通信

### 4. Executor 层（执行器层）
- **职责**: 节点执行逻辑
- **接口**: `INodeExecutor`
- **工厂**: `ExecutorFactory` - 创建执行器实例
- **实现**: 每种节点类型一个执行器类

### 5. Adapter 层（适配器层）
- **职责**: 与外部系统交互
- **组件**:
  - `MCPServerAdapter`: MCP 协议实现
  - `NodeTypeRegistry`: 节点类型管理

### 6. Container 层（容器层）
- **职责**: 依赖注入和生命周期管理
- **实现**: `DIContainer` - 单例模式

## 🎯 重构改进点

### 1. 单一职责原则 (SRP)
| 原设计 | 新设计 |
|--------|--------|
| WorkflowManager 混合了存储和业务逻辑 | WorkflowService + IWorkflowRepository |
| ExecutionEngine 耦合了执行和节点逻辑 | ExecutionService + INodeExecutor |
| MCPServerManager 直接操作工作流 | MCPServerAdapter 依赖 WorkflowService |

### 2. 依赖倒置原则 (DIP)
```typescript
// 重构前 - 依赖具体实现
class WorkflowManager { }

// 重构后 - 依赖接口
class WorkflowService {
    constructor(private repository: IWorkflowRepository) {}
}
```

### 3. 接口隔离原则 (ISP)
- `IWorkflowService`: 工作流管理接口
- `IExecutionService`: 执行引擎接口
- `INodeExecutor`: 节点执行器接口
- `IWorkflowRepository`: 存储接口

### 4. 开闭原则 (OCP)
- 新增节点类型: 只需实现 `INodeExecutor` 并注册到 `ExecutorFactory`
- 新增存储方式: 只需实现 `IWorkflowRepository`
- 无需修改现有代码

### 5. 事件驱动解耦
```typescript
// 发布事件
this.eventBus.emit(WorkflowEvents.CREATED, { workflow });

// 订阅事件
this.eventBus.on(WorkflowEvents.CREATED, ({ workflow }) => {
    // 处理工作流创建
});
```

## 📊 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                           │
│                      (index.ts)                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      DIContainer                             │
│              (依赖注入、生命周期管理)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Service    │ │   Adapter    │ │  Repository  │
│    Layer     │ │    Layer     │ │    Layer     │
├──────────────┤ ├──────────────┤ ├──────────────┤
│WorkflowService│ │MCPServer     │ │IWorkflow     │
│ExecutionService│ │   Adapter   │ │  Repository  │
│   EventBus   │ │NodeType      │ │MemoryWorkflow│
│              │ │  Registry    │ │  Repository  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Executor   │ │              │ │              │
│    Layer     │ │              │ │              │
├──────────────┤ │              │ │              │
│INodeExecutor │ │              │ │              │
│ExecutorFactory│ │              │ │              │
│  executors/  │ │              │ │              │
└──────┬───────┘ │              │ │              │
       │         │              │ │              │
       ▼         │              │ │              │
┌──────────────┐ │              │ │              │
│    Domain    │ │              │ │              │
│    Layer     │ │              │ │              │
├──────────────┤ │              │ │              │
│   Workflow   │ │              │ │              │
│     Node     │ │              │ │              │
│     Edge     │ │              │ │              │
│  Execution   │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

## 🚀 使用方式

### 启动 MCP Server
```bash
node src-refactored/index.ts
```

### 使用容器获取服务
```typescript
const { container } = require('./container/DIContainer');
container.initialize();

const workflowService = container.getWorkflowService();
const executionService = container.getExecutionService();
```

### 创建工作流
```typescript
const workflow = await workflowService.createWorkflow({
    name: 'my-workflow',
    description: 'Test workflow'
});
```

### 执行工作流
```typescript
const result = await executionService.start(workflow, { input: 'data' });
```

## 📝 扩展指南

### 添加新节点类型

1. 创建执行器:
```typescript
// executor/executors/MyNodeExecutor.ts
export class MyNodeExecutor implements INodeExecutor {
    readonly type = 'myNode';
    
    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        // 实现逻辑
    }
    
    validate(config: Record<string, any>) {
        return { valid: true };
    }
}
```

2. 注册到工厂:
```typescript
// ExecutorFactory.ts
this.register('myNode', MyNodeExecutor);
```

3. 添加到节点类型注册表:
```typescript
// NodeTypeRegistry.ts
this.register({
    type: 'myNode',
    name: 'My Node',
    // ...
});
```

### 添加新存储方式

1. 实现接口:
```typescript
export class FileWorkflowRepository implements IWorkflowRepository {
    async create(dto: CreateWorkflowDTO): Promise<Workflow> { }
    async findById(id: string): Promise<Workflow | null> { }
    // ...
}
```

2. 替换容器中的实现:
```typescript
container.register('workflowRepository', new FileWorkflowRepository());
```

## ✅ 重构收益

1. **可测试性**: 接口隔离，易于 Mock
2. **可扩展性**: 新增功能无需修改现有代码
3. **可维护性**: 职责清晰，代码结构清晰
4. **灵活性**: 存储方式、执行器可替换
5. **解耦**: 事件驱动，模块间无直接依赖
