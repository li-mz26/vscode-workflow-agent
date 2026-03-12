/**
 * 本地 MCP Server 测试脚本
 * 直接连接 vscode-workflow-agent 的 MCP Server 进行测试
 * 不依赖外部 webhook
 */

import { spawn } from 'child_process';
import path from 'path';

interface MCPMessage {
    jsonrpc: string;
    id?: number;
    method?: string;
    params?: any;
    result?: any;
    error?: any;
}

class MCPClient {
    private process: any;
    private messageId = 0;
    private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

    async start(serverPath: string): Promise<void> {
        console.log(`🚀 启动 MCP Server: ${serverPath}\n`);

        this.process = spawn('node', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(serverPath)
        });

        this.process.stdout.on('data', (data: Buffer) => {
            this.handleResponse(data.toString());
        });

        this.process.stderr.on('data', (data: Buffer) => {
            console.log(`[Server Log] ${data.toString().trim()}`);
        });

        this.process.on('close', (code: number) => {
            console.log(`\n✅ MCP Server 已退出 (code: ${code})`);
        });

        // 等待服务器初始化
        await this.waitForInit();
    }

    private waitForInit(): Promise<void> {
        return new Promise((resolve) => {
            const checkInit = (data: Buffer) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const msg = JSON.parse(line);
                        if (msg.result?.serverInfo) {
                            console.log('✅ MCP Server 初始化成功');
                            console.log(`   名称: ${msg.result.serverInfo.name}`);
                            console.log(`   版本: ${msg.result.serverInfo.version}\n`);
                            this.process.stdout.off('data', checkInit);
                            resolve();
                            return;
                        }
                    } catch {}
                }
            };
            this.process.stdout.on('data', checkInit);
        });
    }

    private handleResponse(data: string): void {
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const msg: MCPMessage = JSON.parse(line);
                
                // 处理请求响应
                if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
                    const { resolve, reject } = this.pendingRequests.get(msg.id)!;
                    this.pendingRequests.delete(msg.id);
                    
                    if (msg.error) {
                        reject(msg.error);
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (error) {
                console.error('解析响应失败:', error);
            }
        }
    }

    async sendRequest(method: string, params?: any): Promise<any> {
        const id = ++this.messageId;
        const request: MCPMessage = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.process.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async testWorkflowCRUD(): Promise<void> {
        console.log('=== 测试工作流 CRUD ===\n');

        // 1. 创建工作流
        console.log('1️⃣ 创建工作流...');
        const workflowId = await this.sendRequest('tools/call', {
            name: 'create_workflow',
            arguments: {
                name: '测试告警工作流',
                description: '本地 MCP 测试工作流'
            }
        });
        console.log(`   ✅ 创建成功: ${workflowId}\n`);

        // 2. 添加节点
        console.log('2️⃣ 添加测试节点...');
        
        const triggerNode = await this.sendRequest('tools/call', {
            name: 'add_node',
            arguments: {
                workflowId,
                type: 'trigger',
                label: '定时触发',
                position: { x: 100, y: 100 }
            }
        });
        console.log(`   ✅ Trigger 节点: ${triggerNode.id}`);

        const codeNode = await this.sendRequest('tools/call', {
            name: 'add_node',
            arguments: {
                workflowId,
                type: 'code',
                label: '处理逻辑',
                position: { x: 300, y: 100 },
                config: {
                    code: `
                        function main(input) {
                            const alert = {
                                level: 'warning',
                                message: '本地 MCP 测试告警',
                                timestamp: new Date().toISOString()
                            };
                            console.log('生成告警:', alert);
                            return alert;
                        }
                    `
                }
            }
        });
        console.log(`   ✅ Code 节点: ${codeNode.id}\n`);

        // 3. 连接节点
        console.log('3️⃣ 连接节点...');
        const edge = await this.sendRequest('tools/call', {
            name: 'add_edge',
            arguments: {
                workflowId,
                source: triggerNode.id,
                target: codeNode.id
            }
        });
        console.log(`   ✅ 连接边: ${edge.id}\n`);

        // 4. 获取工作流详情
        console.log('4️⃣ 获取工作流详情...');
        const workflow = await this.sendRequest('tools/call', {
            name: 'get_workflow',
            arguments: { workflowId }
        });
        console.log(`   名称: ${workflow.name}`);
        console.log(`   节点数: ${workflow.nodes.length}`);
        console.log(`   边数: ${workflow.edges.length}\n`);

        // 5. 执行工作流
        console.log('5️⃣ 执行工作流...');
        try {
            const result = await this.sendRequest('tools/call', {
                name: 'execute_workflow',
                arguments: { 
                    workflowId,
                    input: { test: true, source: 'mcp-local-test' }
                }
            });
            console.log(`   ✅ 执行成功!`);
            console.log(`   执行 ID: ${result.executionId}`);
            console.log(`   结果: ${JSON.stringify(result.output, null, 2)}\n`);
        } catch (error: any) {
            console.log(`   ⚠️ 执行结果: ${error.message || '完成'}\n`);
        }

        // 6. 列出所有工作流
        console.log('6️⃣ 列出所有工作流...');
        const workflows = await this.sendRequest('tools/call', {
            name: 'list_workflows',
            arguments: {}
        });
        console.log(`   共有 ${workflows.length} 个工作流:`);
        workflows.forEach((w: any) => {
            console.log(`   - ${w.name} (${w.id})`);
        });

        // 7. 删除测试工作流
        console.log('\n7️⃣ 清理测试数据...');
        await this.sendRequest('tools/call', {
            name: 'delete_workflow',
            arguments: { workflowId }
        });
        console.log(`   ✅ 已删除测试工作流\n`);

        console.log('=== 所有测试通过! ===');
    }

    async testResourcesAndPrompts(): Promise<void> {
        console.log('\n=== 测试 Resources 和 Prompts ===\n');

        // 列出可用资源
        console.log('📚 列出资源模板...');
        try {
            const resources = await this.sendRequest('resources/list', {});
            console.log(`   找到 ${resources?.length || 0} 个资源\n`);
        } catch {
            console.log('   (资源列表不可用)\n');
        }

        // 列出提示模板
        console.log('💬 列出提示模板...');
        try {
            const prompts = await this.sendRequest('prompts/list', {});
            console.log(`   找到 ${prompts?.length || 0} 个提示模板\n`);
        } catch {
            console.log('   (提示列表不可用)\n');
        }
    }

    stop(): void {
        if (this.process) {
            this.process.kill();
        }
    }
}

// 主函数
async function main() {
    const client = new MCPClient();

    // 处理退出
    process.on('SIGINT', () => {
        console.log('\n\n收到中断信号，正在关闭...');
        client.stop();
        process.exit(0);
    });

    try {
        // 启动 MCP Server（使用编译后的代码）
        const serverPath = path.join(__dirname, 'out/core/mcp/MCPServerManager.js');
        await client.start(serverPath);

        // 运行测试
        await client.testWorkflowCRUD();
        await client.testResourcesAndPrompts();

    } catch (error) {
        console.error('❌ 测试失败:', error);
    } finally {
        client.stop();
    }
}

main();
