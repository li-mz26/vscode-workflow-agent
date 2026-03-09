import React from 'react';
import { useCanvasStore } from '../stores/canvasStore';

interface NodePaletteProps {
    onNodeDragStart: (type: string) => void;
}

const NODE_TYPES = [
    { type: 'start', name: 'Start', icon: '▶', color: '#4CAF50', category: 'Basic' },
    { type: 'end', name: 'End', icon: '■', color: '#F44336', category: 'Basic' },
    { type: 'code', name: 'Code', icon: '{}', color: '#2196F3', category: 'Basic' },
    { type: 'llm', name: 'LLM', icon: '✨', color: '#9C27B0', category: 'Basic' },
    { type: 'switch', name: 'Switch', icon: '◆', color: '#FF9800', category: 'Flow' },
    { type: 'parallel', name: 'Parallel', icon: '⚡', color: '#00BCD4', category: 'Flow' },
    { type: 'merge', name: 'Merge', icon: '⚹', color: '#795548', category: 'Flow' }
];

export const NodePalette: React.FC<NodePaletteProps> = ({ onNodeDragStart }) => {
    const groupedTypes = NODE_TYPES.reduce((acc, node) => {
        if (!acc[node.category]) {
            acc[node.category] = [];
        }
        acc[node.category].push(node);
        return acc;
    }, {} as Record<string, typeof NODE_TYPES>);
    
    return (
        <div style={{
            padding: '16px',
            background: 'var(--vscode-sideBar-background)',
            borderRight: '1px solid var(--vscode-panel-border)',
            height: '100%',
            overflow: 'auto'
        }}>
            <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--vscode-foreground)'
            }}>
                Nodes
            </h3>
            
            {Object.entries(groupedTypes).map(([category, types]) => (
                <div key={category} style={{ marginBottom: '16px' }}>
                    <h4 style={{
                        margin: '0 0 8px 0',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--vscode-descriptionForeground)',
                        textTransform: 'uppercase'
                    }}>
                        {category}
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {types.map(nodeType => (
                            <div
                                key={nodeType.type}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/x-workflow-node-type', nodeType.type);
                                    e.dataTransfer.effectAllowed = 'copy';
                                    onNodeDragStart(nodeType.type);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    background: 'var(--vscode-list-hoverBackground)',
                                    border: '1px solid transparent',
                                    borderRadius: '4px',
                                    cursor: 'grab',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--vscode-list-activeSelectionBackground)';
                                    e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '4px',
                                    background: nodeType.color,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    color: 'white',
                                    fontWeight: 600
                                }}>
                                    {nodeType.icon}
                                </div>
                                <span style={{
                                    fontSize: '13px',
                                    color: 'var(--vscode-foreground)'
                                }}>
                                    {nodeType.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
