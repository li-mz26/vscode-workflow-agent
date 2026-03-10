import {
    Workflow,
    NodeConfig,
    Edge,
    ExecutionState,
    ExecutionResult,
    ExecutionContext,
    NodeExecutionResult,
    LogEntry
} from '../../shared/types';
import { EventEmitter } from 'events';
import { NodeExecutorFactory } from './executors/NodeExecutorFactory';
import * as fs from 'fs';
import * as path from 'path';

interface ExecutionNode {
    node: NodeConfig;
    status: 'pending' | 'running' | 'completed' | 'failed';
    inputs: Map<string, any>;
    outputs?: Record<string, any>;
    error?: Error;
    startTime?: Date;
    endTime?: Date;
}

export class ExecutionEngine extends EventEmitter {
    private workflow: Workflow;
    private context: ExecutionContext;
    private nodeMap: Map<string, ExecutionNode> = new Map();
    private state: ExecutionState = 'idle';
    private executionId: string;
    private logs: LogEntry[] = [];
    private breakpoints: Set<string> = new Set();
    private currentNodeId: string | null = null;
    private abortController: AbortController | null = null;
    private pausePromise: Promise<void> | null = null;
    private pauseResolve: (() => void) | null = null;

    constructor(workflow: Workflow) {
        super();
        this.workflow = workflow;
        this.executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 初始化执行上下文
        this.context = {
            variables: new Map(),
            inputs: {},
            outputs: {},
            metadata: {
                startTime: new Date(),
                executionId: this.executionId
            }
        };

        // 初始化执行节点
        this.initializeNodes();
    }

    private initializeNodes(): void {
        for (const node of this.workflow.nodes) {
            // 加载外部配置（如果有 configRef）
            const mergedNode = this.loadNodeConfig(node);
            this.nodeMap.set(node.id, {
                node: mergedNode,
                status: 'pending',
                inputs: new Map()
            });
        }
    }

    private loadNodeConfig(node: NodeConfig): NodeConfig {
        // 如果没有 configRef，直接返回原节点
        if (!(node as any).configRef) {
            return node;
        }

        const configRef = (node as any).configRef as string;
        try {
            // 获取 workflow.json 所在目录
            const workflowDir = (this.workflow as any).workflowDir || process.cwd();
            const configPath = path.resolve(workflowDir, configRef);

            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const externalConfig = JSON.parse(configContent);

                // 合并配置：外部配置优先，但保留节点的 id、position、inputs、outputs、metadata
                return {
                    ...externalConfig,
                    id: node.id,
                    type: node.type,
                    position: node.position,
                    inputs: node.inputs,
                    outputs: node.outputs,
                    metadata: {
                        ...node.metadata,
                        ...externalConfig.metadata
                    },
                    // data 字段合并：外部配置的 data 优先
                    data: externalConfig.data || externalConfig // 对于 code/switch/llm 节点，配置可能在根级别
                };
            } else {
                this.log('warn', `Config file not found: ${configPath}`, node.id);
            }
        } catch (error) {
            this.log('error', `Failed to load config: ${(error as Error).message}`, node.id);
        }

