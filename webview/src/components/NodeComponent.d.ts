import React from 'react';
import { NodeData, Position } from '../stores/canvasStore';
interface NodeComponentProps {
    node: NodeData;
    selected: boolean;
    onDrag: (nodeId: string, delta: Position) => void;
    onClick: (nodeId: string, multi: boolean) => void;
    onPortMouseDown: (nodeId: string, portId: string, isOutput: boolean) => void;
    onPortMouseUp: (nodeId: string, portId: string, isInput: boolean) => void;
}
export declare const NodeComponent: React.FC<NodeComponentProps>;
export {};
//# sourceMappingURL=NodeComponent.d.ts.map