# VSCode Workflow Agent 示例

本目录包含多个示例工作流，展示不同场景下的使用方法。

## 文件说明

### 节点类型定义
- **node-types.json** - 所有支持的节点类型定义，包含输入输出端口、配置Schema等

### 示例工作流

#### 01-hello-world.workflow.json
最基础的示例，展示工作流的基本结构：
- 开始 → 代码执行 → 结束
- 演示变量传递和基础代码执行

#### 02-api-data-processing.workflow.json
API 数据处理示例：
- 从外部 API 获取数据
- 使用代码节点处理和转换数据
- 展示 HTTP 节点的使用

#### 03-conditional-branching.workflow.json
条件分支示例：
- 使用 Switch 节点根据条件选择不同分支
- 模拟成绩判断场景（优秀/良好/不及格）
- 展示多分支合并

#### 04-parallel-processing.workflow.json
并行处理示例：
- 使用 Parallel 节点同时执行多个任务
- 三个独立的数据处理任务并行运行
- 合并所有任务的结果

#### 05-llm-text-analysis.workflow.json
LLM 文本分析示例：
- 使用 LLM 节点进行情感分析
- 同时生成内容摘要
- 展示大语言模型的应用场景

#### 06-monitoring-alert.workflow.json
监控告警示例：
- 定时触发（Cron 表达式）
- 获取系统监控指标
- 异常时通过 Webhook 发送告警通知
- 展示完整的监控告警流程

## 使用方法

1. 在 VSCode 中打开任意 `.workflow.json` 文件
2. 编辑器会自动切换到可视化编辑模式
3. 可以点击工具栏按钮切换回 JSON 文本视图
4. 支持拖拽节点、连接端口、配置属性

## 变量说明

工作流中使用的变量需要在 `variables` 数组中定义：

```json
{
  "variables": [
    { "name": "api_key", "type": "string", "defaultValue": "" }
  ]
}
```

变量可以在节点配置中使用 `{{variable_name}}` 语法引用。

## 节点类型速查

| 类型 | 类别 | 用途 |
|------|------|------|
| start | 基础 | 工作流入口 |
| end | 基础 | 工作流出口 |
| code | 基础 | 执行 Python 代码 |
| llm | 基础 | 调用大语言模型 |
| switch | 流程控制 | 条件分支 |
| parallel | 流程控制 | 并行执行 |
| http | 集成 | HTTP 请求 |
| webhook | 集成 | 发送通知 |
| schedule | 流程控制 | 定时触发 |

详细定义请查看 `node-types.json`。
