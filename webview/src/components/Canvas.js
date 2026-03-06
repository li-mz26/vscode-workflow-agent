"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Canvas = void 0;
const react_1 = __importStar(require("react"));
const canvasStore_1 = require("../stores/canvasStore");
const NodeComponent_1 = require("./NodeComponent");
const EdgeComponent_1 = require("./EdgeComponent");
const edgeRouting_1 = require("../utils/edgeRouting");
const Canvas = ({ onNodeSelect }) => {
    const svgRef = (0, react_1.useRef)(null);
    const [isPanning, setIsPanning] = (0, react_1.useState)(false);
    const [panStart, setPanStart] = (0, react_1.useState)({ x: 0, y: 0 });
    const { workflow, viewport, selectedNodes, connectingFrom, mousePosition, setViewport, setZoom, pan, selectNode, deselectAll, setDraggingNode, setConnectingFrom, setMousePosition, moveNode, addEdge } = (0, canvasStore_1.useCanvasStore)();
    // Transform mouse position to canvas coordinates
    const screenToCanvas = (0, react_1.useCallback)((x, y) => {
        return {
            x: (x - viewport.pan.x) / viewport.zoom,
            y: (y - viewport.pan.y) / viewport.zoom
        };
    }, [viewport]);
    // Handle wheel zoom
    const handleWheel = (0, react_1.useCallback)((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(viewport.zoom * delta);
    }, [viewport.zoom, setZoom]);
    // Handle mouse down for panning or selection
    const handleMouseDown = (0, react_1.useCallback)((e) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Middle mouse or Shift+Click = pan
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            e.preventDefault();
        }
        else if (e.button === 0 && e.target === svgRef.current) {
            // Left click on canvas = deselect
            deselectAll();
            onNodeSelect?.(null);
        }
    }, [deselectAll, onNodeSelect]);
    // Handle mouse move
    const handleMouseMove = (0, react_1.useCallback)((e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
            const pos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
            setMousePosition(pos);
        }
        if (isPanning) {
            pan({
                x: (e.clientX - panStart.x),
                y: (e.clientY - panStart.y)
            });
            setPanStart({ x: e.clientX, y: e.clientY });
        }
    }, [isPanning, panStart, pan, screenToCanvas, setMousePosition]);
    // Handle mouse up
    const handleMouseUp = (0, react_1.useCallback)(() => {
        setIsPanning(false);
        setDraggingNode(null);
    }, [setDraggingNode]);
    // Handle node drag
    const handleNodeDrag = (0, react_1.useCallback)((nodeId, delta) => {
        const node = workflow?.nodes.find(n => n.id === nodeId);
        if (node) {
            moveNode(nodeId, {
                x: node.position.x + delta.x / viewport.zoom,
                y: node.position.y + delta.y / viewport.zoom
            });
        }
    }, [workflow, viewport.zoom, moveNode]);
    // Handle port connection start
    const handlePortMouseDown = (0, react_1.useCallback)((nodeId, portId, isOutput) => {
        if (isOutput) {
            setConnectingFrom({ nodeId, portId });
        }
    }, [setConnectingFrom]);
    // Handle port connection end
    const handlePortMouseUp = (0, react_1.useCallback)((nodeId, portId, isInput) => {
        if (connectingFrom && isInput) {
            // Create edge
            const edge = {
                id: `edge_${Date.now()}`,
                source: connectingFrom,
                target: { nodeId, portId }
            };
            addEdge(edge);
            setConnectingFrom(null);
        }
    }, [connectingFrom, addEdge, setConnectingFrom]);
    // Handle node selection
    const handleNodeClick = (0, react_1.useCallback)((nodeId, multi) => {
        selectNode(nodeId, multi);
        onNodeSelect?.(nodeId);
    }, [selectNode, onNodeSelect]);
    // Global mouse up handler
    (0, react_1.useEffect)(() => {
        const handleGlobalMouseUp = () => {
            setIsPanning(false);
            setDraggingNode(null);
            setConnectingFrom(null);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [setDraggingNode, setConnectingFrom]);
    if (!workflow) {
        return (<div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--vscode-editor-background)'
            }}>
                <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
                    <p>No workflow loaded</p>
                </div>
            </div>);
    }
    return (<svg ref={svgRef} style={{
            width: '100%',
            height: '100%',
            cursor: isPanning ? 'grabbing' : connectingFrom ? 'crosshair' : 'default'
        }} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <defs>
                {/* Grid pattern */}
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="var(--vscode-panel-border)" opacity="0.5"/>
                </pattern>
                
                {/* Arrow marker */}
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="var(--vscode-foreground)"/>
                </marker>
            </defs>
            
            {/* Background grid */}
            <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)"/>
            
            {/* Transform group for pan/zoom */}
            <g transform={`translate(${viewport.pan.x}, ${viewport.pan.y}) scale(${viewport.zoom})`}>
                {/* Edges */}
                {workflow.edges.map(edge => {
            const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
            const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
            if (!sourceNode || !targetNode)
                return null;
            const path = (0, edgeRouting_1.calculateEdgePath)(sourceNode, edge.source.portId, targetNode, edge.target.portId);
            return (<EdgeComponent_1.EdgeComponent key={edge.id} edge={edge} path={path} selected={false}/>);
        })}
                
                {/* Connecting line */}
                {connectingFrom && (() => {
            const sourceNode = workflow.nodes.find(n => n.id === connectingFrom.nodeId);
            if (!sourceNode)
                return null;
            const outputPort = sourceNode.outputs.find(p => p.id === connectingFrom.portId);
            if (!outputPort)
                return null;
            const startX = sourceNode.position.x + 200; // Node width
            const startY = sourceNode.position.y + 40 + sourceNode.outputs.indexOf(outputPort) * 20;
            return (<line x1={startX} y1={startY} x2={mousePosition.x} y2={mousePosition.y} stroke="var(--vscode-foreground)" strokeWidth={2 / viewport.zoom} strokeDasharray={`${5 / viewport.zoom},${5 / viewport.zoom}`} opacity={0.6}/>);
        })()}
                
                {/* Nodes */}
                {workflow.nodes.map(node => (<NodeComponent_1.NodeComponent key={node.id} node={node} selected={selectedNodes.includes(node.id)} onDrag={handleNodeDrag} onClick={handleNodeClick} onPortMouseDown={handlePortMouseDown} onPortMouseUp={handlePortMouseUp}/>))}
            </g>
        </svg>);
};
exports.Canvas = Canvas;
//# sourceMappingURL=Canvas.js.map