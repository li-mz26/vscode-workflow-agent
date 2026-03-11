# Workflow Agent

Visual workflow editor and executor for VSCode.

## Features

- **Visual Workflow Editor**: Drag-and-drop interface for creating workflows
- **DAG-based**: Workflows are directed acyclic graphs with nodes and edges
- **Node Types**:
  - `start` - Entry point (manual, API, scheduled, webhook triggers)
  - `end` - Exit point
  - `code` - Execute JavaScript/Python code
  - `llm` - Call LLM models (GPT-4, etc.)
  - `switch` - Conditional branching
  - `parallel` - Parallel execution branches
- **MCP Server**: Expose workflow capabilities via Model Context Protocol

## Usage

1. Create a new workflow: `Workflow Agent: Create New Workflow`
2. Open `.workflow.json` files to use the visual editor
3. Execute workflows: `Workflow Agent: Execute Workflow`

## Workflow Structure

```
workflow/
├── workflow.workflow.json  # Main workflow file
└── nodes/
    ├── node0_start.json    # Start node config
    ├── node1_code.py       # Code node script
    └── node2_switch.json   # Switch node config
```

## Requirements

- VSCode 1.85.0+

## License

MIT
