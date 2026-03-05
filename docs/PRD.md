# VSCode Workflow Agent - 需求文档 (PRD)

## 1. 项目概述

### 1.1 项目背景
VSCode Workflow Agent 是一个集成在 VSCode 中的工作流编排系统，灵感来源于 Dify。它允许用户通过可视化界面创建、编辑和执行复杂的工作流，同时对外暴露 MCP (Model Context Protocol) 接口，使大模型 Agent 能够程序化地操作工作流。

### 1.2 目标用户
- 开发者：需要自动化重复性任务
- AI 应用开发者：需要构建复杂的 LLM 工作流
- 数据工程师：需要编排数据处理管道
- 自动化测试工程师：需要构建测试工作流

### 1.3 核心价值
- **低代码/无代码**：通过拖拽即可构建复杂工作流
- **AI 原生**：内置 LLM 节点，与大模型无缝集成
- **可扩展**：支持自定义节点类型
- **可编程**：MCP 接口允许 Agent 自动化操作

---

## 2. 功能需求

### 2.1 核心功能模块

#### 2.1.1 工作流可视化编辑器

**功能描述**：提供一个画布，用户可以在上面拖拽创建和编辑工作流。

**详细需求**：
- **画布操作**
  - 无限画布，支持缩放（滚轮/触摸板）
  - 平移（空格+拖拽 或 中键拖拽）
  - 网格对齐和吸附
  - 迷你地图（Minimap）快速导航
  - 画布缩放到适应视图

- **节点操作**
  - 从节点面板拖拽节点到画布
  - 节点在画布上的拖拽移动
  - 节点选中（单击）和多选（框选/Cmd+单击）
  - 节点删除（Delete键/右键菜单）
  - 节点复制粘贴（Cmd+C/V）
  - 节点属性编辑（侧边面板）

- **边（连接）操作**
  - 从输出端口拖拽创建连接
  - 连接自动路由（避免重叠）
  - 连接删除（单击选中+Delete）
  - 连接类型：直线、折线、曲线

- **撤销/重做**
  - 完整的历史记录栈
  - Cmd+Z 撤销，Cmd+Shift+Z 重做
  - 历史记录持久化（可选）

#### 2.1.2 节点类型系统

**基础节点**：

| 节点类型 | 功能描述 | 输入 | 输出 | 配置项 |
|---------|---------|------|------|--------|
| **Start** | 工作流入口 | 无 | `trigger` 对象 | 触发方式（手动/API/定时） |
| **End** | 工作流结束 | 任意 | 无 | 输出变量映射 |
| **Code** | Python 脚本执行 | 任意 | 脚本返回值 | Python代码、超时时间、环境变量 |
| **LLM** | 大模型调用 | prompt, context | 模型响应 | 模型选择、温度、max_tokens、system prompt |
| **Switch** | 条件分支 | 任意 | 多个分支输出 | 条件表达式（支持JS/Python语法） |
| **Parallel** | 并行执行 | 任意 | 多个并行分支 | 分支数量、执行模式 |
| **Merge** | 汇聚节点 | 多个输入 | 合并后的数据 | 合并策略（等待所有/任意一个） |

**扩展节点（未来）**：
- HTTP Request 节点
- Database 节点
- File Operation 节点
- Custom Function 节点

#### 2.1.3 工作流执行引擎

**执行模式**：
- **调试模式**：单步执行，可查看每个节点的输入输出
- **运行模式**：完整执行，显示整体进度
- **定时执行**：通过 Cron 表达式设置定时任务

**执行特性**：
- 执行状态实时显示（运行中/成功/失败）
- 节点级别的日志输出
- 变量作用域管理
- 错误处理和重试机制
- 执行历史记录

#### 2.1.4 工作流管理

**文件管理**：
- 工作流保存为 `.workflow.json` 文件
- 支持版本控制（Git 友好）
- 导入/导出工作流
- 工作流模板库

**项目管理**：
- 工作流分组/文件夹
- 搜索和筛选
- 最近打开

---

## 3. MCP 接口设计

### 3.1 接口概述
通过 Model Context Protocol 暴露工作流操作能力，使大模型 Agent 能够：
- 查询现有工作流
- 创建和修改工作流
- 执行工作流并获取结果

### 3.2 工具列表 (Tools)

```typescript
// 工作流管理
interface WorkflowTools {
  // 列出所有工作流
  listWorkflows(): Promise<WorkflowSummary[]>;
  
  // 获取工作流详情
  getWorkflow(id: string): Promise<Workflow>;
  
  // 创建工作流
  createWorkflow(params: CreateWorkflowParams): Promise<Workflow>;
  
  // 更新工作流
  updateWorkflow(id: string, params: UpdateWorkflowParams): Promise<Workflow>;
  
  // 删除工作流
  deleteWorkflow(id: string): Promise<void>;
}

// 节点操作
interface NodeTools {
  // 添加节点
  addNode(workflowId: string, node: NodeConfig): Promise<Node>;
  
  // 更新节点
  updateNode(workflowId: string, nodeId: string, updates: Partial<NodeConfig>): Promise<Node>;
  
  // 删除节点
  deleteNode(workflowId: string, nodeId: string): Promise<void>;
  
  // 连接节点
  connectNodes(workflowId: string, source: PortRef, target: PortRef): Promise<Edge>;
  
  // 断开连接
  disconnectNodes(workflowId: string, edgeId: string): Promise<void>;
}

// 执行控制
interface ExecutionTools {
  // 执行工作流
  executeWorkflow(workflowId: string, inputs?: Record<string, any>): Promise<ExecutionResult>;
  
  // 获取执行状态
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
  
  // 停止执行
  stopExecution(executionId: string): Promise<void>;
  
  // 获取执行历史
  getExecutionHistory(workflowId: string): Promise<ExecutionRecord[]>;
}
```

