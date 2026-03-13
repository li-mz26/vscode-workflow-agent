import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { StateCreator } from 'zustand';

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Port {
    id: string;
    name: string;
    type: 'data' | 'control';
    dataType: string;
}

export interface NodeData {
    id: string;
    type: string;
    position: Position;
    size?: Size;
    data: Record<string, any>;
    inputs: Port[];
    outputs: Port[];
    metadata?: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
    };
}

export interface EdgeData {
    id: string;
    source: { nodeId: string; portId: string };
    target: { nodeId: string; portId: string };
    waypoints?: Position[];
}

export interface WorkflowData {
    id: string;
    name: string;
    description?: string;
    version: string;
    nodes: NodeData[];
    edges: EdgeData[];
    variables: Array<{ name: string; type: string; defaultValue?: any }>;
    settings: {
        timeout: number;
        logLevel: 'debug' | 'info' | 'warn' | 'error';
    };
}

export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';


type WorkflowHistory = {
    past: WorkflowData[];
    future: WorkflowData[];
    canUndo: boolean;
    canRedo: boolean;
};

const MAX_HISTORY_LENGTH = 100;

const cloneWorkflow = (workflow: WorkflowData): WorkflowData =>
    typeof structuredClone === 'function'
        ? structuredClone(workflow)
        : JSON.parse(JSON.stringify(workflow));

const pushHistorySnapshot = (history: WorkflowHistory, workflow: WorkflowData) => {
    history.past.push(cloneWorkflow(workflow));
    if (history.past.length > MAX_HISTORY_LENGTH) {
        history.past.shift();
    }
    history.future = [];
    history.canUndo = history.past.length > 0;
    history.canRedo = false;
};

interface CanvasState {
    // Workflow data
    workflow: WorkflowData | null;
    isDirty: boolean;
    
    // Viewport
    viewport: {
        zoom: number;
        pan: Position;
    };
    
    // Selection
    selectedNodes: string[];
    selectedEdges: string[];
    
    // Execution
    execution: {
        state: ExecutionState;
        currentNode: string | null;
        logs: Array<{ timestamp: string; level: string; message: string; nodeId?: string }>;
    } | null;
    
    // History
    history: WorkflowHistory;
    
    // Dragging
    draggingNode: string | null;
    dragOffset: Position;
    
    // Connecting
    connectingFrom: { nodeId: string; portId: string } | null;
    mousePosition: Position;
    
    // Actions
    setWorkflow: (workflow: WorkflowData) => void;
    updateWorkflow: (updates: Partial<WorkflowData>) => void;
    updateNode: (nodeId: string, updates: Partial<NodeData>) => void;
    updateNodeData: (nodeId: string, data: Record<string, any>) => void;
    beginNodeMove: () => void;
    moveNode: (nodeId: string, position: Position) => void;
    addNode: (node: NodeData) => void;
    deleteNode: (nodeId: string) => void;
    addEdge: (edge: EdgeData) => void;
    deleteEdge: (edgeId: string) => void;
    selectNode: (nodeId: string, multi?: boolean) => void;
    deselectAll: () => void;
    setViewport: (viewport: { zoom: number; pan: Position }) => void;
    setZoom: (zoom: number) => void;
    pan: (delta: Position) => void;
    setDraggingNode: (nodeId: string | null, offset?: Position) => void;
    setConnectingFrom: (from: { nodeId: string; portId: string } | null) => void;
    setMousePosition: (pos: Position) => void;
    setExecution: (execution: CanvasState['execution']) => void;
    markDirty: () => void;
    markClean: () => void;
    undo: () => void;
    redo: () => void;
}

