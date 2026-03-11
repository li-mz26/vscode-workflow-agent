import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  Workflow,
  Node,
  Edge,
  NodeType,
  ExecutionContext,
  WorkflowExecutionResult,
  NodeExecutionResult,
  ExecutionStatus,
  WorkflowChangeEvent,
  JSONSchema
} from './types';

/**
 * 工作流引擎核心类
 * 提供工作流的加载、验证、编辑和执行功能
 */
export class WorkflowEngine {
  private currentWorkflow: Workflow | null = null;
  private workflowPath: string | null = null;
  private changeListeners: ((event: WorkflowChangeEvent) => void)[] = [];
  private executionStatus: ExecutionStatus = ExecutionStatus.PENDING;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * 从文件加载工作流
   */
  async loadWorkflow(workflowJsonPath: string): Promise<Workflow> {
    const content = await fs.promises.readFile(workflowJsonPath, 'utf-8');
    const workflow = JSON.parse(content) as Workflow;
    
    // 验证工作流
    this.validateWorkflow(workflow);
    
    this.currentWorkflow = workflow;
    this.workflowPath = workflowJsonPath;
    
    return workflow;
  }

  /**
   * 保存工作流到文件
   */
  async saveWorkflow(workflow?: Workflow, filePath?: string): Promise<void> {
    const wf = workflow || this.currentWorkflow;
    const fp = filePath || this.workflowPath;
    
    if (!wf || !fp) {
      throw new Error('No workflow or path specified');
    }

    // 确保目录存在
    const dir = path.dirname(fp);
    await fs.promises.mkdir(dir, { recursive: true });

    await fs.promises.writeFile(fp, JSON.stringify(wf, null, 2), 'utf-8');
  }

  /**
   * 创建新工作流
   */
  createWorkflow(name: string, description?: string): Workflow {
    const workflow: Workflow = {
      id: this.generateId('wf'),
      name,
      description: description || '',
      version: '1.0.0',
      nodes: [],
      edges: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    // 自动添加开始节点
    const startNode = this.createNode('start', { x: 100, y: 100 });
    workflow.nodes.push(startNode);

    // 自动添加结束节点
    const endNode = this.createNode('end', { x: 500, y: 100 });
    workflow.nodes.push(endNode);

    this.currentWorkflow = workflow;
    return workflow;
  }

  /**
   * 创建新节点
   */
  createNode(type: NodeType, position: { x: number; y: number }): Node {
    const id = this.generateId('node');
    
    const baseNode: Node = {
      id,
      type,
      position,
      configRef: `nodes/${id}_${type}.json`,
      inputs: {},
      outputs: {},
      metadata: {
        name: this.getDefaultNodeName(type),
        description: ''
      },
      data: {}
    };

    // 根据类型设置默认输入输出
    switch (type) {
      case 'start':
        baseNode.outputs = { trigger: 'object', data: 'object' };
        break;
      case 'end':
        baseNode.inputs = { input: 'object' };
        break;
      case 'code':
        baseNode.inputs = { input: 'object' };
        baseNode.outputs = { output: 'object' };
        break;
      case 'llm':
        baseNode.inputs = { prompt: 'string', context: 'object' };
        baseNode.outputs = { response: 'string', structured: 'object' };
        break;
      case 'switch':
        baseNode.inputs = { input: 'object' };
        baseNode.outputs = { branch1: 'object', branch2: 'object', default: 'object' };
        baseNode.data = { branches: [], defaultBranch: 'default' };
        break;
      case 'parallel':
        baseNode.inputs = { input: 'object' };
        baseNode.outputs = { results: 'array' };
        break;
    }

    return baseNode;
  }

  /**
   * 添加节点到工作流
   */
  addNode(node: Node): void {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }

    this.currentWorkflow.nodes.push(node);
    this.notifyChange({ type: 'nodeAdded', nodeId: node.id });
  }

  /**
   * 移除节点
   */
  removeNode(nodeId: string): void {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }

    // 移除节点
    this.currentWorkflow.nodes = this.currentWorkflow.nodes.filter(n => n.id !== nodeId);
    
    // 移除相关边
    this.currentWorkflow.edges = this.currentWorkflow.edges.filter(
      e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
    );

