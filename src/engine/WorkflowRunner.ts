import * as vscode from 'vscode';
import {
  Workflow,
  Node,
  Edge,
  ExecutionContext,
  WorkflowExecutionResult,
  NodeExecutionResult,
  ExecutionStatus
} from './types';
import { WorkflowEngine } from './WorkflowEngine';
import { executorFactory } from './executor';

/**
 * 工作流执行器
 * 负责执行工作流，管理节点执行顺序和状态
 */
export class WorkflowRunner {
  private executionStatus: ExecutionStatus = ExecutionStatus.PENDING;
  private abortController: AbortController | null = null;
  private nodeResults: Map<string, NodeExecutionResult> = new Map();
  private outputChannel: vscode.OutputChannel;

  constructor(
    private engine: WorkflowEngine,
    private context: vscode.ExtensionContext
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Workflow Agent');
  }

  /**
   * 执行工作流
   */
  async execute(
    workflow?: Workflow,
    initialInputs: Record<string, unknown> = {}
  ): Promise<WorkflowExecutionResult> {
    const wf = workflow || this.engine.getCurrentWorkflow();
    
    if (!wf) {
      throw new Error('No workflow to execute');
    }

    const executionId = this.generateExecutionId();
    const startTime = new Date();
    
    this.executionStatus = ExecutionStatus.RUNNING;
    this.abortController = new AbortController();
    this.nodeResults.clear();

    this.outputChannel.appendLine(`[${startTime.toISOString()}] Starting workflow execution: ${wf.name} (${executionId})`);

    const executionContext: ExecutionContext = {
      workflowId: wf.id,
      executionId,
      variables: new Map(),
      nodeOutputs: new Map(),
      startTime,
      metadata: {}
    };

    try {
      // 获取拓扑排序的执行顺序
      const executionOrder = this.engine.getTopologicalOrder();
      
      // 执行每个节点
      for (const nodeId of executionOrder) {
        // 检查是否被取消
        if (this.abortController.signal.aborted) {
          throw new Error('Execution cancelled');
        }

        const node = wf.nodes.find(n => n.id === nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found`);
        }

        // 收集输入
        const inputs = await this.collectNodeInputs(node, executionContext);
        
        // 执行节点
        this.outputChannel.appendLine(`Executing node: ${node.metadata.name} (${node.type})`);
        const result = await this.executeNode(node, executionContext, inputs);
        
        // 存储结果
        this.nodeResults.set(nodeId, result);
        executionContext.nodeOutputs.set(nodeId, result.output);

        if (!result.success) {
          throw result.error || new Error(`Node ${nodeId} execution failed`);
        }

        this.outputChannel.appendLine(`Node completed: ${node.metadata.name}`);
      }

      const endTime = new Date();
      this.executionStatus = ExecutionStatus.COMPLETED;

      // 找到结束节点的输出作为最终结果
      const endNode = wf.nodes.find(n => n.type === 'end');
      const finalOutput = endNode ? executionContext.nodeOutputs.get(endNode.id) : undefined;

      this.outputChannel.appendLine(`[${endTime.toISOString()}] Workflow execution completed: ${wf.name}`);

      return {
        success: true,
        executionId,
        output: finalOutput,
        nodeResults: this.nodeResults,
        startTime,
        endTime
      };

    } catch (error) {
      const endTime = new Date();
      this.executionStatus = ExecutionStatus.FAILED;
      
      this.outputChannel.appendLine(`[${endTime.toISOString()}] Workflow execution failed: ${error}`);

      return {
        success: false,
        executionId,
        error: error as Error,
        nodeResults: this.nodeResults,
        startTime,
        endTime
      };
    }
  }

  /**
   * 收集节点的输入数据
   */
  private async collectNodeInputs(
    node: Node,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const inputs: Record<string, unknown> = {};
    
    // 获取所有输入边
    const incomingEdges = this.engine.getIncomingEdges(node.id);
    
    for (const edge of incomingEdges) {
      const sourceOutput = context.nodeOutputs.get(edge.source.nodeId);
      
      // 如果有端口映射，处理映射关系
      if (edge.source.portId && edge.target.portId) {
        // 简化处理：直接使用源节点的输出
        Object.assign(inputs, this.ensureObject(sourceOutput));
      } else {
        // 合并所有输入
        Object.assign(inputs, this.ensureObject(sourceOutput));
      }
    }

    return inputs;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const executor = executorFactory.get(node.type);
    return await executor.execute(node, context, inputs);
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.executionStatus = ExecutionStatus.CANCELLED;
      this.outputChannel.appendLine('Workflow execution cancelled by user');
    }
  }

  /**
   * 暂停执行
   */
  pause(): void {
    if (this.executionStatus === ExecutionStatus.RUNNING) {
      this.executionStatus = ExecutionStatus.PAUSED;
      this.outputChannel.appendLine('Workflow execution paused');
    }
  }

  /**
   * 恢复执行
   */
  resume(): void {
    if (this.executionStatus === ExecutionStatus.PAUSED) {
      this.executionStatus = ExecutionStatus.RUNNING;
      this.outputChannel.appendLine('Workflow execution resumed');
    }
  }

  /**
   * 获取执行状态
   */
  getStatus(): ExecutionStatus {
    return this.executionStatus;
  }

  /**
   * 获取节点执行结果
   */
  getNodeResult(nodeId: string): NodeExecutionResult | undefined {
    return this.nodeResults.get(nodeId);
  }

  /**
   * 生成执行ID
   */
  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `exec_${timestamp}_${random}`;
  }

  /**
   * 确保值为对象
   */
  private ensureObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