export const useCanvasStore = create<CanvasState>()(
    immer((set, get) => ({
        workflow: null,
        isDirty: false,
        viewport: { zoom: 1, pan: { x: 0, y: 0 } },
        selectedNodes: [],
        selectedEdges: [],
        execution: null,
        history: { past: [], future: [], canUndo: false, canRedo: false },
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        connectingFrom: null,
        mousePosition: { x: 0, y: 0 },
        
        setWorkflow: (workflow) => set({ workflow, isDirty: false, history: { past: [], future: [], canUndo: false, canRedo: false } }),
        
        updateWorkflow: (updates) => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                Object.assign(state.workflow, updates);
                state.isDirty = true;
            }
        }),
        
        updateNode: (nodeId, updates) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node && state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                Object.assign(node, updates);
                state.isDirty = true;
            }
        }),
        
        updateNodeData: (nodeId, data) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node && state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                Object.assign(node.data, data);
                state.isDirty = true;
            }
        }),

        beginNodeMove: () => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
            }
        }),
        
        moveNode: (nodeId, position) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node && state.workflow) {
                node.position = position;
                state.isDirty = true;
            }
        }),
        
        addNode: (node) => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                state.workflow.nodes.push(node);
                state.selectedNodes = [node.id];
                state.isDirty = true;
            }
        }),
        
        deleteNode: (nodeId) => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                state.workflow.nodes = state.workflow.nodes.filter((n) => n.id !== nodeId);
                state.workflow.edges = state.workflow.edges.filter(
                    (e) => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
                );
                state.selectedNodes = state.selectedNodes.filter((id) => id !== nodeId);
                state.isDirty = true;
            }
        }),
        
        addEdge: (edge) => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                state.workflow.edges.push(edge);
                state.isDirty = true;
            }
        }),
        
        deleteEdge: (edgeId) => set((state) => {
            if (state.workflow) {
                pushHistorySnapshot(state.history, state.workflow);
                state.workflow.edges = state.workflow.edges.filter((e) => e.id !== edgeId);
                state.isDirty = true;
            }
        }),
        
        selectNode: (nodeId, multi = false) => set((state) => {
            if (multi) {
                const index = state.selectedNodes.indexOf(nodeId);
                if (index > -1) {
                    state.selectedNodes.splice(index, 1);
                } else {
                    state.selectedNodes.push(nodeId);
                }
            } else {
                state.selectedNodes = [nodeId];
            }
        }),
        
        deselectAll: () => set({ selectedNodes: [], selectedEdges: [] }),
        
        setViewport: (viewport) => set({ viewport }),
        
        setZoom: (zoom) => set((state) => {
            state.viewport.zoom = Math.max(0.1, Math.min(2, zoom));
        }),
        
        pan: (delta) => set((state) => {
            state.viewport.pan.x += delta.x;
            state.viewport.pan.y += delta.y;
        }),
        
        setDraggingNode: (nodeId, offset = { x: 0, y: 0 }) => set({
            draggingNode: nodeId,
            dragOffset: offset
        }),
        
        setConnectingFrom: (from) => set({ connectingFrom: from }),
        
        setMousePosition: (pos) => set({ mousePosition: pos }),
        
        setExecution: (execution) => set({ execution }),

        undo: () => set((state) => {
            if (!state.workflow || state.history.past.length === 0) return;
            const previous = state.history.past.pop();
            if (!previous) return;
            state.history.future.unshift(cloneWorkflow(state.workflow));
            state.workflow = cloneWorkflow(previous);
            state.history.canUndo = state.history.past.length > 0;
            state.history.canRedo = state.history.future.length > 0;
            state.isDirty = true;
        }),

        redo: () => set((state) => {
            if (!state.workflow || state.history.future.length === 0) return;
            const next = state.history.future.shift();
            if (!next) return;
            state.history.past.push(cloneWorkflow(state.workflow));
            state.workflow = cloneWorkflow(next);
            state.history.canUndo = state.history.past.length > 0;
            state.history.canRedo = state.history.future.length > 0;
            state.isDirty = true;
        }),
        
        markDirty: () => set({ isDirty: true }),
        markClean: () => set({ isDirty: false })
    }))
);
