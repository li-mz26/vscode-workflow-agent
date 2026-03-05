# VSCode Workflow Agent

A visual workflow orchestration system for VSCode, inspired by Dify, with MCP (Model Context Protocol) support.

## Features

- 🎨 **Visual Workflow Editor**: Drag-and-drop interface for building workflows
- 🔧 **Node Types**: Start, End, Code (Python), LLM, Switch, Parallel, Merge
- ▶️ **Execution & Debug**: Run and debug workflows with step-through support
- 🤖 **MCP Integration**: Expose workflows to AI agents via Model Context Protocol
- 📝 **Version Control Friendly**: Workflows saved as JSON files

## Quick Start

1. Install the extension from VSCode Marketplace
2. Open Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run `Workflow Agent: Create New Workflow`
4. Drag nodes to build your workflow
5. Click Run to execute

## Node Types

| Node | Description |
|------|-------------|
| **Start** | Entry point of the workflow |
| **End** | Exit point with output mapping |
| **Code** | Execute Python code |
| **LLM** | Call language models (OpenAI, Anthropic) |
| **Switch** | Conditional branching |
| **Parallel** | Execute branches in parallel |
| **Merge** | Merge parallel branches |

## MCP Usage

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

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Run tests
npm test

# Package
npm run package
```

## License

MIT
