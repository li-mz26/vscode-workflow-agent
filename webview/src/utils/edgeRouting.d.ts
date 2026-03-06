import { NodeData, Position } from '../stores/canvasStore';
/**
 * Calculate the position of a port on a node
 */
export declare function getPortPosition(node: NodeData, portId: string, isInput: boolean): Position;
/**
 * Calculate edge path using orthogonal routing with obstacle avoidance
 */
export declare function calculateEdgePath(sourceNode: NodeData, sourcePortId: string, targetNode: NodeData, targetPortId: string): string;
/**
 * Check if two line segments intersect
 */
export declare function lineIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean;
/**
 * Simplify path by removing unnecessary waypoints
 */
export declare function simplifyPath(waypoints: Position[]): Position[];
//# sourceMappingURL=edgeRouting.d.ts.map