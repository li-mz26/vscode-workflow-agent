import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useCanvasStore, NodeData, EdgeData, Position } from '../stores/canvasStore';
import { NodeComponent } from './NodeComponent';
import { EdgeComponent } from './EdgeComponent';
import { calculateEdgePath } from '../utils/edgeRouting';

// 执行状态类型
interface NodeExecutionState {
    nodeId: string;
    status: 'idle' | 'running' | 'success' | 'error';
    startTime?: number;
    endTime?: number;
    hasOutput?: boolean;
    hasError?: boolean;
}

interface WorkflowExecutionState {
    workflowId: string;
    status: 'idle' | 'running' | 'completed' | 'failed';
    currentNodeId?: string;
    nodeStates: NodeExecutionState[];
}

interface CanvasProps {
    onNodeSelect?: (nodeId: string | null) => void;
    onNodeDragStart?: (nodeId: string) => void;
    onNodeDragMove?: (nodeId: string, clientX: number, clientY: number) => void;
    executionState?: WorkflowExecutionState | null;
}

export const Canvas: React.FC<CanvasProps> = ({
    onNodeSelect,
    onNodeDragStart,
    onNodeDragMove,
    executionState
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
    
    const {
        workflow,
        viewport,
        selectedNodes,
        connectingFrom,
        mousePosition,
        pan,
        selectNode,
        deselectAll,
        setDraggingNode,
        setConnectingFrom,
        setMousePosition,
        moveNode,
        addEdge
    } = useCanvasStore();
    
    // Transform mouse position to canvas coordinates
    const screenToCanvas = useCallback((x: number, y: number): Position => {
        return {
            x: (x - viewport.pan.x) / viewport.zoom,
            y: (y - viewport.pan.y) / viewport.zoom
        };
    }, [viewport]);
    
    // Handle wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(3, viewport.zoom * delta));
        
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const worldX = (mouseX - viewport.pan.x) / viewport.zoom;
            const worldY = (mouseY - viewport.pan.y) / viewport.zoom;
            
            const newPanX = mouseX - worldX * newZoom;
            const newPanY = mouseY - worldY * newZoom;
            
            useCanvasStore.setState({
                viewport: {
                    ...viewport,
                    zoom: newZoom,
                    pan: { x: newPanX, y: newPanY }
                }
            });
        }
    }, [viewport]);
    
    // Handle mouse down for panning or selection
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Middle mouse or Shift+Click = pan
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            e.preventDefault();
        } else if (e.button === 0 && e.target === svgRef.current) {
            // Left click on canvas = deselect
            deselectAll();
            onNodeSelect?.(null);
        }
    }, [deselectAll, onNodeSelect]);
    
    // Handle mouse move
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
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
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setDraggingNode(null);
    }, [setDraggingNode]);
    
    // Handle node drag
    const handleNodeDrag = useCallback((nodeId: string, delta: Position) => {
        const node = workflow?.nodes.find(n => n.id === nodeId);
        if (node) {
            moveNode(nodeId, {
                x: node.position.x + delta.x / viewport.zoom,
                y: node.position.y + delta.y / viewport.zoom
            });
        }
    }, [workflow, viewport.zoom, moveNode]);
    
    // Handle port connection start
    const handlePortMouseDown = useCallback((nodeId: string, portId: string, isOutput: boolean) => {
        if (isOutput) {
            setConnectingFrom({ nodeId, portId });
        }
    }, [setConnectingFrom]);
    
    // Handle port connection end
    const handlePortMouseUp = useCallback((nodeId: string, portId: string, isInput: boolean) => {
        if (connectingFrom && isInput) {
            // Create edge
            const edge: EdgeData = {
                id: `edge_${Date.now()}`,
                source: connectingFrom,
                target: { nodeId, portId }
            };
            addEdge(edge);
            setConnectingFrom(null);
        }
    }, [connectingFrom, addEdge, setConnectingFrom]);
    
    // Handle node selection
    const handleNodeClick = useCallback((nodeId: string, multi: boolean) => {
        selectNode(nodeId, multi);
        onNodeSelect?.(nodeId);
    }, [selectNode, onNodeSelect]);

    // Handle node drag start (for delete zone)
    const handleNodeDragStart = useCallback((nodeId: string) => {
        onNodeDragStart?.(nodeId);
    }, [onNodeDragStart]);
    
    // Global mouse up handler
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsPanning(false);
            setDraggingNode(null);
            setConnectingFrom(null);
        };
        
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [setDraggingNode, setConnectingFrom]);
    
    if (!workflow) {
        return (
            <div style={{
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
            </div>
        );
    }
    
    return (
        <svg
            ref={svgRef}
            style={{
                width: '100%',
                height: '100%',
                cursor: isPanning ? 'grabbing' : connectingFrom ? 'crosshair' : 'default'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            <defs>
                {/* Grid pattern */}
                <pattern
                    id="grid"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                >
                    <circle
                        cx="1"
                        cy="1"
                        r="1"
                        fill="var(--vscode-panel-border)"
                        opacity="0.5"
                    />
                </pattern>
                
                {/* Arrow marker */}
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="var(--vscode-foreground)"
                    />
                </marker>

                {/* 执行状态滤镜 */}
                <filter id="glow-running">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            
            {/* Background grid */}
            <rect
                x={-5000}
                y={-5000}
                width={10000}
                height={10000}
                fill="url(#grid)"
            />
            
            {/* Transform group for pan/zoom */}
            <g transform={`translate(${viewport.pan.x}, ${viewport.pan.y}) scale(${viewport.zoom})`}>
                {/* Edges with data flow animation */}
                {workflow.edges.map((edge, index) => {
                    const sourceNode = workflow.nodes.find(n => n.id === edge.source.nodeId);
                    const targetNode = workflow.nodes.find(n => n.id === edge.target.nodeId);
                    
                    if (!sourceNode || !targetNode) return null;
                    
                    const path = calculateEdgePath(
                        sourceNode,
                        edge.source.portId,
                        targetNode,
                        edge.target.portId
                    );
                    
                    // 检查是否有数据流动
                    const isFlowing = executionState?.nodeStates.find(
                        s => s.nodeId === edge.source.nodeId && s.status === 'success'
                    );
                    
                    return (
                        <g key={edge.id}>
                            <EdgeComponent
                                edge={edge}
                                path={path}
                                selected={false}
                                isFlowing={!!isFlowing}
                            />
                        </g>
                    );
                })}
                
                {/* Connecting line */}
                {connectingFrom && (() => {
                    const sourceNode = workflow.nodes.find(n => n.id === connectingFrom.nodeId);
                    if (!sourceNode) return null;
                    
                    const outputPort = sourceNode.outputs.find(p => p.id === connectingFrom.portId);
                    if (!outputPort) return null;
                    
                    const startX = sourceNode.position.x + 200;
                    const startY = sourceNode.position.y + 40 + sourceNode.outputs.indexOf(outputPort) * 20;
                    
                    return (
                        <line
                            x1={startX}
                            y1={startY}
                            x2={mousePosition.x}
                            y2={mousePosition.y}
                            stroke="var(--vscode-foreground)"
                            strokeWidth={2 / viewport.zoom}
                            strokeDasharray={`${5 / viewport.zoom},${5 / viewport.zoom}`}
                            opacity={0.6}
                        />
                    );
                })()}
                
                {/* Nodes */}
                {workflow.nodes.map(node => {
                    const nodeState = executionState?.nodeStates.find(s => s.nodeId === node.id);
                    
                    return (
                        <NodeComponent
                            key={node.id}
                            node={node}
                            selected={selectedNodes.includes(node.id)}
                            executionStatus={nodeState?.status || 'idle'}
                            onDrag={handleNodeDrag}
                            onDragStart={handleNodeDragStart}
                            onDragMove={onNodeDragMove}
                            onClick={handleNodeClick}
                            onPortMouseDown={handlePortMouseDown}
                            onPortMouseUp={handlePortMouseUp}
                        />
                    );
                })}
            </g>
        </svg>
    );
};
