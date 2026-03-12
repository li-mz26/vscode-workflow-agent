#!/usr/bin/env node
/**
 * MCP Client 测试脚本 - 连接 Workflow Agent MCP Server
 * 
 * 使用方法:
 * node mcp-client-test.js
 * 
 * 这个脚本会:
 * 1. 启动 MCP Server
 * 2. 连接并调用 tools/list 查看可用工具
 * 3. 创建一个复杂的告警处理工作流
 * 4. 验证工作流
 */

const { spawn } = require('child_process');
const path = require('path');

// MCP 请求封装
class MCPClient {
    constructor(serverProcess) {
        this.server = serverProcess;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.buffer = '';
        
        this.server.stdout.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        
        this.server.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });
    }
    
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // 保留不完整的行
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const response = JSON.parse(line);
                    this.handleResponse(response);
                } catch (e) {
                    console.log('Server output:', line);
                }
            }
        }
    }
    
    handleResponse(response) {
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
            const { resolve, reject } = this.pendingRequests.get(response.id);
            this.pendingRequests.delete(response.id);
            
            if (response.error) {
                reject(new Error(response.error.message));
            } else {
                resolve(response.result);
            }
        }
    }
    
    async request(method, params = {}) {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };
        
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.server.stdin.write(JSON.stringify(request) + '\n');
            
            // 超时处理
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 10000);
        });
    }
    
    // 工具方法
    async listTools() {
        return this.request('tools/list');
    }
    
    async callTool(name, arguments_) {
        return this.request('tools/call', { name, arguments: arguments_ });
    }
    
    async listWorkflows() {
        return this.callTool('list_workflows', {});
    }
    
    async createWorkflow(name, description = '') {
        return this.callTool('create_workflow', { name, description });
    }
    
    async addNode(workflowId, type, position, data = {}) {
        return this.callTool('add_node', {
            workflowId,
            type,
            position,
            data
        });
    }
    
    async connectNodes(workflowId, sourceNodeId, targetNodeId, sourcePortId = 'output', targetPortId = 'input', condition = null) {
        const params = {
            workflowId,
            sourceNodeId,
            targetNodeId,
            sourcePortId,
            targetPortId
        };
        if (condition) {
            params.condition = condition;
        }
        return this.callTool('connect_nodes', params);
    }
    
    async validateWorkflow(workflowId) {
        return this.callTool('validate_workflow', { workflowId });
    }
    
    async listNodeTypes() {
        return this.callTool('list_node_types', {});
    }
    
    stop() {
        this.server.kill();
    }
}

