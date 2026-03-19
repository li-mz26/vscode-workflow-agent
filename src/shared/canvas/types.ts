import { NodeConfig, Workflow, WorkflowEdge } from '../../engine/types';

export interface CanvasViewport {
  scale: number;
  offset: { x: number; y: number };
}

export interface CanvasSelection {
  nodeId?: string;
  edgeId?: string;
}

export interface CanvasState {
  workflow: Workflow;
  nodeConfigs: Record<string, NodeConfig>;
  selection: CanvasSelection;
  viewport: CanvasViewport;
}

export interface ConnectFromPort {
  nodeId: string;
  branchId?: string;
}

export interface NodeMoveDelta {
  nodeId: string;
  deltaX: number;
  deltaY: number;
}

export interface AddEdgeInput {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId?: string;
  targetPortId?: string;
  branchId?: string;
}

export interface EdgeAddResult {
  updated: Workflow;
  added?: WorkflowEdge;
}
