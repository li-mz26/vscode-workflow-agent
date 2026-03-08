import React, { useCallback, useState, useRef, useEffect } from 'react';
import { NodeData, Position } from '../stores/canvasStore';

interface NodeComponentProps {
    node: NodeData;
    selected: boolean;
    executionStatus?: 'idle' | 'running' | 'success' | 'error';
    onDrag: (nodeId: string, delta: Position) => void;
    onDragStart?: (nodeId: string) => void;
    onDragMove?: (nodeId: string, clientX: number, clientY: number) => void;
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
    onClick,
    onPortMouseDown,
    onPortMouseUp
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
    const dragStarted = useRef(false);
    const isDraggingRef = useRef(false);
    
    const color = node.metadata?.color || '#666';
    const title = node.metadata?.name || node.type;
    
    const nodeHeight = Math.max(
        80,
        NODE_HEADER_HEIGHT + 20 + 
        Math.max(node.inputs.length, node.outputs.length) * PORT_SPACING + 20
    );

    // 根据执行状态获取边框颜色
    const getExecutionBorderColor = () => {
        switch (executionStatus) {
            case 'running':
                return '#FFA500'; // 橙色
            case 'success':
                return '#4CAF50'; // 绿色
            case 'error':
                return '#F44336'; // 红色
            default:
                return null;
        }
    };

