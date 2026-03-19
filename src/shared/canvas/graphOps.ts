import { Workflow, WorkflowEdge } from '../../engine/types';
import { AddEdgeInput, EdgeAddResult, NodeMoveDelta } from './types';

function cloneWorkflow(workflow: Workflow): Workflow {
  return JSON.parse(JSON.stringify(workflow)) as Workflow;
}

export function moveNode(workflow: Workflow, input: NodeMoveDelta): Workflow {
  const updated = cloneWorkflow(workflow);
  const node = updated.nodes.find((item) => item.id === input.nodeId);
  if (!node) return updated;

  node.position = {
    x: node.position.x + input.deltaX,
    y: node.position.y + input.deltaY
  };

  return updated;
}

export function addEdgeIfNotExists(workflow: Workflow, input: AddEdgeInput): EdgeAddResult {
  const updated = cloneWorkflow(workflow);
  const exists = updated.edges.some((edge) =>
    edge.source.nodeId === input.sourceNodeId &&
    edge.target.nodeId === input.targetNodeId &&
    (edge.branchId ?? null) === (input.branchId ?? null)
  );

  if (exists) {
    return { updated };
  }

  const newEdge: WorkflowEdge = {
    id: input.edgeId,
    source: {
      nodeId: input.sourceNodeId,
      portId: input.sourcePortId ?? 'output'
    },
    target: {
      nodeId: input.targetNodeId,
      portId: input.targetPortId ?? 'input'
    },
    branchId: input.branchId
  };

  updated.edges.push(newEdge);
  return { updated, added: newEdge };
}

export function removeNodeAndRelatedEdges(workflow: Workflow, nodeId: string): Workflow {
  const updated = cloneWorkflow(workflow);
  updated.nodes = updated.nodes.filter((node) => node.id !== nodeId);
  updated.edges = updated.edges.filter(
    (edge) => edge.source.nodeId !== nodeId && edge.target.nodeId !== nodeId
  );
  return updated;
}
