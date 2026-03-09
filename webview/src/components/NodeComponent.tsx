import React, { useRef, useEffect } from 'react';
import { NodeData, Position } from '../stores/canvasStore';

interface NodeComponentProps {
    node: NodeData;
    selected: boolean;
    executionStatus?: 'idle' | 'running' | 'success' | 'error';
    onDrag: (nodeId: string, delta: Position) => void;
    onDragStart?: (nodeId: string) => void;
    onDragMove?: (nodeId: string, clientX: number, clientY: number) => void;
    onDragEnd?: (nodeId: string, clientX: number, clientY: number) => void;
    onClick: (nodeId: string, multi: boolean) => void;
    onPortMouseDown: (nodeId: string, portId: string, isOutput: boolean) => void;
    onPortMouseUp: (nodeId: string, portId: string, isInput: boolean) => void;
}

const NODE_WIDTH = 200;
const NODE_HEADER_HEIGHT = 32;
const PORT_RADIUS = 6;
const PORT_SPACING = 24;

export const NodeComponent: React.FC<NodeComponentProps> = ({
    node,
    selected,
    executionStatus = 'idle',
    onDrag,
    onDragStart,
    onDragMove,
    onDragEnd,
    onClick,
    onPortMouseDown,
    onPortMouseUp
}) => {
    const isDraggingRef = useRef(false);
    const dragStartedRef = useRef(false);
    const lastPosRef = useRef({ x: 0, y: 0 });
    
    const color = node.metadata?.color || '#666';
    const title = node.metadata?.name || node.type;
    
    const nodeHeight = Math.max(
        80,
        NODE_HEADER_HEIGHT + 20 + 
        Math.max(node.inputs.length, node.outputs.length) * PORT_SPACING + 20
    );

    const getExecutionBorderColor = () => {
        switch (executionStatus) {
            case 'running': return '#FFA500';
            case 'success': return '#4CAF50';
            case 'error': return '#F44336';
            default: return null;
        }
    };

    const getExecutionBackground = () => {
        switch (executionStatus) {
            case 'running': return 'url(#glow-running)';
            default: return undefined;
        }
    };
    
    const cleanup = () => {
        isDraggingRef.current = false;
        dragStartedRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDraggingRef.current) return;

        const deltaX = e.clientX - lastPosRef.current.x;
        const deltaY = e.clientY - lastPosRef.current.y;

        if (!dragStartedRef.current) {
            // 移除 3px 阈值，立即开始拖拽
            dragStartedRef.current = true;
            console.log('[NodeComponent] Drag start:', node.id);
            onDragStart?.(node.id);
        }

        onDragMove?.(node.id, e.clientX, e.clientY);
        onDrag(node.id, { x: deltaX, y: deltaY });

        lastPosRef.current.x = e.clientX;
        lastPosRef.current.y = e.clientY;
    };
    
    const handleMouseUp = (e: MouseEvent) => {
        const wasDragging = dragStartedRef.current;
        console.log('[NodeComponent] Mouse up, wasDragging:', wasDragging, 'nodeId:', node.id);
        cleanup();
        forceUpdate();
        
        // 如果确实开始拖动了，通知拖动结束（用于删除区域检测）
        if (wasDragging) {
            console.log('[NodeComponent] Calling onDragEnd with clientX:', e.clientX, 'clientY:', e.clientY);
            onDragEnd?.(node.id, e.clientX, e.clientY);
        }
    };
    
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        
        cleanup();
        
        isDraggingRef.current = true;
        lastPosRef.current.x = e.clientX;
        lastPosRef.current.y = e.clientY;
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        onClick(node.id, e.metaKey || e.ctrlKey);
        forceUpdate();
        e.stopPropagation();
    };
    
    useEffect(() => {
        return cleanup;
    }, []);

    const executionBorderColor = getExecutionBorderColor();
    
    return (
        <g
            transform={`translate(${node.position.x}, ${node.position.y})`}
            style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
        >
            <rect x={2} y={4} width={NODE_WIDTH} height={nodeHeight} rx={8} fill="rgba(0,0,0,0.2)" />
            
            <rect
                width={NODE_WIDTH}
                height={nodeHeight}
                rx={8}
                fill="var(--vscode-panel-background)"
                stroke={executionBorderColor || (selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)')}
                strokeWidth={executionStatus !== 'idle' ? 3 : (selected ? 2 : 1)}
                filter={getExecutionBackground()}
            />
            
            <rect width={NODE_WIDTH} height={NODE_HEADER_HEIGHT} rx={8} fill={color} />
            <rect y={NODE_HEADER_HEIGHT - 8} width={NODE_WIDTH} height={8} fill={color} />
            
            {executionStatus !== 'idle' && (
                <g transform={`translate(${NODE_WIDTH - 24}, 8)`}>
                    <circle
                        r={8}
                        fill={executionStatus === 'running' ? '#FFA500' : executionStatus === 'success' ? '#4CAF50' : '#F44336'}
                        stroke="white"
                        strokeWidth={2}
                    />
                    <text y={4} fill="white" fontSize={10} textAnchor="middle" style={{ userSelect: 'none' }}>
                        {executionStatus === 'running' && '▶'}
                        {executionStatus === 'success' && '✓'}
                        {executionStatus === 'error' && '✗'}
                    </text>
                </g>
            )}
            
            <text x={12} y={22} fill="white" fontSize={14} fontWeight={600} style={{ userSelect: 'none' }}>
                {title}
            </text>
            
            {node.inputs.map((port, index) => {
                const y = NODE_HEADER_HEIGHT + 20 + index * PORT_SPACING;
                return (
                    <g key={port.id}>
                        <circle
                            cx={0} cy={y} r={PORT_RADIUS}
                            fill="var(--vscode-panel-background)"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: 'crosshair' }}
                            onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(node.id, port.id, false); }}
                            onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(node.id, port.id, true); }}
                        />
                        <text x={12} y={y + 4} fill="var(--vscode-foreground)" fontSize={11} style={{ userSelect: 'none' }}>
                            {port.name}
                        </text>
                    </g>
                );
            })}
            
            {node.outputs.map((port, index) => {
                const y = NODE_HEADER_HEIGHT + 20 + index * PORT_SPACING;
                return (
                    <g key={port.id}>
                        <circle
                            cx={NODE_WIDTH} cy={y} r={PORT_RADIUS}
                            fill="var(--vscode-panel-background)"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: 'crosshair' }}
                            onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(node.id, port.id, true); }}
                            onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(node.id, port.id, false); }}
                        />
                        <text x={NODE_WIDTH - 12} y={y + 4} fill="var(--vscode-foreground)" fontSize={11} textAnchor="end" style={{ userSelect: 'none' }}>
                            {port.name}
                        </text>
                    </g>
                );
            })}
            
            {node.metadata?.description && (
                <text x={12} y={nodeHeight - 12} fill="var(--vscode-descriptionForeground)" fontSize={10} style={{ userSelect: 'none' }}>
                    {node.metadata.description.slice(0, 30)}{node.metadata.description.length > 30 ? '...' : ''}
                </text>
            )}

            {executionStatus === 'running' && (
                <rect x={0} y={nodeHeight - 4} width={NODE_WIDTH} height={4} rx={2} fill="#FFA500">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
                </rect>
            )}
        </g>
    );
};
