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