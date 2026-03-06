import * as vscode from 'vscode';
import { Workflow, CreateWorkflowDTO, WorkflowSummary, WorkflowChangeEvent, NodeConfig, Edge, ValidationResult } from '../shared/types';
import { EventEmitter } from 'events';
export declare class WorkflowManager extends EventEmitter {
    private context;
    private workflows;
    private nodeRegistry;
    constructor(context: vscode.ExtensionContext);
    private initialize;
    private scanWorkflowFiles;
    private setupFileWatcher;
    private getWorkflowIdFromPath;
    createWorkflow(config: CreateWorkflowDTO): Promise<Workflow>;
    getWorkflow(id: string): Promise<Workflow | null>;
    updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;
    deleteWorkflow(id: string): Promise<void>;
    listWorkflows(): Promise<WorkflowSummary[]>;
    loadFromFile(filePath: string): Promise<Workflow>;
    saveToFile(workflow: Workflow, filePath?: string): Promise<void>;
    validateWorkflow(workflow: Workflow): ValidationResult;
    addNode(workflowId: string, node: NodeConfig): Promise<NodeConfig>;
    updateNode(workflowId: string, nodeId: string, updates: Partial<NodeConfig>): Promise<NodeConfig>;
    deleteNode(workflowId: string, nodeId: string): Promise<void>;
    addEdge(workflowId: string, edge: Edge): Promise<Edge>;
    deleteEdge(workflowId: string, edgeId: string): Promise<void>;
    onWorkflowChanged(callback: (event: WorkflowChangeEvent) => void): void;
    private generateId;
}
//# sourceMappingURL=WorkflowManager.d.ts.map