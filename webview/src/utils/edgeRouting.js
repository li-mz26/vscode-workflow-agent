"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPortPosition = getPortPosition;
exports.calculateEdgePath = calculateEdgePath;
exports.lineIntersect = lineIntersect;
exports.simplifyPath = simplifyPath;
const NODE_WIDTH = 200;
const NODE_HEADER_HEIGHT = 32;
const PORT_SPACING = 24;
/**
 * Calculate the position of a port on a node
 */
function getPortPosition(node, portId, isInput) {
    const ports = isInput ? node.inputs : node.outputs;
    const portIndex = ports.findIndex(p => p.id === portId);
    if (portIndex === -1) {
        return { x: node.position.x, y: node.position.y };
    }
    const y = NODE_HEADER_HEIGHT + 20 + portIndex * PORT_SPACING;
    const x = isInput ? 0 : NODE_WIDTH;
    return {
        x: node.position.x + x,
        y: node.position.y + y
    };
}
/**
 * Calculate edge path using orthogonal routing with obstacle avoidance
 */
function calculateEdgePath(sourceNode, sourcePortId, targetNode, targetPortId) {
    const source = getPortPosition(sourceNode, sourcePortId, false);
    const target = getPortPosition(targetNode, targetPortId, true);
    // Use orthogonal routing
    return calculateOrthogonalPath(source, target, sourceNode, targetNode);
}
/**
 * Calculate orthogonal path between two points
 */
function calculateOrthogonalPath(source, target, sourceNode, targetNode) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    // Minimum horizontal segment length
    const minHorizontal = 40;
    // Control points
    let waypoints = [source];
    // Determine routing strategy based on relative positions
    if (dx > 0) {
        // Target is to the right of source
        if (Math.abs(dy) < 40) {
            // Nearly horizontal - simple connection
            waypoints.push(target);
        }
        else {
            // Need to route around
            const midX = source.x + Math.max(minHorizontal, dx / 2);
            waypoints.push({ x: midX, y: source.y });
            waypoints.push({ x: midX, y: target.y });
            waypoints.push(target);
        }
    }
    else {
        // Target is to the left - need to route around nodes
        const sourceRight = source.x + minHorizontal;
        const targetLeft = target.x - minHorizontal;
        // Check if nodes overlap vertically
        const sourceTop = sourceNode.position.y;
        const sourceBottom = sourceTop + 100; // Approximate height
        const targetTop = targetNode.position.y;
        const targetBottom = targetTop + 100;
        const verticalOverlap = !(sourceBottom < targetTop || sourceTop > targetBottom);
        if (verticalOverlap) {
            // Nodes overlap vertically - route above or below
            const routeAbove = Math.min(sourceTop, targetTop) - 40;
            const routeBelow = Math.max(sourceBottom, targetBottom) + 40;
            // Choose shorter route
            const midY = (source.y + target.y) / 2 > (routeAbove + routeBelow) / 2
                ? routeBelow
                : routeAbove;
            waypoints.push({ x: sourceRight, y: source.y });
            waypoints.push({ x: sourceRight, y: midY });
            waypoints.push({ x: targetLeft, y: midY });
            waypoints.push({ x: targetLeft, y: target.y });
            waypoints.push(target);
        }
        else {
            // No vertical overlap - direct route
            const midX = (source.x + target.x) / 2;
            waypoints.push({ x: midX, y: source.y });
            waypoints.push({ x: midX, y: target.y });
            waypoints.push(target);
        }
    }
    // Generate path string
    return generatePathString(waypoints);
}
/**
 * Generate SVG path string from waypoints
 */
function generatePathString(waypoints) {
    if (waypoints.length < 2)
        return '';
    let path = `M ${waypoints[0].x} ${waypoints[0].y}`;
    for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i - 1];
        const curr = waypoints[i];
        // Add rounded corners
        if (i > 1 && i < waypoints.length) {
            const next = waypoints[i + 1];
            if (next) {
                // Calculate corner radius
                const radius = 10;
                // Determine direction change
                const prevDx = curr.x - prev.x;
                const prevDy = curr.y - prev.y;
                const nextDx = next.x - curr.x;
                const nextDy = next.y - curr.y;
                // Simple line for now, can be enhanced with bezier curves
                path += ` L ${curr.x} ${curr.y}`;
            }
            else {
                path += ` L ${curr.x} ${curr.y}`;
            }
        }
        else {
            path += ` L ${curr.x} ${curr.y}`;
        }
    }
    return path;
}
/**
 * Check if two line segments intersect
 */
function lineIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
        return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}
/**
 * Simplify path by removing unnecessary waypoints
 */
function simplifyPath(waypoints) {
    if (waypoints.length <= 2)
        return waypoints;
    const simplified = [waypoints[0]];
    for (let i = 1; i < waypoints.length - 1; i++) {
        const prev = waypoints[i - 1];
        const curr = waypoints[i];
        const next = waypoints[i + 1];
        // Check if current point is on the same line as prev and next
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        // If not collinear, keep the point
        if (dx1 * dy2 !== dx2 * dy1) {
            simplified.push(curr);
        }
    }
    simplified.push(waypoints[waypoints.length - 1]);
    return simplified;
}
//# sourceMappingURL=edgeRouting.js.map