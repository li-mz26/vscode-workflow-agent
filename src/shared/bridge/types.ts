import { NodeConfig, Workflow, WorkflowExecutionResult } from '../../engine/types';

export interface BridgeInitPayload {
  workflow: Workflow;
  nodeConfigs: Record<string, NodeConfig>;
}

export interface BridgeSavePayload {
  workflow: Workflow;
  nodeConfigs: Record<string, NodeConfig>;
}

export interface BridgeRunPayload {
  path?: string;
  input?: Record<string, unknown>;
}

export interface WorkflowBridge {
  init(): Promise<BridgeInitPayload>;
  save(payload: BridgeSavePayload): Promise<void>;
  run(payload: BridgeRunPayload): Promise<WorkflowExecutionResult>;
  syncNodeConfigs?(nodeConfigs: Record<string, NodeConfig>): Promise<void>;
}
