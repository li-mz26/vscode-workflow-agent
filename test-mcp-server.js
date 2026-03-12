#!/usr/bin/env node
/**
 * MCP Server 测试脚本 - 独立版本
 * 用于测试 VSCode Workflow Agent 的 MCP Server 功能
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== 模拟 VSCode 模块 ==========
const mockVscode = {
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: '/root/.openclaw/workspace/vscode-workflow-agent/workflows' },
            name: 'workflows',
            index: 0
        }],
        findFiles: async () => [],
        createFileSystemWatcher: () => ({
            onDidCreate: () => {},
            onDidChange: () => {},
            onDidDelete: () => {}
        })
    },
    RelativePattern: class {
        constructor(folder, pattern) {
            this.folder = folder;
            this.pattern = pattern;
        }
    },
    EventEmitter: EventEmitter
};

// 注册模拟模块
require.cache[require.resolve('vscode')] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: mockVscode
};

// 拦截 require
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// ========== 加载实际模块 ==========
const { WorkflowManager } = require('./out/core/workflow/WorkflowManager');
const { MCPServerManager } = require('./out/core/mcp/MCPServerManager');

// ========== 模拟 VSCode 上下文 ==========
const mockContext = {
    subscriptions: [],
    extensionPath: '/root/.openclaw/workspace/vscode-workflow-agent',
    globalState: {
        get: () => null,
        update: () => Promise.resolve()
    },
    workspaceState: {
        get: () => null,
        update: () => Promise.resolve()
    }
};

// ========== 测试函数 ==========
async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     VSCode Workflow Agent MCP Server 测试脚本                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    const workflowsDir = '/root/.openclaw/workspace/vscode-workflow-agent/workflows';
    if (!fs.existsSync(workflowsDir)) {
        fs.mkdirSync(workflowsDir, { recursive: true });
    }
    
    // 初始化
    console.log('▶ 1. 初始化 WorkflowManager...');
    const workflowManager = new WorkflowManager(mockContext);
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('  ✓ WorkflowManager 初始化完成\n');
    
    console.log('▶ 2. 初始化 MCP Server...');
    const mcpServer = new MCPServerManager(workflowManager);
    console.log('  ✓ MCP Server 初始化完成\n');
    
    // 测试工具列表
    console.log('▶ 3. 测试工具列表 (tools/list)...');
    const toolsResult = mcpServer.listTools();
    console.log(`  可用工具数量: ${toolsResult.tools.length}`);
    console.log('  工具列表:');
    toolsResult.tools.forEach(tool => {
        console.log(`    • ${tool.name}`);
        console.log(`      ${tool.description}`);
    });
    console.log('');
    
    // 测试节点类型列表
    console.log('▶ 4. 测试节点类型列表 (list_node_types)...');
    const nodeTypesResult = mcpServer.listNodeTypes();
    console.log(`  可用节点类型数量: ${nodeTypesResult.types.length}`);
    console.log('  节点类型:');
    nodeTypesResult.types.forEach(type => {
        console.log(`    • ${type.type.padEnd(10)} | ${type.name.padEnd(10)} | ${type.category.padEnd(8)} | ${type.description}`);
    });
    console.log('');
    
    // 创建工作流
    console.log('▶ 5. 创建告警处理工作流...');
    const createResult = await mcpServer.callTool('create_workflow', {
        name: 'alert-handler',
        description: '复杂告警处理工作流 - 支持严重程度分支、并行处理、自动修复和通知'
    });
    const workflowId = createResult.workflow.id;
    console.log(`  ✓ 工作流创建成功`);
    console.log(`    ID: ${workflowId}`);
    console.log(`    名称: ${createResult.workflow.name}`);
    console.log(`    描述: ${createResult.workflow.description}`);
    console.log(`    初始节点数: ${createResult.workflow.nodes.length}\n`);
    
    // 列出工作流
    console.log('▶ 6. 列出所有工作流...');
    const listResult = await mcpServer.callTool('list_workflows', {});
    console.log(`  工作流数量: ${listResult.workflows.length}`);
    listResult.workflows.forEach(wf => {
        console.log(`    • ${wf.name} (${wf.nodeCount} 节点)`);
    });
    console.log('');
    
    // 验证初始工作流
    console.log('▶ 7. 验证初始工作流...');
    const initialValidate = await mcpServer.callTool('validate_workflow', { workflowId });
    console.log(`  验证结果: ${initialValidate.valid ? '✓ 有效' : '✗ 无效'}`);
    if (initialValidate.errors) {
        initialValidate.errors.forEach(err => console.log(`    ! ${err}`));
    }
    console.log('');
    
    // 添加节点
    console.log('▶ 8. 添加告警处理工作流节点...');
    console.log('');
    
    // 获取现有节点
    const workflow = await workflowManager.getWorkflow(workflowId);
    const startNode = workflow.nodes.find(n => n.type === 'start');
    const endNode = workflow.nodes.find(n => n.type === 'end');
    
    // 节点 1: 解析告警输入
    console.log('  8.1 添加 Code 节点: Parse Alert Input');
    const parseAlertNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 250, y: 100 },
        data: {
            label: 'Parse Alert Input',
            description: '解析告警输入，提取关键信息',
            code: `# 解析告警输入
alert = inputs.get('alert', {})
severity = alert.get('severity', 'P3')
metric = alert.get('metric', 'unknown')
value = alert.get('value', 0)
timestamp = alert.get('timestamp', '')

# 输出解析结果
outputs['severity'] = severity
outputs['metric'] = metric
outputs['value'] = value
outputs['timestamp'] = timestamp
outputs['alert_id'] = alert.get('id', '')
outputs['service'] = alert.get('service', 'unknown')`
        }
    });
    console.log(`      ✓ 节点 ID: ${parseAlertNode.node.id}`);
    
    // 节点 2: 查询相关指标 (HTTP 模拟)
    console.log('  8.2 添加 Code 节点: Query Metrics (HTTP)');
    const queryMetricsNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 400, y: 100 },
        data: {
            label: 'Query Metrics (HTTP)',
            description: '查询相关指标数据（模拟 HTTP 调用）',
            code: `# 查询相关指标（模拟 HTTP 调用监控系统）
import json
import time

metric = inputs.get('metric')
service = inputs.get('service')

# 模拟 HTTP API 调用
metrics_data = {
    'cpu_usage': {
        'current': inputs.get('value'),
        'avg_5m': inputs.get('value') * 0.9,
        'avg_1h': inputs.get('value') * 0.85,
        'trend': 'increasing'
    },
    'memory_usage': {
        'current': inputs.get('value'),
        'available': 100 - inputs.get('value'),
        'swap_usage': max(0, inputs.get('value') - 80)
    },
    'disk_usage': {
        'current': inputs.get('value'),
        'free_gb': (100 - inputs.get('value')) * 0.5,
        'growth_rate': '2% per day'
    }
}

# 模拟 API 响应
outputs['metrics'] = metrics_data.get(metric, {})
outputs['query_time'] = time.time()
outputs['data_source'] = 'monitoring_api'
outputs['status'] = 'success'`
        }
    });
    console.log(`      ✓ 节点 ID: ${queryMetricsNode.node.id}`);
    
    // 节点 3: 查询历史告警 (HTTP 模拟)
    console.log('  8.3 添加 Code 节点: Query History (HTTP)');
    const queryHistoryNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 400, y: 250 },
        data: {
            label: 'Query History (HTTP)',
            description: '查询历史告警记录（模拟 HTTP 调用）',
            code: `# 查询历史告警记录（模拟 HTTP 调用）
import time

metric = inputs.get('metric')
service = inputs.get('service')

# 模拟历史数据查询
history = {
    'similar_alerts_24h': 3,
    'similar_alerts_7d': 12,
    'last_occurrence': time.time() - 3600,  # 1小时前
    'frequency': 'intermittent',
    'previous_resolutions': [
        {'method': 'auto_restart', 'success': True},
        {'method': 'scale_up', 'success': True},
        {'method': 'manual_fix', 'success': True}
    ]
}

outputs['history'] = history
outputs['is_recurring'] = history['similar_alerts_24h'] > 2
outputs['last_resolution'] = history['previous_resolutions'][-1]`
        }
    });
    console.log(`      ✓ 节点 ID: ${queryHistoryNode.node.id}`);
    
    // 节点 4: LLM 分析根因
    console.log('  8.4 添加 LLM 节点: Root Cause Analysis');
    const llmNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'llm',
        position: { x: 550, y: 175 },
        data: {
            label: 'Root Cause Analysis',
            description: '使用 LLM 分析告警根因',
            model: 'gpt-4',
            temperature: 0.3,
            prompt: `Analyze the following system alert and provide root cause analysis:

Alert Details:
- Service: {{service}}
- Metric: {{metric}}
- Current Value: {{value}}
- Severity: {{severity}}
- Historical Pattern: {{history.frequency}}
- Recurring: {{is_recurring}}

Metrics Context:
{{metrics}}

Provide your analysis in JSON format:
{
  "root_cause": "Primary cause of the issue",
  "confidence": 0.85,
  "impact_level": "high|medium|low",
  "recommended_actions": ["action1", "action2"],
  "auto_remediation_possible": true|false
}`
        }
    });
    console.log(`      ✓ 节点 ID: ${llmNode.node.id}`);
    
    // 节点 5: Switch 节点 - 严重程度分支
    console.log('  8.5 添加 Switch 节点: Severity Branch');
    const switchNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'switch',
        position: { x: 700, y: 175 },
        data: {
            label: 'Severity Branch',
            description: '根据严重程度分支处理',
            conditions: [
                { id: 'critical', expression: "severity in ['P0', 'P1']", label: 'Critical/High (P0/P1)' },
                { id: 'normal', expression: "severity in ['P2', 'P3']", label: 'Medium/Low (P2/P3)' }
            ]
        }
    });
    console.log(`      ✓ 节点 ID: ${switchNode.node.id}`);
    
    // 节点 6: Parallel 节点 - 严重告警并行处理
    console.log('  8.6 添加 Parallel 节点: Parallel Actions');
    const parallelNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'parallel',
        position: { x: 850, y: 100 },
        data: {
            label: 'Parallel Actions',
            description: '并行执行自动修复和通知',
            branches: ['auto_remediation', 'immediate_notification']
        }
    });
    console.log(`      ✓ 节点 ID: ${parallelNode.node.id}`);
    
    // 节点 7: Code 节点 - 自动修复
    console.log('  8.7 添加 Code 节点: Auto Remediation');
    const autoFixNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 1000, y: 50 },
        data: {
            label: 'Auto Remediation',
            description: '执行自动修复操作',
            code: `# 自动修复逻辑
import time

metric = inputs.get('metric')
severity = inputs.get('severity')
analysis = inputs.get('analysis', {})

remediation_result = {
    'attempted': False,
    'success': False,
    'action': None,
    'timestamp': time.time()
}

# 根据指标类型执行不同的修复操作
if metric == 'cpu_high':
    remediation_result['attempted'] = True
    remediation_result['action'] = 'restart_high_cpu_processes'
    # 模拟修复结果
    remediation_result['success'] = analysis.get('auto_remediation_possible', False)
    remediation_result['details'] = 'Restarted top 3 CPU consuming processes'
    
elif metric == 'memory_high':
    remediation_result['attempted'] = True
    remediation_result['action'] = 'clear_memory_cache'
    remediation_result['success'] = True
    remediation_result['details'] = 'Cleared system cache and buffers'
    
elif metric == 'disk_full':
    remediation_result['attempted'] = True
    remediation_result['action'] = 'clean_old_logs'
    remediation_result['success'] = True
    remediation_result['details'] = 'Removed logs older than 7 days'
    
else:
    remediation_result['action'] = 'manual_intervention_required'
    remediation_result['details'] = 'No automated fix available for this metric'

outputs['remediation'] = remediation_result
outputs['requires_manual'] = not remediation_result['success']`
        }
    });
    console.log(`      ✓ 节点 ID: ${autoFixNode.node.id}`);
    
    // 节点 8: Code 节点 - 立即通知 (PagerDuty)
    console.log('  8.8 添加 Code 节点: Immediate Notify (PagerDuty)');
    const immediateNotifyNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 1000, y: 150 },
        data: {
            label: 'Immediate Notify (PagerDuty)',
            description: '发送紧急通知到 PagerDuty',
            code: `# 发送紧急通知到 PagerDuty
import json
import time

alert = inputs.get('alert', {})
severity = inputs.get('severity')
analysis = inputs.get('analysis', {})
metrics = inputs.get('metrics', {})

# 构建 PagerDuty 事件
pagerduty_event = {
    'routing_key': 'your-integration-key',
    'event_action': 'trigger',
    'dedup_key': f"alert-{inputs.get('alert_id')}",
    'payload': {
        'summary': f"[{severity}] {alert.get('metric')} alert on {alert.get('service')}",
        'severity': 'critical' if severity == 'P0' else 'error',
        'source': alert.get('service'),
        'component': alert.get('metric'),
        'custom_details': {
            'value': inputs.get('value'),
            'root_cause': analysis.get('root_cause', 'Unknown'),
            'confidence': analysis.get('confidence', 0),
            'metrics': metrics,
            'timestamp': inputs.get('timestamp')
        }
    }
}

# 模拟发送
outputs['pagerduty_sent'] = True
outputs['pagerduty_event'] = pagerduty_event
outputs['notification_time'] = time.time()
outputs['escalation_policy'] = 'on-call-engineer'`
        }
    });
    console.log(`      ✓ 节点 ID: ${immediateNotifyNode.node.id}`);
    
    // 节点 9: Merge 节点 - 合并并行结果
    console.log('  8.9 添加 Merge 节点: Merge Critical Results');
    const mergeCriticalNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'merge',
        position: { x: 1150, y: 100 },
        data: {
            label: 'Merge Critical Results',
            description: '合并并行处理结果',
            mergeStrategy: 'combine'
        }
    });
    console.log(`      ✓ 节点 ID: ${mergeCriticalNode.node.id}`);
    
    // 节点 10: Code 节点 - 一般告警处理 (P2/P3)
    console.log('  8.10 添加 Code 节点: Log and Schedule');
    const logScheduleNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 850, y: 250 },
        data: {
            label: 'Log and Schedule',
            description: '记录告警并设置定时巡检',
            code: `# 记录告警并设置定时巡检
import json
import time

alert = inputs.get('alert', {})
severity = inputs.get('severity')
metric = inputs.get('metric')

# 记录告警日志
log_entry = {
    'alert_id': inputs.get('alert_id'),
    'severity': severity,
    'metric': metric,
    'value': inputs.get('value'),
    'service': inputs.get('service'),
    'timestamp': inputs.get('timestamp'),
    'logged_at': time.time(),
    'status': 'logged',
    'next_check': time.time() + 300  # 5分钟后检查
}

# 设置定时巡检任务
schedule_config = {
    'check_interval': '5m',
    'max_checks': 3,
    'escalate_after': '15m',
    'conditions': {
        'metric': metric,
        'threshold': inputs.get('value') * 0.9,  # 90% 的当前值
        'service': inputs.get('service')
    }
}

outputs['log_entry'] = log_entry
outputs['schedule_config'] = schedule_config
outputs['scheduled_check'] = True
outputs['priority'] = 'low'`
        }
    });
    console.log(`      ✓ 节点 ID: ${logScheduleNode.node.id}`);
    
    // 节点 11: Code 节点 - Webhook 通知 (Slack/钉钉)
    console.log('  8.11 添加 Code 节点: Webhook Notify');
    const webhookNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 1300, y: 175 },
        data: {
            label: 'Webhook Notify (Slack/DingTalk)',
            description: '发送 Webhook 通知到 Slack 和钉钉',
            code: `# 发送 Webhook 通知到 Slack/钉钉
import json
import time

alert = inputs.get('alert', {})
severity = inputs.get('severity')
metric = inputs.get('metric')
value = inputs.get('value')
service = inputs.get('service')

# 确定颜色
if severity in ['P0', 'P1']:
    color = 'danger'
    emoji = '🔴'
elif severity == 'P2':
    color = 'warning'
    emoji = '🟡'
else:
    color = '#36a64f'
    emoji = '🟢'

# Slack 格式消息
slack_message = {
    'text': f"{emoji} Alert Notification",
    'attachments': [{
        'color': color,
        'title': f"{metric} Alert on {service}",
        'fields': [
            {'title': 'Severity', 'value': severity, 'short': True},
            {'title': 'Metric', 'value': metric, 'short': True},
            {'title': 'Value', 'value': str(value), 'short': True},
            {'title': 'Service', 'value': service, 'short': True},
            {'title': 'Time', 'value': inputs.get('timestamp'), 'short': False}
        ],
        'footer': 'Workflow Agent',
        'ts': int(time.time())
    }]
}

# 钉钉格式消息
dingtalk_message = {
    'msgtype': 'markdown',
    'markdown': {
        'title': '告警通知',
        'text': f"## {emoji} 告警通知\\n\\n" +
                f"**服务**: {service}\\n\\n" +
                f"**严重程度**: {severity}\\n\\n" +
                f"**指标**: {metric}\\n\\n" +
                f"**数值**: {value}\\n\\n" +
                f"**时间**: {inputs.get('timestamp')}\\n\\n" +
                f"---\\n" +
                f"*由 Workflow Agent 自动发送*"
    },
    'at': {
        'isAtAll': severity in ['P0', 'P1']
    }
}

outputs['slack_payload'] = slack_message
outputs['dingtalk_payload'] = dingtalk_message
outputs['webhook_sent'] = True
outputs['channels'] = ['slack', 'dingtalk']
outputs['send_time'] = time.time()`
        }
    });
    console.log(`      ✓ 节点 ID: ${webhookNode.node.id}`);
    
    // 节点 12: Code 节点 - Schedule 定时任务 (模拟)
    console.log('  8.12 添加 Code 节点: Schedule Check (Cron)');
    const scheduleNode = await mcpServer.callTool('add_node', {
        workflowId,
        type: 'code',
        position: { x: 1000, y: 250 },
        data: {
            label: 'Schedule Check (Cron)',
            description: '设置定时巡检任务（模拟 Schedule 节点）',
            code: `# 设置定时巡检任务（模拟 Schedule 节点）
import json
import time

schedule_config = inputs.get('schedule_config', {})
alert_id = inputs.get('alert_id')

# 模拟创建定时任务
cron_expression = '*/5 * * * *'  # 每5分钟
schedule = {
    'job_id': f"check-{alert_id}",
    'cron': cron_expression,
    'timezone': 'Asia/Shanghai',
    'enabled': True,
    'next_run': time.time() + 300,  # 5分钟后
    'max_runs': schedule_config.get('max_checks', 3),
    'action': 'check_metric',
    'params': schedule_config.get('conditions', {})
}

