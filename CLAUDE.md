# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VSCode Workflow Agent is a VSCode extension for visual workflow orchestration with MCP (Model Context Protocol) support. It provides a drag-and-drop interface for building AI-native workflows with nodes for LLM calls, Python code execution, HTTP requests, conditional branching, and more.

## Build & Development Commands

```bash
# Install dependencies (both extension and webview)
npm install
cd webview && npm install && cd ..

# Build webview frontend (React/Vite)
npm run build:webview

# Compile TypeScript extension
npm run compile

# Watch mode for development
npm run watch

# Run linter
npm run lint

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Package extension as VSIX
npm run package
```

### Running Tests

Tests use Vitest. Run a specific test file:
```bash
npx vitest run tests/unit/core/workflow/WorkflowManager.test.ts
```

### Development Workflow

1. Run `npm run build:webview` to build the React webview
2. Run `npm run compile` to compile the extension
3. Press F5 in VSCode to launch the extension in debug mode

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension Host                     │
├─────────────────────────────────────────────────────────────┤
│  Webview (React)  ←→  Extension Backend  ←→  MCP Server     │
│                              ↓                               │
│                      Execution Engine                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Directories

- `src/extension.ts` - Extension entry point, registers commands and providers
- `src/core/` - Core modules (editor, execution, mcp, node, tree, workflow)
- `src/domain/` - Domain entities (Workflow, NodeConfig, Edge)
- `src/executor/` - Node executor implementations
- `src/shared/types/` - Shared TypeScript interfaces
- `webview/` - React frontend for visual editor (built with Vite)

### Core Components

1. **WorkflowManager** (`src/core/workflow/WorkflowManager.ts`) - Manages workflow CRUD, file operations, and validation

2. **ExecutionEngine** (`src/core/execution/ExecutionEngine.ts`) - Executes workflows by traversing nodes, supports debugging with breakpoints

3. **NodeExecutor** (`src/executor/`) - Strategy pattern for node execution. Each node type has an executor (e.g., `CodeNodeExecutor`, `LLMNodeExecutor`)

4. **NodeRegistry** (`src/core/node/NodeRegistry.ts`) - Registry of available node types with their definitions

5. **MCPServerManager** (`src/core/mcp/MCPServerManager.ts`) - Exposes workflow tools via Model Context Protocol

6. **WorkflowEditorProvider** (`src/core/editor/WorkflowEditorProvider.ts`) - Custom editor for `.workflow.json` files, hosts the React webview

### Node Types

| Type | Purpose | Executor |
|------|---------|----------|
| start | Entry point | StartNodeExecutor |
| end | Exit point | EndNodeExecutor |
| code | Python execution | CodeNodeExecutor |
| llm | AI model call | LLMNodeExecutor |
| switch | Conditional branching | SwitchNodeExecutor |
| parallel | Parallel execution | ParallelNodeExecutor |
| merge | Join branches | MergeNodeExecutor |
| http | HTTP requests | HTTPNodeExecutor |
| webhook | Notifications | WebhookNodeExecutor |

### Workflow File Format

Workflows are stored as `.workflow.json` files. Nodes can optionally reference external config files via `configRef`:
- `.py` files for Code nodes (Python code)
- `.json` files for other node configs

Example:
```json
{
  "id": "wf_xxx",
  "name": "My Workflow",
  "nodes": [
    { "id": "node1", "type": "code", "configRef": "nodes/node1.py", ... }
  ],
  "edges": [...],
  "settings": { "timeout": 30, "logLevel": "info" }
}
```

### Webview Communication

The extension and webview communicate via `vscode.postMessage`:
- Extension → Webview: `webview.postMessage({ type: 'workflow:update', payload: workflow })`
- Webview → Extension: `vscode.postMessage({ type: 'node:add', payload: nodeConfig })`

See `WorkflowEditorProvider.ts` for message handling patterns.

## Key Patterns

### Adding a New Node Type

1. Create executor in `src/executor/executors/XxxNodeExecutor.ts` extending `NodeExecutorBase`
2. Register in `src/executor/NodeExecutorFactory.ts`
3. Add node definition in `src/core/node/NodeRegistry.ts`
4. Add UI component in `webview/src/components/` if needed

### Domain Model

The `Workflow` class (`src/domain/Workflow.ts`) is the core domain entity with methods:
- `validate()` - Check workflow integrity
- `addNode()`, `updateNode()`, `deleteNode()` - Mutate nodes
- `addEdge()`, `deleteEdge()` - Mutate edges

### Execution Flow

1. `ExecutionEngine.start()` finds the Start node
2. Executes nodes in topological order via `executeFromNode()`
3. Switch nodes branch based on conditions
4. Parallel nodes execute branches concurrently with `Promise.all()`
5. Results collected at End node

## Configuration

Extension settings (in VSCode settings.json):
- `workflowAgent.pythonPath` - Python executable path
- `workflowAgent.defaultLLMProvider` - "openai" | "anthropic" | "local"
- `workflowAgent.enableMCP` - Enable MCP server
- `workflowAgent.mcpPort` - MCP server port (default 3000)

## Testing

Tests are located in `tests/` directory using Vitest. Mock VSCode APIs with `vi.mock('vscode', ...)`. See existing tests for patterns.