        return node;
    }

    async start(inputs?: Record<string, any>): Promise<ExecutionResult> {
        if (this.state === 'running') {
            throw new Error('Execution already running');
        }

        this.state = 'running';
        this.context.inputs = inputs || {};
        this.abortController = new AbortController();

        this.emit('started', { executionId: this.executionId });
        this.log('info', 'Execution started');

        const startTime = Date.now();

        try {
            // 找到 Start 节点
            const startNode = this.workflow.nodes.find(n => n.type === 'start');
            if (!startNode) {
                throw new Error('No Start node found in workflow');
            }

            // 执行工作流
            await this.executeFromNode(startNode.id);

            // 收集输出
            const endNode = this.workflow.nodes.find(n => n.type === 'end');
            if (endNode) {
                const endExecutionNode = this.nodeMap.get(endNode.id);
                if (endExecutionNode?.outputs) {
                    this.context.outputs = endExecutionNode.outputs;
                }
            }

            this.state = 'completed';
            this.context.metadata.endTime = new Date();

            this.emit('completed', { 
                executionId: this.executionId, 
                outputs: this.context.outputs 
            });
            this.log('info', 'Execution completed successfully');

            return {
                success: true,
                outputs: this.context.outputs,
                logs: this.logs,
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.state = 'failed';
            this.context.metadata.endTime = new Date();

            this.emit('failed', { 
                executionId: this.executionId, 
                error 
            });
            this.log('error', `Execution failed: ${(error as Error).message}`);

            return {
                success: false,
                error: error as Error,
                logs: this.logs,
                duration: Date.now() - startTime
            };
        }
    }

    private async executeFromNode(nodeId: string): Promise<void> {
        if (this.abortController?.signal.aborted) {
            throw new Error('Execution aborted');
        }

        // 检查暂停
        if (this.pausePromise) {
            this.state = 'paused';
            this.emit('paused', { executionId: this.executionId });
            await this.pausePromise;
            this.state = 'running';
            this.emit('resumed', { executionId: this.executionId });
        }

        const execNode = this.nodeMap.get(nodeId);
        if (!execNode) {
            throw new Error(`Node not found: ${nodeId}`);
        }

        // 如果节点已经执行完成（例如 merge 节点从多个分支到达），跳过重复执行
        if (execNode.status === 'completed') {
            this.log('debug', `Node already completed, skipping: ${nodeId}`, nodeId);
            return;
        }

        // 检查断点
        if (this.breakpoints.has(nodeId)) {
            this.state = 'paused';
            this.currentNodeId = nodeId;
            this.emit('breakpoint:hit', { 
                executionId: this.executionId, 
                nodeId 
            });
            
            // 等待继续
            await new Promise<void>(resolve => {
                this.pauseResolve = resolve;
            });
            this.state = 'running';
        }

        // 执行节点
        await this.executeNode(execNode);

        // 找到下游节点并执行
        const outgoingEdges = this.workflow.edges.filter(e => e.source.nodeId === nodeId);
        
        // 根据节点类型决定执行策略
        const nodeType = execNode.node.type;
        
        if (nodeType === 'switch') {
            // Switch 节点：只执行匹配的分支
            const branch = execNode.outputs?.branch;
            if (branch) {
                const targetEdge = outgoingEdges.find(e => e.source.portId === branch);
                if (targetEdge) {
                    this.log('info', `Switch branching to: ${branch}`, nodeId);
                    await this.executeFromNode(targetEdge.target.nodeId);
                } else {
                    this.log('warn', `No edge found for branch: ${branch}`, nodeId);
                }
            }
        } else if (nodeType === 'parallel') {
            // Parallel 节点：并行执行所有分支
            const promises = outgoingEdges.map(edge => this.executeFromNode(edge.target.nodeId));
            await Promise.all(promises);
        } else {
            // 普通节点：顺序执行所有下游节点
            for (const edge of outgoingEdges) {
                await this.executeFromNode(edge.target.nodeId);
            }
        }
    }

    private async executeNode(execNode: ExecutionNode): Promise<void> {
        const { node } = execNode;
        
        execNode.status = 'running';
        execNode.startTime = new Date();
        this.currentNodeId = node.id;

        this.emit('node:started', { 
            executionId: this.executionId, 
            nodeId: node.id 
        });
        this.log('info', `Executing node: ${node.metadata?.name || node.type}`, node.id);

        try {
            // 收集输入
            // 对于 Start 节点，使用启动参数；其他节点从入边收集
            const inputs = node.type === 'start' 
                ? this.context.inputs 
                : this.collectNodeInputs(node);
            
            // 获取执行器
            const executor = NodeExecutorFactory.create(node.type);
            
            // 获取节点超时配置，默认 3 秒
            const nodeTimeout = node.data?.timeout || 3000;
            
            // 执行（带超时）
            const result = await this.executeWithTimeout(
                executor.execute(node, {
                    ...this.context,
                    inputs
                }),
                nodeTimeout,
                node.id
            );

            execNode.status = result.success ? 'completed' : 'failed';
            execNode.outputs = result.outputs;
            execNode.error = result.error;
            execNode.endTime = new Date();

            if (result.logs) {
                for (const log of result.logs) {
                    this.log('info', log, node.id);
                }
            }

            // 更新上下文变量
            if (result.outputs) {
                for (const [key, value] of Object.entries(result.outputs)) {
                    this.context.variables.set(`${node.id}.${key}`, value);
                }
            }

            this.emit('node:completed', { 
                executionId: this.executionId, 
                nodeId: node.id,
                outputs: result.outputs
            });

            if (!result.success) {
                throw result.error || new Error(`Node ${node.id} failed`);
            }

        } catch (error) {
            execNode.status = 'failed';
            execNode.error = error as Error;
            execNode.endTime = new Date();

            this.emit('node:failed', { 
                executionId: this.executionId, 
                nodeId: node.id,
                error 
            });
            this.log('error', `Node execution failed: ${(error as Error).message}`, node.id);

            throw error;
        }
    }

    private collectNodeInputs(node: NodeConfig): Record<string, any> {
        const inputs: Record<string, any> = {};

        // 从入边收集数据
        const incomingEdges = this.workflow.edges.filter(e => e.target.nodeId === node.id);
        
        for (const edge of incomingEdges) {
            const sourceNode = this.nodeMap.get(edge.source.nodeId);
            if (sourceNode?.outputs) {
                const value = sourceNode.outputs[edge.source.portId];
                inputs[edge.target.portId] = value;
            }
        }

        return inputs;
    }

    /**
     * 带超时的执行包装器
     * @param promise 执行Promise
     * @param timeoutMs 超时时间（毫秒）
     * @param nodeId 节点ID（用于日志）
     */
    private async executeWithTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        nodeId: string
    ): Promise<T> {
        let timeoutId: NodeJS.Timeout;
        
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Node execution timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId!);
            return result;
        } catch (error) {
            clearTimeout(timeoutId!);
            this.log('error', `Node ${nodeId} timeout or error: ${(error as Error).message}`, nodeId);
            throw error;
        }
    }

    async pause(): Promise<void> {
        if (this.state === 'running') {
            this.pausePromise = new Promise(resolve => {
                this.pauseResolve = resolve;
            });
        }
    }

    async resume(): Promise<void> {
        if (this.state === 'paused' && this.pauseResolve) {
            this.pauseResolve();
            this.pausePromise = null;
            this.pauseResolve = null;
        }
    }

    async stop(): Promise<void> {
        this.state = 'stopped';
        if (this.abortController) {
            this.abortController.abort();
        }
        if (this.pauseResolve) {
            this.pauseResolve();
        }
        this.emit('stopped', { executionId: this.executionId });
        this.log('info', 'Execution stopped');
    }

    // 调试功能
    async stepOver(): Promise<void> {
        if (this.state === 'paused') {
            await this.resume();
        }
    }

    setBreakpoint(nodeId: string): void {
        this.breakpoints.add(nodeId);
    }

    removeBreakpoint(nodeId: string): void {
        this.breakpoints.delete(nodeId);
    }

    getBreakpoints(): string[] {
        return Array.from(this.breakpoints);
    }

    // 状态查询
    getState(): ExecutionState {
        return this.state;
    }

    getCurrentNode(): string | null {
        return this.currentNodeId;
    }

    getVariables(): Record<string, any> {
        return Object.fromEntries(this.context.variables);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    private log(level: LogEntry['level'], message: string, nodeId?: string): void {
        this.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message,
            nodeId
        });
    }
}
