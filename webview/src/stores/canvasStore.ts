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

// History entry for undo/redo
interface HistoryEntry {
    workflow: WorkflowData;
    timestamp: number;
}

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
    
    // Node execution data (input/output from last run)
    nodeExecutionData: Record<string, {
        input?: Record<string, any>;
        output?: Record<string, any>;
        timestamp?: number;
        duration?: number;
        status?: 'success' | 'error' | 'running';
    }>;
    
    // History for undo/redo
    history: {
        undoStack: HistoryEntry[];
        redoStack: HistoryEntry[];
        maxSize: number;
        canUndo: boolean;
        canRedo: boolean;
    };
    
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
    
    // Undo/Redo actions
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;
    
    // Node execution data
    setNodeExecutionData: (nodeId: string, data: {
        input?: Record<string, any>;
        output?: Record<string, any>;
        timestamp?: number;
        duration?: number;
        status?: 'success' | 'error' | 'running';
    }) => void;
    clearNodeExecutionData: () => void;
}

// Deep clone helper
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

export const useCanvasStore = create<CanvasState>()(
    immer((set, get) => ({
        workflow: null,
        isDirty: false,
        viewport: { zoom: 1, pan: { x: 0, y: 0 } },
        selectedNodes: [],
        selectedEdges: [],
        execution: null,
        nodeExecutionData: {},
        history: { 
            undoStack: [],
            redoStack: [],
            maxSize: 50,
            canUndo: false,
            canRedo: false
        },
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        connectingFrom: null,
        mousePosition: { x: 0, y: 0 },
        
        setWorkflow: (workflow) => set({ 
            workflow, 
            isDirty: false,
            history: {
                undoStack: [],
                redoStack: [],
                maxSize: 50,
                canUndo: false,
                canRedo: false
            }
        }),
        
        updateWorkflow: (updates) => set((state) => {
            if (state.workflow) {
                // Save current state to undo stack before modifying
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                // Limit stack size
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                // Clear redo stack on new action
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
                Object.assign(state.workflow, updates);
                state.isDirty = true;
            }
        }),
        
        updateNode: (nodeId, updates) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node) {
                // Save current state to undo stack before modifying
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow!),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
                Object.assign(node, updates);
                state.isDirty = true;
            }
        }),
        
        updateNodeData: (nodeId, data) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node) {
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow!),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
                Object.assign(node.data, data);
                state.isDirty = true;
            }
        }),
        
        moveNode: (nodeId, position) => set((state) => {
            const node = state.workflow?.nodes.find((n) => n.id === nodeId);
            if (node) {
                // Don't record history for drag operations to avoid spam
                // Only save on drag end (handled separately)
                node.position = position;
                state.isDirty = true;
            }
        }),
        
        addNode: (node) => set((state) => {
            if (state.workflow) {
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
                state.workflow.nodes.push(node);
                state.selectedNodes = [node.id];
                state.isDirty = true;
            }
        }),
        
        deleteNode: (nodeId) => set((state) => {
            if (state.workflow) {
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
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
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
                state.workflow.edges.push(edge);
                state.isDirty = true;
            }
        }),
        
        deleteEdge: (edgeId) => set((state) => {
            if (state.workflow) {
                const currentState: HistoryEntry = {
                    workflow: deepClone(state.workflow),
                    timestamp: Date.now()
                };
                state.history.undoStack.push(currentState);
                
                if (state.history.undoStack.length > state.history.maxSize) {
                    state.history.undoStack.shift();
                }
                
                state.history.redoStack = [];
                state.history.canUndo = true;
                state.history.canRedo = false;
                
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
        
        markDirty: () => set({ isDirty: true }),
        markClean: () => set({ isDirty: false }),
        
        // Undo action
        undo: () => set((state) => {
            if (state.history.undoStack.length === 0 || !state.workflow) return;
            
            // Pop the last state from undo stack
            const lastEntry = state.history.undoStack.pop()!;
            
            // Push current state to redo stack
            const currentState: HistoryEntry = {
                workflow: deepClone(state.workflow),
                timestamp: Date.now()
            };
            state.history.redoStack.push(currentState);
            
            // Limit redo stack size
            if (state.history.redoStack.length > state.history.maxSize) {
                state.history.redoStack.shift();
            }
            
            // Restore the workflow from undo stack
            state.workflow = lastEntry.workflow;
            state.selectedNodes = [];
            state.isDirty = true;
            
            // Update canUndo/canRedo flags
            state.history.canUndo = state.history.undoStack.length > 0;
            state.history.canRedo = true;
        }),
        
        // Redo action
        redo: () => set((state) => {
            if (state.history.redoStack.length === 0 || !state.workflow) return;
            
            // Pop the last state from redo stack
            const nextEntry = state.history.redoStack.pop()!;
            
            // Push current state to undo stack
            const currentState: HistoryEntry = {
                workflow: deepClone(state.workflow),
                timestamp: Date.now()
            };
            state.history.undoStack.push(currentState);
            
            // Limit undo stack size
            if (state.history.undoStack.length > state.history.maxSize) {
                state.history.undoStack.shift();
            }
            
            // Restore the workflow from redo stack
            state.workflow = nextEntry.workflow;
            state.selectedNodes = [];
            state.isDirty = true;
            
            // Update canUndo/canRedo flags
            state.history.canUndo = true;
            state.history.canRedo = state.history.redoStack.length > 0;
        }),
        
        // Clear history
        clearHistory: () => set((state) => {
            state.history.undoStack = [];
            state.history.redoStack = [];
            state.history.canUndo = false;
            state.history.canRedo = false;
        }),
        
        // Node execution data
        setNodeExecutionData: (nodeId, data) => set((state) => {
            state.nodeExecutionData[nodeId] = {
                ...state.nodeExecutionData[nodeId],
                ...data,
                timestamp: data.timestamp || Date.now()
            };
        }),
        
        clearNodeExecutionData: () => set({ nodeExecutionData: {} })
    }))
);
