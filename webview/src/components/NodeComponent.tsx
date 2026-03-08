import React, { useCallback, useState, useRef, useEffect } from 'react';
import { NodeData, Position } from '../stores/canvasStore';

interface NodeComponentProps {
    node: NodeData;
    selected: boolean;
    executionStatus?: 'idle' | 'running' | 'success' | 'error';
    onDrag: (nodeId: string, delta: Position) => void;
    onDragStart?: (nodeId: string) => void;
    onDragEnd?: (nodeId: string) => void;
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
    onDragEnd,
    onDragMove,
    onClick,
    onPortMouseDown,
    onPortMouseUp
}) => {
    const [isDragging, setIsDragging] = useState(false);
    
    // 使用 ref 存储拖动状态，避免闭包问题和 state 延迟
    const dragStateRef = useRef({
        isActive: false,
        nodeId: node.id,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        dragStarted: false
    });
    
    // 同步 node.id 到 ref
    useEffect(() => {
        dragStateRef.current.nodeId = node.id;
    }, [node.id]);
    
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
    
    // 清理拖动状态 - 确保所有状态都被重置
    const clearDragState = useCallback(() => {
        dragStateRef.current.isActive = false;
        dragStateRef.current.dragStarted = false;
        setIsDragging(false);
    }, []);
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        
        // 先清理之前可能残留的状态
        clearDragState();
        
        // 初始化新的拖动状态
        dragStateRef.current.isActive = true;
        dragStateRef.current.startX = e.clientX;
        dragStateRef.current.startY = e.clientY;
        dragStateRef.current.lastX = e.clientX;
        dragStateRef.current.lastY = e.clientY;
        dragStateRef.current.dragStarted = false;
        
        setIsDragging(true);
        onClick(node.id, e.metaKey || e.ctrlKey);
        e.stopPropagation();
    }, [node.id, onClick, clearDragState]);
    
    // 全局鼠标移动处理 - 使用 ref 中的函数避免依赖问题
    useEffect(() => {
        if (!isDragging) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStateRef.current.isActive) return;

            const deltaX = e.clientX - dragStateRef.current.lastX;
            const deltaY = e.clientY - dragStateRef.current.lastY;

            // 检查是否开始拖动（超过阈值）
            if (!dragStateRef.current.dragStarted) {
                const totalDeltaX = Math.abs(e.clientX - dragStateRef.current.startX);
                const totalDeltaY = Math.abs(e.clientY - dragStateRef.current.startY);
                
                if (totalDeltaX > 3 || totalDeltaY > 3) {
                    dragStateRef.current.dragStarted = true;
                    onDragStart?.(dragStateRef.current.nodeId);
                }
            }

            // 执行拖动
            if (dragStateRef.current.dragStarted) {
                onDragMove?.(dragStateRef.current.nodeId, e.clientX, e.clientY);
                onDrag(dragStateRef.current.nodeId, { x: deltaX, y: deltaY });
                dragStateRef.current.lastX = e.clientX;
                dragStateRef.current.lastY = e.clientY;
            }
        };

        const handleMouseUp = () => {
            if (dragStateRef.current.dragStarted) {
                onDragEnd?.(dragStateRef.current.nodeId);
            }
            clearDragState();
        };

        // 使用 capture 阶段确保能捕获事件
        window.addEventListener('mousemove', handleMouseMove, { capture: true });
        window.addEventListener('mouseup', handleMouseUp, { capture: true });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove, { capture: true });
            window.removeEventListener('mouseup', handleMouseUp, { capture: true });
        };
    }, [isDragging, onDrag, onDragStart, onDragEnd, onDragMove, clearDragState]);

    const executionBorderColor = getExecutionBorderColor();
    
    return (
        <g
            transform={`translate(${node.position.x}, ${node.position.y})`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
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
