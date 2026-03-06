import * as vscode from 'vscode';

export class WorkflowOutputChannel {
    private outputChannel: vscode.OutputChannel;
    private static instance: WorkflowOutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Workflow Agent', 'json');
    }

    static getInstance(): WorkflowOutputChannel {
        if (!WorkflowOutputChannel.instance) {
            WorkflowOutputChannel.instance = new WorkflowOutputChannel();
        }
        return WorkflowOutputChannel.instance;
    }

    show(): void {
        this.outputChannel.show();
    }

    log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    logWorkflowStart(workflowId: string, workflowName: string): void {
        this.log(`▶️ 开始执行工作流: ${workflowName} (${workflowId})`);
    }

    logNodeStart(nodeId: string, nodeType: string, nodeName: string): void {
        this.log(`  [节点:${nodeId}] 开始执行: ${nodeName} (${nodeType})`);
    }

    logNodeComplete(nodeId: string, nodeType: string, duration: number, output: any): void {
        this.log(`  [节点:${nodeId}] ✓ 执行完成 (${duration}ms)`);
        if (output !== undefined) {
            this.log(`    输出: ${JSON.stringify(output, null, 2).substring(0, 200)}...`);
        }
    }

    logNodeError(nodeId: string, nodeType: string, error: string): void {
        this.log(`  [节点:${nodeId}] ✗ 执行失败: ${error}`);
    }

    logWorkflowComplete(workflowId: string, success: boolean, duration: number): void {
        const status = success ? '✓ 成功' : '✗ 失败';
        this.log(`⏹ 工作流执行结束: ${status} (总耗时: ${duration}ms)`);
        this.log('─'.repeat(50));
    }

    logDataFlow(fromNode: string, toNode: string, data: any): void {
        this.log(`  [数据流] ${fromNode} → ${toNode}`);
        this.log(`    数据: ${JSON.stringify(data, null, 2).substring(0, 150)}...`);
    }

    clear(): void {
        this.outputChannel.clear();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
