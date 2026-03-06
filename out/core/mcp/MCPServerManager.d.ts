import { WorkflowManager } from '../workflow/WorkflowManager';
export declare class MCPServerManager {
    private workflowManager;
    private isRunning;
    private executionEngines;
    constructor(workflowManager: WorkflowManager);
    start(): Promise<void>;
    stop(): void;
    private sendMessage;
    private handleRequest;
    private processRequest;
    private listTools;
    private callTool;
    private listResources;
    private readResource;
    private listPrompts;
    private getPrompt;
    private listNodeTypes;
    private executeWorkflow;
    private getExecutionStatus;
    private stopExecution;
    private createAlertHandlerWorkflow;
    private addScheduledTrigger;
}
//# sourceMappingURL=MCPServerManager.d.ts.map