import * as vscode from 'vscode';
import { WorkflowManager } from '../workflow/WorkflowManager';
export declare class WorkflowEditorProvider implements vscode.CustomTextEditorProvider {
    private readonly context;
    private readonly workflowManager;
    static readonly viewType = "workflowAgent.editor";
    static register(context: vscode.ExtensionContext, workflowManager: WorkflowManager): vscode.Disposable;
    constructor(context: vscode.ExtensionContext, workflowManager: WorkflowManager);
    resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void>;
    private setupMessageHandling;
    private saveWorkflow;
    private getHtmlForWebview;
    private getNonce;
}
//# sourceMappingURL=WorkflowEditorProvider.d.ts.map