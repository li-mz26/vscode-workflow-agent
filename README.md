# Workflow Agent

一个用于 Visual Studio Code 的工作流插件，提供工作流的创建、编辑和可视化功能。

## 功能

- 🎨 **可视化编辑器**：拖拽式节点编辑，直观的连线操作
- 📦 **工作流定义**：基于 DAG（有向无环图）的工作流结构
- 🔧 **多种节点类型**：
  - `start` - 开始节点
  - `end` - 结束节点
  - `code` - 代码执行
  - `llm` - LLM 调用
  - `switch` - 条件分支
  - `parallel` - 并行执行
  - `http` - HTTP 请求
  - `transform` - 数据转换
  - `delay` - 延迟
- 🔌 **MCP 支持**：通过 MCP 协议暴露工作流能力

## 安装

### 从 VSIX 安装

1. 下载 `.vsix` 文件
2. 在 VSCode 中按 `Ctrl+Shift+P`
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-repo/vscode-workflow-agent.git
cd vscode-workflow-agent

# 安装依赖
npm install

# 编译
npm run compile

# 打包
npm run package
```

## 使用

### 创建工作流

1. 按 `Ctrl+Shift+P`
2. 输入 `Workflow: Create New Workflow`
3. 输入工作流名称
4. 选择保存位置

### 打开工作流编辑器

- 在文件资源管理器中双击 `.workflow.json` 文件
- 或右键点击 `.workflow.json` 文件，选择 "Open Workflow Editor"

### 编辑工作流

- 从左侧工具栏拖拽节点到画布
- 拖拽节点端口进行连线
- 点击节点在右侧面板编辑属性

## 工作流文件结构

```
my-workflow/
├── my-workflow.workflow.json    # 工作流定义
└── nodes/
    ├── node1_code.py            # 代码节点
    ├── node2_llm.json           # LLM 配置
    └── node3_switch.json        # 分支配置
```


## Node.js 应用版本（Web 控制台 + MCP Server）

除了 VSCode 插件，你也可以直接运行一个 Node.js 应用版本：

```bash
# 同时启动 Web 控制台和后台 MCP Server
npm run start:node-app
```

默认端口：

- Web 控制台：`http://127.0.0.1:3030`
- MCP Server：`http://127.0.0.1:3031/mcp`

可选环境变量：

- `WORKFLOW_WEB_HOST`：Web 控制台监听地址（默认 `127.0.0.1`）
- `WORKFLOW_WEB_PORT`：Web 控制台端口（默认 `3030`）
- `WORKFLOW_WEB_ROOT`：控制台允许访问的工作区根目录（默认当前目录）
- `WORKFLOW_MCP_HOST`：MCP Server 监听地址（默认 `127.0.0.1`）
- `WORKFLOW_MCP_PORT`：MCP Server 端口（默认 `3031`）
- `WORKFLOW_MCP_TRANSPORT`：MCP 传输模式（默认 `streamable-http`）

如果你只想启动 Web 控制台（不自动拉起 MCP Server），可继续使用：

```bash
npm run start:web-console
```

Web 控制台能力：

- 扫描目录下的 `*.workflow.json` 工作流
- 查看工作流定义和节点配置
- 以自定义输入 JSON 直接运行工作流
- 页面显示当前 MCP 服务地址（Node App 模式）

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 运行测试
npm test

# 打包
npm run package
```

## License

MIT