    // 根据执行状态获取背景效果
    const getExecutionBackground = () => {
        switch (executionStatus) {
            case 'running':
                return 'url(#glow-running)';
            default:
                return undefined;
        }
    };
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) {
            setIsDragging(true);
            isDraggingRef.current = true;
            dragStarted.current = false;
            setDragStart({ x: e.clientX, y: e.clientY });
            onClick(node.id, e.metaKey || e.ctrlKey);
            e.stopPropagation();
        }
    }, [node.id, onClick]);
    
    // 全局鼠标移动事件处理（用于拖动时不被区域外打断）
    const globalHandleMouseMove = useCallback((e: globalThis.MouseEvent) => {
        if (isDraggingRef.current) {
            const delta = {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            };

            // 首次移动时触发 dragStart
            if (!dragStarted.current && (Math.abs(delta.x) > 3 || Math.abs(delta.y) > 3)) {
                dragStarted.current = true;
                onDragStart?.(node.id);
            }

            // 拖动过程中通知父组件鼠标位置
            onDragMove?.(node.id, e.clientX, e.clientY);

            onDrag(node.id, delta);
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    }, [dragStart, node.id, onDrag, onDragStart, onDragMove]);

    const globalHandleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        dragStarted.current = false;
    }, []);

    // 使用全局事件监听，确保拖动时不丢失控制
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', globalHandleMouseMove);
            window.addEventListener('mouseup', globalHandleMouseUp);

            return () => {
                window.removeEventListener('mousemove', globalHandleMouseMove);
                window.removeEventListener('mouseup', globalHandleMouseUp);
            };
        }
    }, [isDragging, globalHandleMouseMove, globalHandleMouseUp]);

    // React 事件处理器（用于 JSX 绑定）
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDraggingRef.current) {
            e.stopPropagation();
            e.preventDefault();

            const delta = {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            };

            // 首次移动时触发 dragStart
            if (!dragStarted.current && (Math.abs(delta.x) > 3 || Math.abs(delta.y) > 3)) {
                dragStarted.current = true;
                onDragStart?.(node.id);
            }

            // 拖动过程中通知父组件鼠标位置
            onDragMove?.(node.id, e.clientX, e.clientY);

            onDrag(node.id, delta);
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    }, [dragStart, node.id, onDrag, onDragStart, onDragMove]);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        dragStarted.current = false;
    }, []);

    const executionBorderColor = getExecutionBorderColor();
    
    return (
        <g
            transform={`translate(${node.position.x}, ${node.position.y})`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Shadow */}
            <rect
                x={2}
                y={4}
                width={NODE_WIDTH}
                height={nodeHeight}
                rx={8}
                fill="rgba(0,0,0,0.2)"
            />
            
            {/* Node body */}
            <rect
                width={NODE_WIDTH}
                height={nodeHeight}
                rx={8}
                fill="var(--vscode-panel-background)"
                stroke={executionBorderColor || (selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)')}
                strokeWidth={executionStatus !== 'idle' ? 3 : (selected ? 2 : 1)}
                filter={getExecutionBackground()}
            />
            
            {/* Header */}
            <rect
                width={NODE_WIDTH}
                height={NODE_HEADER_HEIGHT}
                rx={8}
                fill={color}
            />
            <rect
                y={NODE_HEADER_HEIGHT - 8}
                width={NODE_WIDTH}
                height={8}
                fill={color}
            />
            
            {/* Execution status indicator */}
            {executionStatus !== 'idle' && (
                <g transform={`translate(${NODE_WIDTH - 24}, 8)`}>
                    <circle
                        r={8}
                        fill={
                            executionStatus === 'running' ? '#FFA500' :
                            executionStatus === 'success' ? '#4CAF50' :
                            '#F44336'
                        }
                        stroke="white"
                        strokeWidth={2}
                    />
                    <text
                        y={4}
                        fill="white"
                        fontSize={10}
                        textAnchor="middle"
                        style={{ userSelect: 'none' }}
                    >
                        {executionStatus === 'running' && '▶'}
                        {executionStatus === 'success' && '✓'}
                        {executionStatus === 'error' && '✗'}
                    </text>
                </g>
            )}
            
            {/* Title */}
            <text
                x={12}
                y={22}
                fill="white"
                fontSize={14}
                fontWeight={600}
                style={{ userSelect: 'none' }}
            >
                {title}
            </text>
            
            {/* Input ports */}
            {node.inputs.map((port, index) => {
                const y = NODE_HEADER_HEIGHT + 20 + index * PORT_SPACING;
                return (
                    <g key={port.id}>
                        <circle
                            cx={0}
                            cy={y}
                            r={PORT_RADIUS}
                            fill="var(--vscode-panel-background)"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: 'crosshair' }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                onPortMouseDown(node.id, port.id, false);
                            }}
                            onMouseUp={(e) => {
                                e.stopPropagation();
                                onPortMouseUp(node.id, port.id, true);
                            }}
                        />
                        <text
                            x={12}
                            y={y + 4}
                            fill="var(--vscode-foreground)"
                            fontSize={11}
                            style={{ userSelect: 'none' }}
                        >
                            {port.name}
                        </text>
                    </g>
                );
            })}
            
            {/* Output ports */}
            {node.outputs.map((port, index) => {
                const y = NODE_HEADER_HEIGHT + 20 + index * PORT_SPACING;
                return (
                    <g key={port.id}>
                        <circle
                            cx={NODE_WIDTH}
                            cy={y}
                            r={PORT_RADIUS}
                            fill="var(--vscode-panel-background)"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: 'crosshair' }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                onPortMouseDown(node.id, port.id, true);
                            }}
                            onMouseUp={(e) => {
                                e.stopPropagation();
                                onPortMouseUp(node.id, port.id, false);
                            }}
                        />
                        <text
                            x={NODE_WIDTH - 12}
                            y={y + 4}
                            fill="var(--vscode-foreground)"
                            fontSize={11}
                            textAnchor="end"
                            style={{ userSelect: 'none' }}
                        >
                            {port.name}
                        </text>
                    </g>
                );
            })}
            
            {/* Description */}
            {node.metadata?.description && (
                <text
                    x={12}
                    y={nodeHeight - 12}
                    fill="var(--vscode-descriptionForeground)"
                    fontSize={10}
                    style={{ userSelect: 'none' }}
                >
                    {node.metadata.description.slice(0, 30)}
                    {node.metadata.description.length > 30 ? '...' : ''}
                </text>
            )}

            {/* 执行中动画指示器 */}
            {executionStatus === 'running' && (
                <rect
                    x={0}
                    y={nodeHeight - 4}
                    width={NODE_WIDTH}
                    height={4}
                    rx={2}
                    fill="#FFA500"
                >
                    <animate
                        attributeName="opacity"
                        values="0.3;1;0.3"
                        dur="1s"
                        repeatCount="indefinite"
                    />
                </rect>
            )}
        </g>
    );
};
