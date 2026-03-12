import React from 'react';
import { EdgeData } from '../stores/canvasStore';

interface EdgeComponentProps {
    edge: EdgeData;
    path: string;
    selected: boolean;
    isFlowing?: boolean;
}

export const EdgeComponent: React.FC<EdgeComponentProps> = ({
    edge,
    path,
    selected,
    isFlowing = false
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

            {/* Data flow animation */}
            {isFlowing && (
                <>
                    <defs>
                        <linearGradient id={`flow-gradient-${edge.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="transparent" />
                            <stop offset="50%" stopColor="#FFA500" />
                            <stop offset="100%" stopColor="transparent" />
                            <animate
                                attributeName="x1"
                                from="-100%"
                                to="100%"
                                dur="1s"
                                repeatCount="indefinite"
                            />
                            <animate
                                attributeName="x2"
                                from="0%"
                                to="200%"
                                dur="1s"
                                repeatCount="indefinite"
                            />
                        </linearGradient>
                    </defs>
                    <path
                        d={path}
                        stroke={`url(#flow-gradient-${edge.id})`}
                        strokeWidth={4}
                        fill="none"
                        opacity={0.8}
                    />
                </>
            )}

            {/* 成功流动动画 */}
            {isFlowing && (
                <circle r="3" fill="#4CAF50">
                    <animateMotion
                        dur="0.8s"
                        repeatCount="indefinite"
                        path={path}
                    />
                </circle>
            )}
        </g>
    );
};
