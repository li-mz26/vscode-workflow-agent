import { runWorkflowConsoleServer } from '../web/consoleServer';
import WorkflowMCPServer from '../mcp/server';

async function runNodeApp(): Promise<void> {
  const mcpHost = process.env.WORKFLOW_MCP_HOST || '127.0.0.1';
  const mcpPort = Number(process.env.WORKFLOW_MCP_PORT || 3031);
  const mcpTransport = (process.env.WORKFLOW_MCP_TRANSPORT || 'streamable-http') as 'sse' | 'streamable-http';

  if (mcpPort <= 0) {
    throw new Error('WORKFLOW_MCP_PORT 必须是大于 0 的端口（Node App 模式需要后台开启 HTTP MCP Server）');
  }

  const mcpServer = new WorkflowMCPServer();
  await mcpServer.runHttp(mcpHost, mcpPort, mcpTransport);

  await runWorkflowConsoleServer({
    mcp: {
      host: mcpHost,
      port: mcpPort,
      transport: mcpTransport
    }
  });
}

if (require.main === module) {
  runNodeApp().catch((error) => {
    console.error('[NodeApp] startup failed:', error);
    process.exit(1);
  });
}

export { runNodeApp };
