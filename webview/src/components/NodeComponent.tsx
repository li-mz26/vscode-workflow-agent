import React, { useCallback, useState } from 'react';
import { NodeData, Position } from '../stores/canvasStore';

interface NodeComponentProps {
    node: NodeData;
    selected: boolean;
    onDrag: (nodeId: string, delta: Position) => void;
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
    onDrag,
    onClick,
    onPortMouseDown,
    onPortMouseUp
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
    
    const color = node.metadata?.color || '#666';
    const title = node.metadata?.name || node.type;
    
    const nodeHeight = Math.max(
        80,
        NODE_HEADER_HEIGHT + 20 + 
        Math.max(node.inputs.length, node.outputs.length) * PORT_SPACING + 20
    );
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) {
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            onClick(node.id, e.metaKey || e.ctrlKey);
            e.stopPropagation();
        }
    }, [node.id, onClick]);
    
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDragging) {
            const delta = {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            };
            onDrag(node.id, delta);
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    }, [isDragging, dragStart, node.id, onDrag]);
    
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);
    
    return (
        <g
            transform={`translate(${node.position.x}, ${node.position.y})`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <!-- Shadow -->
            <rect
                x={2}
                y={4}
                width={NODE_WIDTH}
                height={nodeHeight}
                rx={8}
                fill="rgba(0,0,0,0.2)"
            />
            
            <!-- Node body -->
            <rect
                width={NODE_WIDTH}
                height={nodeHeight}
                rx={8}
                fill="var(--vscode-panel-background)"
                stroke={selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'}
                strokeWidth={selected ? 2 : 1}
            />
            
            <!-- Header -->
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
            
            <!-- Title -->
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
            
            <!-- Input ports -->
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
            
            <!-- Output ports -->
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
            
            <!-- Description (if exists) -->
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
        </g>
    );
};
