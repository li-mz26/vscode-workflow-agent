import { WorkflowExecutionResult } from '../../engine/types';
import { BridgeInitPayload, BridgeRunPayload, BridgeSavePayload, WorkflowBridge } from './types';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type HttpRequester = <T>(url: string, init?: {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}) => Promise<ApiResponse<T>>;

export class WebWorkflowBridge implements WorkflowBridge {
  private readonly workflowPath: string;
  private readonly request: HttpRequester;

  constructor(workflowPath: string, request: HttpRequester) {
    this.workflowPath = workflowPath;
    this.request = request;
  }

  async init(): Promise<BridgeInitPayload> {
    const response = await this.request<BridgeInitPayload>(`/api/workflows/load?path=${encodeURIComponent(this.workflowPath)}`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to initialize workflow from web bridge');
    }
    return response.data;
  }

  async save(payload: BridgeSavePayload): Promise<void> {
    const response = await this.request<unknown>('/api/workflows/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: this.workflowPath, ...payload })
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to save workflow');
    }
  }

  async run(payload: BridgeRunPayload): Promise<WorkflowExecutionResult> {
    const response = await this.request<{ result: WorkflowExecutionResult }>('/api/workflows/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: payload.path || this.workflowPath, input: payload.input || {} })
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to run workflow');
    }

    return response.data.result;
  }

  async syncNodeConfigs(): Promise<void> {
    return;
  }
}
