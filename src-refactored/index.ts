/**
 * 独立的 MCP Server 入口
 * 使用重构后的架构
 */

const { container } = require('./container/DIContainer');

// 初始化容器
container.initialize();

// 启动 MCP Server
const mcpServer = container.getMCPServer();
mcpServer.start();

console.error('✅ Refactored MCP Server started on stdio');

// 导出模块供测试使用
module.exports = { container };
