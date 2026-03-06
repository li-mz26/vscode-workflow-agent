import React from 'react';
import { EdgeData } from '../stores/canvasStore';

interface EdgeComponentProps {
    edge: EdgeData;
    path: string;
    selected: boolean;
}

export const EdgeComponent: React.FC<EdgeComponentProps> = ({
    edge,
    path,
    selected
}) => {
    return (
        <g>
            {/* Invisible wider path for easier selection */}
            <path
                d={path}
                stroke="transparent"
                strokeWidth={10}
                fill="none"
                style={{ cursor: 'pointer' }}
            />
            
            {/* Visible path */}
            <path
                d={path}
                stroke={selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-foreground)'}
                strokeWidth={selected ? 3 : 2}
                fill="none"
                markerEnd="url(#arrowhead)"
                opacity={0.8}
            />
        </g>
    );
};
