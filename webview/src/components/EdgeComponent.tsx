import React from 'react';
import { EdgeData } from '../stores/canvasStore';

interface EdgeComponentProps {
    edge: EdgeData;
    path: string;
    selected: boolean;
    /** 运行完成后是否经过此边 (undefined=未运行, true=经过, false=未经过) */
    executed?: boolean;
}

export const EdgeComponent: React.FC<EdgeComponentProps> = ({
    edge,
    path,
    selected,
    executed = undefined
}) => {
    // 根据执行状态确定颜色和箭头
    // undefined (未运行): 默认颜色
    // true (经过): 绿色
    // false (未经过): 灰色
    const getStrokeColor = () => {
        if (executed === true) return '#4CAF50'; // 绿色 - 经过
        if (executed === false) return '#666666'; // 灰色 - 未经过
        return 'var(--vscode-foreground)'; // 默认颜色
    };

    const getMarkerEnd = () => {
        if (executed === true) return 'url(#arrowhead-green)';
        if (executed === false) return 'url(#arrowhead-gray)';
        return 'url(#arrowhead)';
    };

    const getOpacity = () => {
        if (executed === false) return 0.4; // 未经过的边更淡
        return 0.8;
    };

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
                stroke={selected ? 'var(--vscode-focusBorder)' : getStrokeColor()}
                strokeWidth={selected ? 3 : 2}
                fill="none"
                markerEnd={getMarkerEnd()}
                opacity={getOpacity()}
            />
        </g>
    );
};