### 3.3 资源暴露 (Resources)

- `workflow://{id}` - 工作流定义
- `execution://{id}` - 执行记录
- `node-types://list` - 可用节点类型列表

### 3.4 提示模板 (Prompts)

- `@workflow-agent` - 工作流助手提示词
- `@workflow-debugger` - 调试助手提示词

---

## 4. 用户场景与用例

### 4.1 场景一：自动化代码审查

**用户**：开发团队负责人
**需求**：自动化代码审查流程

**工作流设计**：
```
[Start] → [Git Hook] → [Code Diff] → [LLM Review] → [Switch: 是否需要人工?]
                                              ↓
                                    [Yes] → [通知Reviewer] → [End]
                                    [No]  → [自动Merge] → [End]
```

**价值**：减少人工审查工作量，快速过滤明显问题

### 4.2 场景二：数据处理管道

**用户**：数据工程师
**需求**：构建 ETL 数据处理流程

**工作流设计**：
```
[Start] → [读取CSV] → [Parallel]
                     ↓
        [清洗数据] → [Merge] → [转换格式] → [写入DB] → [End]
        [验证数据] ↗
```

**价值**：可视化构建复杂数据流，易于维护和调试

### 4.3 场景三：AI 客服工作流

**用户**：AI 应用开发者
**需求**：构建多轮对话客服系统

**工作流设计**：
```
[Start] → [意图识别LLM] → [Switch: 意图类型]
                              ↓
            [咨询] → [知识检索] → [回答生成LLM] → [End]
            [投诉] → [情感分析LLM] → [转人工] → [End]
            [订单] → [查询系统] → [回答生成LLM] → [End]
```

**价值**：快速迭代对话流程，A/B 测试不同策略

### 4.4 场景四：Agent 自动化工作流创建

**用户**：使用 Claude/Cursor 等 AI 编程助手的开发者
**需求**：通过自然语言描述让 AI 创建工作流

**交互示例**：
```
用户：帮我创建一个工作流，每天早上9点抓取 Hacker News 头条，
     用 GPT-4 总结，然后发到我的 Slack

AI: 我来为你创建这个工作流...
[通过 MCP 调用创建节点、连接、配置]

工作流已创建完成！包含以下节点：
- Schedule Trigger (每天 9:00)
- HTTP Request (获取 HN API)
- Code Node (解析数据)
- LLM Node (GPT-4 总结)
- HTTP Request (Slack Webhook)
```

---

## 5. 非功能需求

### 5.1 性能要求
- 画布支持 100+ 节点流畅操作
- 工作流执行延迟 < 100ms（不含 LLM 调用）
- 启动时间 < 3 秒

### 5.2 兼容性
- VSCode 版本：^1.80.0
- 支持平台：Windows/macOS/Linux
- Python 版本：>= 3.8

### 5.3 安全性
- Code 节点沙箱执行（限制系统调用）
- 敏感信息加密存储（API Keys 等）
- 工作流文件验证（防止恶意配置）

### 5.4 可扩展性
- 插件化节点系统
- 支持自定义节点注册
- 主题/样式可定制

---

## 6. 界面需求

### 6.1 布局结构

```
+----------------------------------------------------------+
|  活动栏   |  侧边栏        |        编辑器区域            |
|          |  (节点面板/    |   +----------------------+   |
|  📁 文件  |   属性面板)    |   |                      |   |
|  🔧 工作流 |               |   |    工作流画布         |   |
|  ⚙️ 设置  |               |   |                      |   |
|          |               |   |                      |   |
|          |               |   +----------------------+   |
|          |               |        底部面板             |
|          |               |   (日志/变量/执行历史)       |
+----------------------------------------------------------+
```

### 6.2 视觉风格
- 遵循 VSCode 设计规范
- 支持深色/浅色主题自适应
- 节点颜色编码（不同类型不同颜色）
- 流畅的动画过渡

---

## 7. 里程碑规划

### Milestone 1: 基础框架 (Week 1-2)
- VSCode 插件框架搭建
- 基础 UI 布局
- 画布渲染引擎

### Milestone 2: 核心编辑器 (Week 3-4)
- 节点拖拽系统
- 连接系统
- 属性面板
- 撤销/重做

### Milestone 3: 节点实现 (Week 5-6)
- 基础节点（Start/End/Code/LLM）
- 控制流节点（Switch/Parallel/Merge）
- 节点执行引擎

### Milestone 4: 执行与调试 (Week 7-8)
- 工作流执行
- 调试模式
- 日志系统

### Milestone 5: MCP 接口 (Week 9-10)
- MCP Server 实现
- 工具暴露
- 测试与文档

### Milestone 6: 优化与发布 (Week 11-12)
- 性能优化
- 用户体验优化
- 文档完善
- VSCode Marketplace 发布

---

## 8. 附录

### 8.1 术语表
- **工作流 (Workflow)**：由节点和边组成的有向图，定义执行逻辑
- **节点 (Node)**：工作流的基本单元，执行特定功能
- **边 (Edge)**：连接节点的线，表示数据流向
- **端口 (Port)**：节点的输入/输出接口
- **MCP**：Model Context Protocol，模型上下文协议

### 8.2 参考产品
- Dify: https://dify.ai
- n8n: https://n8n.io
- Make: https://make.com
- Node-RED: https://nodered.org