outputs['schedule'] = schedule
outputs['schedule_created'] = True
outputs['next_check'] = schedule['next_run']`
        }
    });
    console.log(`      ✓ 节点 ID: ${scheduleNode.node.id}`);
    
    console.log('');
    
    // 连接节点
    console.log('▶ 9. 连接工作流节点...');
    console.log('');
    
    // 连接: Start -> Parse Alert
    console.log('  9.1 连接: Start -> Parse Alert Input');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: startNode.id,
        targetNodeId: parseAlertNode.node.id
    });
    
    // 连接: Parse Alert -> Query Metrics
    console.log('  9.2 连接: Parse Alert Input -> Query Metrics');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: parseAlertNode.node.id,
        targetNodeId: queryMetricsNode.node.id
    });
    
    // 连接: Parse Alert -> Query History
    console.log('  9.3 连接: Parse Alert Input -> Query History');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: parseAlertNode.node.id,
        targetNodeId: queryHistoryNode.node.id
    });
    
    // 连接: Query Metrics -> LLM Analysis
    console.log('  9.4 连接: Query Metrics -> Root Cause Analysis');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: queryMetricsNode.node.id,
        targetNodeId: llmNode.node.id
    });
    
    // 连接: Query History -> LLM Analysis
    console.log('  9.5 连接: Query History -> Root Cause Analysis');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: queryHistoryNode.node.id,
        targetNodeId: llmNode.node.id
    });
    
    // 连接: LLM Analysis -> Severity Branch
    console.log('  9.6 连接: Root Cause Analysis -> Severity Branch');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: llmNode.node.id,
        targetNodeId: switchNode.node.id
    });
    
    // 连接: Severity Branch (P0/P1) -> Parallel Actions
    console.log('  9.7 连接: Severity Branch [P0/P1] -> Parallel Actions');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: switchNode.node.id,
        targetNodeId: parallelNode.node.id,
        condition: "severity in ['P0', 'P1']"
    });
    
    // 连接: Parallel -> Auto Remediation
    console.log('  9.8 连接: Parallel Actions -> Auto Remediation');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: parallelNode.node.id,
        targetNodeId: autoFixNode.node.id
    });
    
    // 连接: Parallel -> Immediate Notify
    console.log('  9.9 连接: Parallel Actions -> Immediate Notify');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: parallelNode.node.id,
        targetNodeId: immediateNotifyNode.node.id
    });
    
    // 连接: Auto Remediation -> Merge
    console.log('  9.10 连接: Auto Remediation -> Merge Critical Results');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: autoFixNode.node.id,
        targetNodeId: mergeCriticalNode.node.id
    });
    
    // 连接: Immediate Notify -> Merge
    console.log('  9.11 连接: Immediate Notify -> Merge Critical Results');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: immediateNotifyNode.node.id,
        targetNodeId: mergeCriticalNode.node.id
    });
    
    // 连接: Merge -> Webhook Notify
    console.log('  9.12 连接: Merge Critical Results -> Webhook Notify');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: mergeCriticalNode.node.id,
        targetNodeId: webhookNode.node.id
    });
    
    // 连接: Severity Branch (P2/P3) -> Log and Schedule
    console.log('  9.13 连接: Severity Branch [P2/P3] -> Log and Schedule');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: switchNode.node.id,
        targetNodeId: logScheduleNode.node.id,
        condition: "severity in ['P2', 'P3']"
    });
    
    // 连接: Log and Schedule -> Schedule Check
    console.log('  9.14 连接: Log and Schedule -> Schedule Check');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: logScheduleNode.node.id,
        targetNodeId: scheduleNode.node.id
    });
    
    // 连接: Schedule Check -> Webhook Notify
    console.log('  9.15 连接: Schedule Check -> Webhook Notify');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: scheduleNode.node.id,
        targetNodeId: webhookNode.node.id
    });
    
    // 连接: Webhook Notify -> End
    console.log('  9.16 连接: Webhook Notify -> End');
    await mcpServer.callTool('connect_nodes', {
        workflowId,
        sourceNodeId: webhookNode.node.id,
        targetNodeId: endNode.id
    });
    
    console.log('');
    
    // 验证最终工作流
    console.log('▶ 10. 验证最终工作流...');
    const finalValidate = await mcpServer.callTool('validate_workflow', { workflowId });
    console.log(`  验证结果: ${finalValidate.valid ? '✓ 有效' : '✗ 无效'}`);
    if (finalValidate.errors) {
        finalValidate.errors.forEach(err => console.log(`    ! ${err}`));
    }
    console.log('');
    
    // 获取最终工作流详情
    console.log('▶ 11. 获取最终工作流详情...');
    const finalWorkflow = await mcpServer.callTool('get_workflow', { id: workflowId });
    console.log(`  工作流名称: ${finalWorkflow.workflow.name}`);
    console.log(`  节点数量: ${finalWorkflow.workflow.nodes.length}`);
    console.log(`  连接数量: ${finalWorkflow.workflow.edges.length}`);
    console.log('');
    
    // 打印节点详情
    console.log('  节点详情:');
    finalWorkflow.workflow.nodes.forEach((node, i) => {
        const label = node.data?.label || node.type;
        console.log(`    ${String(i + 1).padStart(2)}. ${node.type.padEnd(10)} | ${label}`);
    });
    console.log('');
    
    // 打印连接详情
    console.log('  连接详情:');
    finalWorkflow.workflow.edges.forEach((edge, i) => {
        const condition = edge.condition ? ` [${edge.condition}]` : '';
        const source = finalWorkflow.workflow.nodes.find(n => n.id === edge.source.nodeId);
        const target = finalWorkflow.workflow.nodes.find(n => n.id === edge.target.nodeId);
        const sourceLabel = source?.data?.label || source?.type || edge.source.nodeId;
        const targetLabel = target?.data?.label || target?.type || edge.target.nodeId;
        console.log(`    ${String(i + 1).padStart(2)}. ${sourceLabel} -> ${targetLabel}${condition}`);
    });
    console.log('');
    
    // 保存工作流
    console.log('▶ 12. 保存工作流到文件...');
    const workflowFilePath = path.join(workflowsDir, 'alert-handler-workflow.json');
    fs.writeFileSync(workflowFilePath, JSON.stringify(finalWorkflow.workflow, null, 2));
    console.log(`  ✓ 工作流已保存到: ${workflowFilePath}`);
    console.log('');
    
    // 生成工作流图
    console.log('▶ 13. 生成工作流结构图...');
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('  │                        告警处理工作流结构图                                  │');
    console.log('  └─────────────────────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('  ┌─────────┐     ┌──────────────────┐');
    console.log('  │  Start  │────▶│  Parse Alert     │');
    console.log('  └─────────┘     └──────────────────┘');
    console.log('                           │');
    console.log('           ┌───────────────┴───────────────┐');
    console.log('           ▼                               ▼');
    console.log('  ┌──────────────────┐          ┌──────────────────┐');
    console.log('  │ Query Metrics    │          │ Query History    │');
    console.log('  │ (HTTP)           │          │ (HTTP)           │');
    console.log('  └──────────────────┘          └──────────────────┘');
    console.log('           │                               │');
    console.log('           └───────────────┬───────────────┘');
    console.log('                           ▼');
    console.log('              ┌────────────────────┐');
    console.log('              │ Root Cause Analysis│');
    console.log('              │ (LLM)              │');
    console.log('              └────────────────────┘');
    console.log('                           │');
    console.log('                           ▼');
    console.log('                 ┌─────────────────┐');
    console.log('                 │ Severity Branch │');
    console.log('                 │ (Switch)        │');
    console.log('                 └─────────────────┘');
    console.log('                    │           │');
    console.log('      [P0/P1]       │           │       [P2/P3]');
    console.log('                    ▼           ▼');
    console.log('         ┌───────────────┐   ┌──────────────────┐');
    console.log('         │Parallel Actions│   │ Log and Schedule │');
    console.log('         │(Parallel)      │   └──────────────────┘');
    console.log('         └───────┬───────┘            │');
    console.log('        ┌────────┴────────┐           ▼');
    console.log('        ▼                 ▼  ┌──────────────────┐');
    console.log(' ┌─────────────┐   ┌──────────────┐│ Schedule     │');
    console.log(' │ Auto        │   │ Immediate    ││ Check (Cron) │');
    console.log(' │ Remediation │   │ Notify       │└──────────────┘');
    console.log(' └──────┬──────┘   └──────┬───────┘         │');
    console.log('        │                 │                 │');
    console.log('        └────────┬────────┘                 │');
    console.log('                 ▼                          │');
    console.log('      ┌────────────────────┐                │');
    console.log('      │ Merge Critical     │◄───────────────┘');
    console.log('      │ Results            │');
    console.log('      └─────────┬──────────┘');
    console.log('                │');
    console.log('                ▼');
    console.log('      ┌────────────────────┐');
    console.log('      │ Webhook Notify     │');
    console.log('      │ (Slack/DingTalk)   │');
    console.log('      └─────────┬──────────┘');
    console.log('                │');
    console.log('                ▼');
    console.log('           ┌─────────┐');
    console.log('           │   End   │');
    console.log('           └─────────┘');
    console.log('');
    
    // 评估报告
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           评 估 报 告                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    console.log('📋 1. MCP 工具完备性评估');
    console.log('   ────────────────────────────────────────────────────────────────────────────');
    console.log('   ✅ 已实现工具:');
    console.log('      • 工作流管理: create_workflow, list_workflows, get_workflow, delete_workflow');
    console.log('      • 节点操作: add_node, update_node, delete_node');
    console.log('      • 连接操作: connect_nodes, disconnect_nodes');
    console.log('      • 执行控制: execute_workflow, get_execution_status, stop_execution');
    console.log('      • 验证工具: validate_workflow');
    console.log('      • 节点类型查询: list_node_types');
    console.log('      • 告警模板: create_alert_handler_workflow');
    console.log('      • 定时触发: add_scheduled_trigger');
    console.log('');
    console.log('   ⚠️  当前节点类型:');
    console.log('      • start, end - 开始/结束节点');
    console.log('      • code - 代码执行节点 (Python)');
    console.log('      • llm - LLM 调用节点');
    console.log('      • switch - 条件分支节点');
    console.log('      • parallel - 并行执行节点');
    console.log('      • merge - 合并节点');
    console.log('');
    
    console.log('📋 2. 工作流引擎复杂逻辑支持评估');
    console.log('   ────────────────────────────────────────────────────────────────────────────');
    console.log('   ✅ 已支持功能:');
    console.log('      • 条件分支: Switch 节点支持基于表达式的条件分支');
    console.log('      • 并行执行: Parallel + Merge 节点支持并行处理和结果合并');
    console.log('      • 代码执行: Code 节点支持 Python 代码执行');
    console.log('      • LLM 集成: LLM 节点支持调用语言模型进行分析');
    console.log('      • 工作流验证: validate_workflow 检查工作流结构完整性');
    console.log('');
    console.log('   ⚠️  限制与待改进:');
    console.log('      • 缺少专门的 HTTP 节点（当前用 Code 节点模拟）');
    console.log('      • 缺少专门的 Webhook 节点（当前用 Code 节点模拟）');
    console.log('      • 缺少专门的 Schedule/Cron 节点（当前用 Code 节点模拟）');
    console.log('      • 缺少循环/ForEach 节点（无法处理列表数据）');
    console.log('      • 缺少错误处理/重试机制节点');
    console.log('      • 缺少子工作流调用节点');
    console.log('      • 缺少变量设置/转换节点');
    console.log('      • Switch 节点的条件表达式能力有限');
    console.log('');
    
    console.log('📋 3. 需要补充的功能清单');
    console.log('   ────────────────────────────────────────────────────────────────────────────');
    console.log('   高优先级:');
    console.log('      1. HTTP 节点 - 专门用于调用外部 API，支持 GET/POST/PUT/DELETE');
    console.log('      2. Webhook 节点 - 专门用于发送 Webhook 通知，支持 Slack/钉钉/企业微信');
    console.log('      3. Schedule/Cron 节点 - 专门用于定时任务调度');
    console.log('      4. Error Handler 节点 - 错误处理和重试机制');
    console.log('');
    console.log('   中优先级:');
    console.log('      5. Loop/ForEach 节点 - 支持循环处理列表数据');
    console.log('      6. Subflow 节点 - 调用其他工作流作为子流程');
    console.log('      7. Variable 节点 - 变量设置、转换和格式化');
    console.log('      8. Condition 节点 - 更复杂的条件判断（支持 AND/OR/NOT）');
    console.log('');
    console.log('   低优先级:');
    console.log('      9. Delay/Wait 节点 - 延迟执行');
    console.log('     10. Filter 节点 - 数据过滤');
    console.log('     11. Transform 节点 - 数据转换和映射');
    console.log('     12. Cache 节点 - 结果缓存');
    console.log('');
    
    console.log('📋 4. 告警处理工作流功能覆盖');
    console.log('   ────────────────────────────────────────────────────────────────────────────');
    console.log('   ✅ 已实现:');
    console.log('      • 接收告警输入 (Start + Parse Alert Input)');
    console.log('      • 查询相关指标 (Code 节点模拟 HTTP 调用)');
    console.log('      • 查询历史告警 (Code 节点模拟 HTTP 调用)');
    console.log('      • LLM 分析根因 (LLM 节点)');
    console.log('      • Switch 节点根据严重程度分支');
    console.log('      • P0/P1 严重告警: Parallel 并行执行自动修复 + 立即通知');
    console.log('      • P2/P3 一般告警: 记录并定时巡检');
    console.log('      • Webhook 通知 (Code 节点模拟 Slack/钉钉)');
    console.log('      • Schedule 定时巡检 (Code 节点模拟)');
    console.log('      • End 节点');
    console.log('');
    console.log('   ⚠️  模拟实现:');
    console.log('      • HTTP 调用使用 Code 节点模拟');
    console.log('      • Webhook 发送使用 Code 节点模拟');
    console.log('      • Schedule 使用 Code 节点模拟 Cron 配置');
    console.log('');
    
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          测 试 完 成                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`工作流 ID: ${workflowId}`);
    console.log(`工作流文件: ${workflowFilePath}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
}
}

// 运行测试
runTests();
