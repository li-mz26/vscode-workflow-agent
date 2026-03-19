import { NodeConfig, WorkflowExecutionResult } from '../../engine/types';
import { BridgeInitPayload, BridgeRunPayload, BridgeSavePayload, WorkflowBridge } from './types';

export interface VscodeLikeApi {
  postMessage(message: unknown): void;
}

export interface VscodeBridgeMessage {
  type: string;
  [key: string]: unknown;
}

export class VscodeWorkflowBridge implements WorkflowBridge {
  private readonly vscode: VscodeLikeApi;
  private latestInitPayload: BridgeInitPayload | null = null;

  constructor(vscodeApi: VscodeLikeApi) {
    this.vscode = vscodeApi;
  }

  handleMessage(message: VscodeBridgeMessage): void {
    if (message.type === 'init') {
      this.latestInitPayload = {
        workflow: message.workflow as BridgeInitPayload['workflow'],
        nodeConfigs: (message.nodeConfigs || {}) as Record<string, NodeConfig>
      };
    }
  }

  async init(): Promise<BridgeInitPayload> {
    this.vscode.postMessage({ type: 'ready' });
    if (this.latestInitPayload) {
      return this.latestInitPayload;
    }
    throw new Error('Vscode bridge has not received init payload yet');
  }

  async save(payload: BridgeSavePayload): Promise<void> {
    this.vscode.postMessage({ type: 'save', ...payload });
  }

  async run(_payload: BridgeRunPayload): Promise<WorkflowExecutionResult> {
    this.vscode.postMessage({ type: 'run' });
    throw new Error('VscodeWorkflowBridge.run returns via async events and should be handled by event listener');
  }

  async syncNodeConfigs(nodeConfigs: Record<string, NodeConfig>): Promise<void> {
    this.vscode.postMessage({ type: 'syncNodeConfigs', nodeConfigs });
  }
}