// 主测试流程
async function main() {
    console.log('🚀 启动 MCP Server...');
    
    // 启动 MCP Server
    const serverPath = path.join(__dirname, 'out/core/mcp/MCPServerManager.js');
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const client = new MCPClient(serverProcess);
    
    try {
        // 等待服务器初始化
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n📋 步骤 1: 获取可用工具列表');
        const tools = await client.listTools();
        console.log('可用工具:', tools.tools.map(t => t.name).join(', '));
        
        console.log('\n📋 步骤 2: 获取节点类型');
        const nodeTypes = await client.listNodeTypes();
        console.log('可用节点类型:', nodeTypes.types.map(t => t.type).join(', '));
        
        console.log('\n📋 步骤 3: 查看现有工作流');
        const workflows = await client.listWorkflows();
        console.log(`现有工作流数量: ${workflows.workflows.length}`);
        
        console.log('\n📋 步骤 4: 创建告警处理工作流');
        const workflow = await client.createWorkflow(
            'alert-handler-v1',
            '复杂告警处理工作流 - 支持多维度分析、自动修复和分级通知'
        );
        console.log('工作流创建成功:', workflow.workflow.id);
        const workflowId = workflow.workflow.id;
        
        console.log('\n📋 步骤 5: 添加节点');
        
        // 5.1 Start 节点
        const startNode = await client.addNode(workflowId, 'start', { x: 100, y: 100 }, {
            triggerType: 'api'
        });
        console.log('✓ Start 节点:', startNode.node.id);
        
        // 5.2 Code 节点 - 解析告警
        const parseAlertNode = await client.addNode(workflowId, 'code', { x: 350, y: 100 }, {
            code: `def main(ctx):
    alert = ctx.get('input', {})
    return {
        'alert_id': alert.get('id'),
        'severity': alert.get('severity', 'P3'),
        'service': alert.get('service'),
        'metric': alert.get('metric'),
        'value': alert.get('value'),
        'threshold': alert.get('threshold')
    }`
        });
        console.log('✓ Parse Alert 节点:', parseAlertNode.node.id);
        
        // 5.3 HTTP 节点 - 查询相关指标
        const queryMetricsNode = await client.addNode(workflowId, 'http', { x: 600, y: 50 }, {
            method: 'GET',
            url: 'https://monitoring.api/metrics?service={{service}}&metric={{metric}}&range=1h',
            timeout: 5000
        });
        console.log('✓ Query Metrics 节点:', queryMetricsNode.node.id);
        
        // 5.4 HTTP 节点 - 查询历史告警
        const queryHistoryNode = await client.addNode(workflowId, 'http', { x: 600, y: 150 }, {
            method: 'GET',
            url: 'https://monitoring.api/alerts/history?service={{service}}&range=24h',
            timeout: 5000
        });
        console.log('✓ Query History 节点:', queryHistoryNode.node.id);
        
        // 5.5 Parallel 节点 - 并行查询
        const parallelNode = await client.addNode(workflowId, 'parallel', { x: 850, y: 100 }, {
            branches: [
                { name: 'metrics_branch', id: 'metrics' },
                { name: 'history_branch', id: 'history' }
            ]
        });
        console.log('✓ Parallel 节点:', parallelNode.node.id);
        
        // 5.6 Merge 节点 - 汇聚结果
        const mergeNode = await client.addNode(workflowId, 'merge', { x: 1100, y: 100 }, {
            strategy: 'all'
        });
        console.log('✓ Merge 节点:', mergeNode.node.id);
        
        // 5.7 LLM 节点 - 根因分析
        const llmNode = await client.addNode(workflowId, 'llm', { x: 1350, y: 100 }, {
            model: 'gpt-4',
            prompt: `分析以下告警数据，提供根因分析和建议：
告警信息: {{alert_info}}
相关指标: {{metrics_data}}
历史记录: {{history_data}}

请提供:
1. 可能的根因
2. 严重程度评估
3. 建议的处理措施`,
            temperature: 0.3
        });
        console.log('✓ LLM Analysis 节点:', llmNode.node.id);
        
        // 5.8 Switch 节点 - 根据严重程度分支
        const switchNode = await client.addNode(workflowId, 'switch', { x: 1600, y: 100 }, {
            conditions: [
                { name: 'P0_Critical', expression: "severity == 'P0'", target: 'p0_handler' },
                { name: 'P1_High', expression: "severity == 'P1'", target: 'p1_handler' },
                { name: 'P2_Medium', expression: "severity == 'P2'", target: 'p2_handler' },
                { name: 'P3_Low', expression: "severity == 'P3'", target: 'p3_handler' }
            ],
            defaultTarget: 'p3_handler'
        });
        console.log('✓ Switch 节点:', switchNode.node.id);
        
        // 5.9 P0/P1 处理分支 - 并行自动修复 + 立即通知
        const autoFixNode = await client.addNode(workflowId, 'code', { x: 1850, y: 50 }, {
            code: `def main(ctx):
    # 尝试自动修复
    alert = ctx.get('input', {})
    fixes = []
    
    if alert.get('metric') == 'cpu_high':
        fixes.append('scale_up_instances')
    elif alert.get('metric') == 'memory_high':
        fixes.append('restart_service')
    elif alert.get('metric') == 'disk_full':
        fixes.append('cleanup_logs')
    
    return {'fixes_applied': fixes, 'auto_fixed': len(fixes) > 0}`
        });
        console.log('✓ Auto Fix 节点:', autoFixNode.node.id);
        
        // 5.10 Webhook 节点 - 紧急通知
        const urgentNotifyNode = await client.addNode(workflowId, 'webhook', { x: 1850, y: 150 }, {
            provider: 'slack',
            webhookUrl: 'https://hooks.slack.com/services/xxx/yyy/zzz',
            title: '🚨 严重告警: {{alert_id}}',
            message: '服务 {{service}} 出现严重问题，已尝试自动修复。',
            severity: 'critical',
            mentions: ['oncall-engineer', 'sre-team']
        });
        console.log('✓ Urgent Notify 节点:', urgentNotifyNode.node.id);
        
        // 5.11 P2/P3 处理分支 - 记录并定时巡检
        const logNode = await client.addNode(workflowId, 'code', { x: 1850, y: 250 }, {
            code: `def main(ctx):
    import json
    alert = ctx.get('input', {})
    log_entry = {
        'timestamp': ctx.get('timestamp'),
        'alert': alert,
        'status': 'logged_for_review'
    }
    # 写入日志系统
    return {'logged': True, 'log_id': alert.get('id')}`
        });
        console.log('✓ Log Alert 节点:', logNode.node.id);
        
        // 5.12 Schedule 节点 - 定时巡检
        const scheduleNode = await client.addNode(workflowId, 'schedule', { x: 2100, y: 250 }, {
            cronExpression: '0 */4 * * *',  // 每4小时检查一次
            timezone: 'Asia/Shanghai',
            enabled: True
        });
        console.log('✓ Schedule Check 节点:', scheduleNode.node.id);
        
        // 5.13 End 节点
        const endNode = await client.addNode(workflowId, 'end', { x: 2350, y: 100 }, {
            outputMapping: {
                result: 'workflow_result',
                status: 'final_status'
            }
        });
        console.log('✓ End 节点:', endNode.node.id);
        
        console.log('\n📋 步骤 6: 连接节点');
        
        // 连接 Start -> Parse Alert
        await client.connectNodes(workflowId, startNode.node.id, parseAlertNode.node.id);
        console.log('✓ Start -> Parse Alert');
        
        // 连接 Parse Alert -> Parallel (通过分支)
        await client.connectNodes(workflowId, parseAlertNode.node.id, parallelNode.node.id);
        console.log('✓ Parse Alert -> Parallel');
        
        // 连接 Parallel -> Query Metrics/History
        await client.connectNodes(workflowId, parallelNode.node.id, queryMetricsNode.node.id, 'output', 'input', 'metrics');
        await client.connectNodes(workflowId, parallelNode.node.id, queryHistoryNode.node.id, 'output', 'input', 'history');
        console.log('✓ Parallel -> Query Metrics/History');
        
        // 连接 Query -> Merge
        await client.connectNodes(workflowId, queryMetricsNode.node.id, mergeNode.node.id);
        await client.connectNodes(workflowId, queryHistoryNode.node.id, mergeNode.node.id);
        console.log('✓ Query -> Merge');
        
        // 连接 Merge -> LLM
        await client.connectNodes(workflowId, mergeNode.node.id, llmNode.node.id);
        console.log('✓ Merge -> LLM');
        
        // 连接 LLM -> Switch
        await client.connectNodes(workflowId, llmNode.node.id, switchNode.node.id);
        console.log('✓ LLM -> Switch');
        
        // 连接 Switch -> P0/P1 处理 (严重告警)
        await client.connectNodes(workflowId, switchNode.node.id, autoFixNode.node.id, 'output', 'input', 'P0_Critical');
        await client.connectNodes(workflowId, switchNode.node.id, urgentNotifyNode.node.id, 'output', 'input', 'P0_Critical');
        await client.connectNodes(workflowId, switchNode.node.id, autoFixNode.node.id, 'output', 'input', 'P1_High');
        await client.connectNodes(workflowId, switchNode.node.id, urgentNotifyNode.node.id, 'output', 'input', 'P1_High');
        console.log('✓ Switch -> P0/P1 处理');
        
        // 连接 Switch -> P2/P3 处理 (一般告警)
        await client.connectNodes(workflowId, switchNode.node.id, logNode.node.id, 'output', 'input', 'P2_Medium');
        await client.connectNodes(workflowId, switchNode.node.id, logNode.node.id, 'output', 'input', 'P3_Low');
        console.log('✓ Switch -> P2/P3 处理');
        
        // 连接 P2/P3 -> Schedule
        await client.connectNodes(workflowId, logNode.node.id, scheduleNode.node.id);
        console.log('✓ Log -> Schedule');
        
        // 连接所有分支到 End
        await client.connectNodes(workflowId, autoFixNode.node.id, endNode.node.id);
        await client.connectNodes(workflowId, urgentNotifyNode.node.id, endNode.node.id);
        await client.connectNodes(workflowId, scheduleNode.node.id, endNode.node.id);
        console.log('✓ 所有分支 -> End');
        
        console.log('\n📋 步骤 7: 验证工作流');
        const validation = await client.validateWorkflow(workflowId);
        console.log('验证结果:', validation);
        
        console.log('\n✅ 告警处理工作流创建完成!');
        console.log('工作流 ID:', workflowId);
        console.log('节点数量: 13');
        console.log('边数量: 14');
        
        // 输出工作流结构
        console.log('\n📊 工作流结构:');
        console.log('Start -> Parse Alert -> Parallel -> [Query Metrics, Query History] -> Merge -> LLM Analysis -> Switch');
        console.log('  ├── P0/P1 (严重) -> [Auto Fix, Urgent Notify] -> End');
        console.log('  └── P2/P3 (一般) -> Log -> Schedule Check -> End');
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error(error.stack);
    } finally {
        client.stop();
        console.log('\n👋 MCP Server 已停止');
    }
}

// 运行测试
main().catch(console.error);
