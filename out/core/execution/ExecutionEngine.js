"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionEngine = void 0;
const events_1 = require("events");
const NodeExecutorFactory_1 = require("./executors/NodeExecutorFactory");
class ExecutionEngine extends events_1.EventEmitter {
    constructor(workflow) {
        super();
        this.nodeMap = new Map();
        this.state = 'idle';
        this.logs = [];
        this.breakpoints = new Set();
        this.currentNodeId = null;
        this.abortController = null;
        this.pausePromise = null;
        this.pauseResolve = null;
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
    initializeNodes() {
        for (const node of this.workflow.nodes) {
            this.nodeMap.set(node.id, {
                node,
                status: 'pending',
                inputs: new Map()
            });
        }
    }
    async start(inputs) {
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
        }
        catch (error) {
            this.state = 'failed';
            this.context.metadata.endTime = new Date();
            this.emit('failed', {
                executionId: this.executionId,
                error
            });
            this.log('error', `Execution failed: ${error.message}`);
            return {
                success: false,
                error: error,
                logs: this.logs,
                duration: Date.now() - startTime
            };
        }
    }
    async executeFromNode(nodeId) {
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
        // 检查断点
        if (this.breakpoints.has(nodeId)) {
            this.state = 'paused';
            this.currentNodeId = nodeId;
            this.emit('breakpoint:hit', {
                executionId: this.executionId,
                nodeId
            });
            // 等待继续
            await new Promise(resolve => {
                this.pauseResolve = resolve;
            });
            this.state = 'running';
        }
        // 执行节点
        await this.executeNode(execNode);
        // 找到下游节点并执行
        const outgoingEdges = this.workflow.edges.filter(e => e.source.nodeId === nodeId);
        for (const edge of outgoingEdges) {
            await this.executeFromNode(edge.target.nodeId);
        }
    }
    async executeNode(execNode) {
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
            const inputs = this.collectNodeInputs(node);
            // 获取执行器
            const executor = NodeExecutorFactory_1.NodeExecutorFactory.create(node.type);
            // 执行
            const result = await executor.execute(node, {
                ...this.context,
                inputs
            });
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
        }
        catch (error) {
            execNode.status = 'failed';
            execNode.error = error;
            execNode.endTime = new Date();
            this.emit('node:failed', {
                executionId: this.executionId,
                nodeId: node.id,
                error
            });
            this.log('error', `Node execution failed: ${error.message}`, node.id);
            throw error;
        }
    }
    collectNodeInputs(node) {
        const inputs = {};
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
    async pause() {
        if (this.state === 'running') {
            this.pausePromise = new Promise(resolve => {
                this.pauseResolve = resolve;
            });
        }
    }
    async resume() {
        if (this.state === 'paused' && this.pauseResolve) {
            this.pauseResolve();
            this.pausePromise = null;
            this.pauseResolve = null;
        }
    }
    async stop() {
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
    async stepOver() {
        if (this.state === 'paused') {
            await this.resume();
        }
    }
    setBreakpoint(nodeId) {
        this.breakpoints.add(nodeId);
    }
    removeBreakpoint(nodeId) {
        this.breakpoints.delete(nodeId);
    }
    getBreakpoints() {
        return Array.from(this.breakpoints);
    }
    // 状态查询
    getState() {
        return this.state;
    }
    getCurrentNode() {
        return this.currentNodeId;
    }
    getVariables() {
        return Object.fromEntries(this.context.variables);
    }
    getLogs() {
        return [...this.logs];
    }
    log(level, message, nodeId) {
        this.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message,
            nodeId
        });
    }
}
exports.ExecutionEngine = ExecutionEngine;
//# sourceMappingURL=ExecutionEngine.js.map