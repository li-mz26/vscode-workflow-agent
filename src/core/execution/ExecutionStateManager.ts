import * as vscode from 'vscode';

export interface NodeExecutionState {
    nodeId: string;
    status: 'idle' | 'running' | 'success' | 'error';
    startTime?: number;
    endTime?: number;
    output?: any;
    error?: string;
}

export interface WorkflowExecutionState {
    workflowId: string;
    status: 'idle' | 'running' | 'completed' | 'failed';
    startTime?: number;
    endTime?: number;
    nodeStates: Map<string, NodeExecutionState>;
    currentNodeId?: string;
}

export class ExecutionStateManager {
    private static instance: ExecutionStateManager;
    private _onDidChangeExecutionState: vscode.EventEmitter<WorkflowExecutionState> = new vscode.EventEmitter<WorkflowExecutionState>();
    readonly onDidChangeExecutionState: vscode.Event<WorkflowExecutionState> = this._onDidChangeExecutionState.event;
    
    private executionStates: Map<string, WorkflowExecutionState> = new Map();
    private webviewPanels: Map<string, vscode.WebviewPanel> = new Map();

    static getInstance(): ExecutionStateManager {
        if (!ExecutionStateManager.instance) {
            ExecutionStateManager.instance = new ExecutionStateManager();
        }
        return ExecutionStateManager.instance;
    }

    registerWebviewPanel(workflowId: string, panel: vscode.WebviewPanel): void {
        this.webviewPanels.set(workflowId, panel);
    }

    unregisterWebviewPanel(workflowId: string): void {
        this.webviewPanels.delete(workflowId);
    }

    startExecution(workflowId: string): WorkflowExecutionState {
        const state: WorkflowExecutionState = {
            workflowId,
            status: 'running',
            startTime: Date.now(),
            nodeStates: new Map()
        };
        this.executionStates.set(workflowId, state);
        this.notifyStateChange(workflowId);
        return state;
    }

    setNodeRunning(workflowId: string, nodeId: string): void {
        const state = this.executionStates.get(workflowId);
        if (state) {
            const nodeState: NodeExecutionState = {
                nodeId,
                status: 'running',
                startTime: Date.now()
            };
            state.nodeStates.set(nodeId, nodeState);
            state.currentNodeId = nodeId;
            this.notifyStateChange(workflowId);
        }
    }

    setNodeSuccess(workflowId: string, nodeId: string, output: any): void {
        const state = this.executionStates.get(workflowId);
        if (state) {
            const nodeState = state.nodeStates.get(nodeId);
            if (nodeState) {
                nodeState.status = 'success';
                nodeState.endTime = Date.now();
                nodeState.output = output;
            }
            this.notifyStateChange(workflowId);
        }
    }

    setNodeError(workflowId: string, nodeId: string, error: string): void {
        const state = this.executionStates.get(workflowId);
        if (state) {
            const nodeState = state.nodeStates.get(nodeId);
            if (nodeState) {
                nodeState.status = 'error';
                nodeState.endTime = Date.now();
                nodeState.error = error;
            }
            state.status = 'failed';
            this.notifyStateChange(workflowId);
        }
    }

    completeExecution(workflowId: string, success: boolean): void {
        const state = this.executionStates.get(workflowId);
        if (state) {
            state.status = success ? 'completed' : 'failed';
            state.endTime = Date.now();
            this.notifyStateChange(workflowId);
        }
    }

    getExecutionState(workflowId: string): WorkflowExecutionState | undefined {
        return this.executionStates.get(workflowId);
    }

    resetExecution(workflowId: string): void {
        this.executionStates.delete(workflowId);
        this.notifyStateChange(workflowId);
    }

    private notifyStateChange(workflowId: string): void {
        const state = this.executionStates.get(workflowId);
        if (state) {
            this._onDidChangeExecutionState.fire(state);
            
            // 通知 webview
            const panel = this.webviewPanels.get(workflowId);
            if (panel) {
                panel.webview.postMessage({
                    type: 'execution:state',
                    payload: this.serializeState(state)
                });
            }
        }
    }

    private serializeState(state: WorkflowExecutionState): any {
        return {
            workflowId: state.workflowId,
            status: state.status,
            startTime: state.startTime,
            endTime: state.endTime,
            currentNodeId: state.currentNodeId,
            nodeStates: Array.from(state.nodeStates.entries()).map(([id, nodeState]) => ({
                nodeId: id,
                status: nodeState.status,
                startTime: nodeState.startTime,
                endTime: nodeState.endTime,
                hasOutput: nodeState.output !== undefined,
                hasError: nodeState.error !== undefined
            }))
        };
    }
}
