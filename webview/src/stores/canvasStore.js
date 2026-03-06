"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCanvasStore = void 0;
const zustand_1 = require("zustand");
const immer_1 = require("zustand/middleware/immer");
exports.useCanvasStore = (0, zustand_1.create)()((0, immer_1.immer)((set, get) => ({
    workflow: null,
    isDirty: false,
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    selectedNodes: [],
    selectedEdges: [],
    execution: null,
    history: { canUndo: false, canRedo: false },
    draggingNode: null,
    dragOffset: { x: 0, y: 0 },
    connectingFrom: null,
    mousePosition: { x: 0, y: 0 },
    setWorkflow: (workflow) => set({ workflow, isDirty: false }),
    updateWorkflow: (updates) => set((state) => {
        if (state.workflow) {
            Object.assign(state.workflow, updates);
            state.isDirty = true;
        }
    }),
    updateNode: (nodeId, updates) => set((state) => {
        const node = state.workflow?.nodes.find((n) => n.id === nodeId);
        if (node) {
            Object.assign(node, updates);
            state.isDirty = true;
        }
    }),
    updateNodeData: (nodeId, data) => set((state) => {
        const node = state.workflow?.nodes.find((n) => n.id === nodeId);
        if (node) {
            Object.assign(node.data, data);
            state.isDirty = true;
        }
    }),
    moveNode: (nodeId, position) => set((state) => {
        const node = state.workflow?.nodes.find((n) => n.id === nodeId);
        if (node) {
            node.position = position;
            state.isDirty = true;
        }
    }),
    addNode: (node) => set((state) => {
        state.workflow?.nodes.push(node);
        state.selectedNodes = [node.id];
        state.isDirty = true;
    }),
    deleteNode: (nodeId) => set((state) => {
        if (state.workflow) {
            state.workflow.nodes = state.workflow.nodes.filter((n) => n.id !== nodeId);
            state.workflow.edges = state.workflow.edges.filter((e) => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId);
            state.selectedNodes = state.selectedNodes.filter((id) => id !== nodeId);
            state.isDirty = true;
        }
    }),
    addEdge: (edge) => set((state) => {
        state.workflow?.edges.push(edge);
        state.isDirty = true;
    }),
    deleteEdge: (edgeId) => set((state) => {
        if (state.workflow) {
            state.workflow.edges = state.workflow.edges.filter((e) => e.id !== edgeId);
            state.isDirty = true;
        }
    }),
    selectNode: (nodeId, multi = false) => set((state) => {
        if (multi) {
            const index = state.selectedNodes.indexOf(nodeId);
            if (index > -1) {
                state.selectedNodes.splice(index, 1);
            }
            else {
                state.selectedNodes.push(nodeId);
            }
        }
        else {
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
    markClean: () => set({ isDirty: false })
})));
//# sourceMappingURL=canvasStore.js.map