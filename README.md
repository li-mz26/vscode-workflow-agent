# VSCode Workflow Agent

A visual workflow orchestration system for VSCode, inspired by Dify, with MCP (Model Context Protocol) support.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VSCode](https://img.shields.io/badge/VSCode-%5E1.80.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- 🎨 **Visual Workflow Editor** - Drag-and-drop interface for building workflows
- 🤖 **AI-Native** - Built-in LLM nodes for seamless AI integration
- 🔌 **MCP Support** - Expose workflows to AI agents via Model Context Protocol
- 🐍 **Python Code Execution** - Run Python code in sandboxed environment
- 🌐 **HTTP & Webhooks** - Integrate with external APIs and services
- ⏰ **Scheduled Triggers** - Cron-based workflow scheduling
- 🐛 **Debug Mode** - Step-through debugging with breakpoints
- 📦 **Version Control Friendly** - Workflows saved as JSON files

## 🚀 Quick Start

### Installation

```bash
# 方式1: 从 VSIX 安装
code --install-extension vscode-workflow-agent-0.1.0.vsix

# 方式2: 开发模式
git clone <repo>
cd vscode-workflow-agent
npm install
npm run build:webview
npm run compile
# 按 F5 启动调试
```

### Create Your First Workflow

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Workflow Agent: Create New Workflow`
3. Enter a name for your workflow
4. Drag nodes from the palette to the canvas
5. Connect nodes by dragging from output to input ports
6. Click Run (▶) to execute

## 📋 Node Types

| Node | Description | Use Case |
|------|-------------|----------|
| **Start** | Entry point | Trigger workflow |
| **End** | Exit point | Return results |
| **Code** | Python execution | Data processing |
| **LLM** | AI model call | Text generation |
| **Switch** | Conditional branch | Decision making |
| **Parallel** | Parallel execution | Concurrent tasks |
| **Merge** | Join branches | Collect results |
| **HTTP** | API requests | External integration |
| **Webhook** | Notifications | Slack/DingTalk/Discord |
| **Schedule** | Cron trigger | Periodic execution |

## 🤖 MCP Integration

The extension exposes MCP tools for AI agents:

```json
{
  "tools": [
    "list_workflows",
    "create_workflow",
    "add_node",
    "connect_nodes",
    "execute_workflow"
  ]
}
```

Example: Create a workflow via MCP
```json
{
  "name": "create_workflow",
  "arguments": {
    "name": "daily-report",
    "description": "Generate daily report"
  }
}
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build webview
npm run build:webview

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Run tests
npm test

# Package
npm run package
```

## 📁 Project Structure

```
vscode-workflow-agent/
├── src/                    # Extension source code
│   ├── core/              # Core modules
│   │   ├── editor/        # Visual editor
│   │   ├── execution/     # Execution engine
│   │   ├── mcp/           # MCP server
│   │   ├── node/          # Node registry
│   │   ├── tree/          # Explorer tree
│   │   └── workflow/      # Workflow manager
│   └── shared/            # Shared types
├── webview/               # React webview source
├── out/                   # Compiled output
└── docs/                  # Documentation
```

## 📝 Example Workflows

### Alert Handler
```
[Schedule] → [HTTP: Check Metrics] → [Switch: Alert?]
                                    ↓
                    [Yes] → [LLM: Analyze] → [Webhook: Notify] → [End]
                    [No]  → [End]
```

### Data Pipeline
```
[Start] → [Code: Extract] → [Parallel]
                              ↓
        [Code: Transform A] → [Merge] → [Code: Load] → [End]
        [Code: Transform B] ↗
```

## ⚙️ Configuration

```json
{
  "workflowAgent.pythonPath": "python3",
  "workflowAgent.defaultLLMProvider": "openai",
  "workflowAgent.openaiApiKey": "sk-...",
  "workflowAgent.anthropicApiKey": "sk-ant-...",
  "workflowAgent.enableMCP": true,
  "workflowAgent.mcpPort": 3000
}
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

- Inspired by [Dify](https://dify.ai)
- MCP Protocol by [Anthropic](https://www.anthropic.com)
- Built with [VSCode API](https://code.visualstudio.com/api)
