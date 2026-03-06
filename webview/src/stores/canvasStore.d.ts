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
    source: {
        nodeId: string;
        portId: string;
    };
    target: {
        nodeId: string;
        portId: string;
    };
    waypoints?: Position[];
}
export interface WorkflowData {
    id: string;
    name: string;
    description?: string;
    version: string;
    nodes: NodeData[];
    edges: EdgeData[];
    variables: Array<{
        name: string;
        type: string;
        defaultValue?: any;
    }>;
    settings: {
        timeout: number;
        logLevel: 'debug' | 'info' | 'warn' | 'error';
    };
}
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
interface CanvasState {
    workflow: WorkflowData | null;
    isDirty: boolean;
    viewport: {
        zoom: number;
        pan: Position;
    };
    selectedNodes: string[];
    selectedEdges: string[];
    execution: {
        state: ExecutionState;
        currentNode: string | null;
        logs: Array<{
            timestamp: string;
            level: string;
            message: string;
            nodeId?: string;
        }>;
    } | null;
    history: {
        canUndo: boolean;
        canRedo: boolean;
    };
    draggingNode: string | null;
    dragOffset: Position;
    connectingFrom: {
        nodeId: string;
        portId: string;
    } | null;
    mousePosition: Position;
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
    setViewport: (viewport: {
        zoom: number;
        pan: Position;
    }) => void;
    setZoom: (zoom: number) => void;
    pan: (delta: Position) => void;
    setDraggingNode: (nodeId: string | null, offset?: Position) => void;
    setConnectingFrom: (from: {
        nodeId: string;
        portId: string;
    } | null) => void;
    setMousePosition: (pos: Position) => void;
    setExecution: (execution: CanvasState['execution']) => void;
    markDirty: () => void;
    markClean: () => void;
}
export declare const useCanvasStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<CanvasState>, "setState"> & {
    setState(nextStateOrUpdater: CanvasState | Partial<CanvasState> | ((state: import("immer").WritableDraft<CanvasState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export {};
//# sourceMappingURL=canvasStore.d.ts.map