    this.notifyChange({ type: 'nodeRemoved', nodeId });
  }

  /**
   * 更新节点
   */
  updateNode(nodeId: string, updates: Partial<Node>): void {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }

    const node = this.currentWorkflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    Object.assign(node, updates);
    this.notifyChange({ type: 'nodeUpdated', nodeId, data: updates });
  }

  /**
   * 添加边
   */
  addEdge(edge: Edge): void {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }

    // 检查是否形成环
    if (this.wouldCreateCycle(edge)) {
      throw new Error('Adding this edge would create a cycle');
    }

    this.currentWorkflow.edges.push(edge);
    this.notifyChange({ type: 'edgeAdded', edgeId: edge.id });
  }

  /**
   * 移除边
   */
  removeEdge(edgeId: string): void {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }

    this.currentWorkflow.edges = this.currentWorkflow.edges.filter(e => e.id !== edgeId);
    this.notifyChange({ type: 'edgeRemoved', edgeId });
  }

  /**
   * 获取当前工作流
   */
  getCurrentWorkflow(): Workflow | null {
    return this.currentWorkflow;
  }

  /**
   * 获取节点的输入边
   */
  getIncomingEdges(nodeId: string): Edge[] {
    if (!this.currentWorkflow) return [];
    return this.currentWorkflow.edges.filter(e => e.target.nodeId === nodeId);
  }

  /**
   * 获取节点的输出边
   */
  getOutgoingEdges(nodeId: string): Edge[] {
    if (!this.currentWorkflow) return [];
    return this.currentWorkflow.edges.filter(e => e.source.nodeId === nodeId);
  }

  /**
   * 验证工作流
   */
  validateWorkflow(workflow: Workflow): string[] {
    const errors: string[] = [];

    // 检查必需字段
    if (!workflow.id) errors.push('Workflow ID is required');
    if (!workflow.name) errors.push('Workflow name is required');
    if (!Array.isArray(workflow.nodes)) errors.push('Nodes must be an array');
    if (!Array.isArray(workflow.edges)) errors.push('Edges must be an array');

    // 检查节点ID唯一性
    const nodeIds = new Set<string>();
    for (const node of workflow.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 检查边引用的节点是否存在
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source.nodeId)) {
        errors.push(`Edge references unknown source node: ${edge.source.nodeId}`);
      }
      if (!nodeIds.has(edge.target.nodeId)) {
        errors.push(`Edge references unknown target node: ${edge.target.nodeId}`);
      }
    }

    // 检查是否有开始节点
    const hasStart = workflow.nodes.some(n => n.type === 'start');
    if (!hasStart) {
      errors.push('Workflow must have at least one start node');
    }

    // 检查DAG（无环）
    if (this.hasCycle(workflow)) {
      errors.push('Workflow contains cycles');
    }

    return errors;
  }

  /**
   * 检查是否会形成环
   */
  private wouldCreateCycle(newEdge: Edge): boolean {
    if (!this.currentWorkflow) return false;

    // 临时添加边并检查
    const tempEdges = [...this.currentWorkflow.edges, newEdge];
    return this.detectCycle(this.currentWorkflow.nodes, tempEdges);
  }

  /**
   * 检查工作流是否有环
   */
  private hasCycle(workflow: Workflow): boolean {
    return this.detectCycle(workflow.nodes, workflow.edges);
  }

  /**
   * 检测环（DFS算法）
   */
  private detectCycle(nodes: Node[], edges: Edge[]): boolean {
    const adjacencyList = new Map<string, string[]>();
    
    // 构建邻接表
    for (const node of nodes) {
      adjacencyList.set(node.id, []);
    }
    for (const edge of edges) {
      const neighbors = adjacencyList.get(edge.source.nodeId) || [];
      neighbors.push(edge.target.nodeId);
      adjacencyList.set(edge.source.nodeId, neighbors);
    }

    // DFS检测环
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  /**
   * 订阅变更事件
   */
  onChange(listener: (event: WorkflowChangeEvent) => void): vscode.Disposable {
    this.changeListeners.push(listener);
    return {
      dispose: () => {
        const index = this.changeListeners.indexOf(listener);
        if (index > -1) {
          this.changeListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * 通知变更
   */
  private notifyChange(event: WorkflowChangeEvent): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 获取节点默认名称
   */
  private getDefaultNodeName(type: NodeType): string {
    const names: Record<NodeType, string> = {
      start: '开始',
      end: '结束',
      switch: '条件分支',
      parallel: '并行',
      code: '代码',
      llm: 'LLM'
    };
    return names[type] || type;
  }

  /**
   * 获取拓扑排序的节点执行顺序
   */
  getTopologicalOrder(): string[] {
    if (!this.currentWorkflow) return [];

    const { nodes, edges } = this.currentWorkflow;
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // 初始化
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    }

    // 构建图
    for (const edge of edges) {
      const neighbors = adjacencyList.get(edge.source.nodeId) || [];
      neighbors.push(edge.target.nodeId);
      adjacencyList.set(edge.source.nodeId, neighbors);
      
      inDegree.set(edge.target.nodeId, (inDegree.get(edge.target.nodeId) || 0) + 1);
    }

    // Kahn算法
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * 序列化工作流为JSON
   */
  serialize(): string {
    if (!this.currentWorkflow) {
      throw new Error('No workflow loaded');
    }
    return JSON.stringify(this.currentWorkflow, null, 2);
  }

  /**
   * 从JSON反序列化工作流
   */
  deserialize(json: string): Workflow {
    const workflow = JSON.parse(json) as Workflow;
    this.validateWorkflow(workflow);
    this.currentWorkflow = workflow;
    return workflow;
  }
}
