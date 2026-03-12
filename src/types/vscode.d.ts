declare module 'vscode' {
    export interface Uri {
        fsPath: string;
        static file(path: string): Uri;
        static parse(value: string): Uri;
        toString(): string;
    }
    
    export interface TextDocument {
        uri: Uri;
        fileName: string;
        getText(): string;
        positionAt(offset: number): Position;
        save(): Promise<boolean>;
    }
    
    export interface Position {
        line: number;
        character: number;
    }
    
    export interface Range {
        constructor(start: Position, end: Position);
    }
    
    export interface WorkspaceEdit {
        replace(uri: Uri, range: Range, newText: string): void;
    }
    
    export interface TreeDataProvider<T> {
        onDidChangeTreeData?: Event<T | undefined | null | void>;
        getTreeItem(element: T): TreeItem | Promise<TreeItem>;
        getChildren(element?: T): ProviderResult<T[]>;
    }
    
    export interface TreeItem {
        label?: string;
        tooltip?: string;
        description?: string;
        iconPath?: ThemeIcon;
        command?: Command;
        contextValue?: string;
        collapsibleState?: TreeItemCollapsibleState;
    }
    
    export enum TreeItemCollapsibleState {
        None = 0,
        Collapsed = 1,
        Expanded = 2
    }
    
    export class ThemeIcon {
        constructor(id: string);
        static readonly File: ThemeIcon;
        static readonly Folder: ThemeIcon;
    }
    
    export interface Command {
        command: string;
        title: string;
        arguments?: any[];
    }
    
    export interface TextEditor {
        document: TextDocument;
    }
    
    export interface Webview {
        options: WebviewOptions;
        html: string;
        onDidReceiveMessage: Event<any>;
        postMessage(message: any): Thenable<boolean>;
        asWebviewUri(localResource: Uri): Uri;
        cspSource: string;
    }
    
    export interface WebviewOptions {
        enableScripts?: boolean;
        localResourceRoots?: Uri[];
    }
    
    export interface WebviewPanel {
        webview: Webview;
        onDidDispose: Event<void>;
    }
    
    export interface CancellationToken {
        isCancellationRequested: boolean;
    }
    
    export interface CustomTextEditorProvider {
        resolveCustomTextEditor(
            document: TextDocument,
            webviewPanel: WebviewPanel,
            token: CancellationToken
        ): Promise<void> | void;
    }
    
    export interface ExtensionContext {
        extensionPath: string;
        subscriptions: Disposable[];
        workspaceState: Memento;
        globalState: Memento;
    }
    
    export interface Memento {
        get<T>(key: string, defaultValue?: T): T | undefined;
        update(key: string, value: any): Promise<void>;
    }
    
    export interface Disposable {
        dispose(): any;
    }
    
    export interface Event<T> {
        (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
    }
    
    export type ProviderResult<T> = T | undefined | null | Promise<T | undefined | null>;
    
    export namespace window {
        function showInputBox(options?: InputBoxOptions): Thenable<string | undefined>;
        function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
        function showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
        function registerTreeDataProvider<T>(viewId: string, treeDataProvider: TreeDataProvider<T>): Disposable;
        function registerCustomEditorProvider(viewType: string, provider: CustomTextEditorProvider, options?: any): Disposable;
        function createTreeView<T>(viewId: string, options: any): TreeView<T>;
        let activeTextEditor: TextEditor | undefined;
    }
    
    export interface TreeView<T> {
        reveal(element: T, options?: any): Thenable<void>;
    }
    
    export interface InputBoxOptions {
        prompt?: string;
        placeHolder?: string;
        value?: string;
    }
    
    export namespace workspace {
        const workspaceFolders: WorkspaceFolder[] | undefined;
        function getConfiguration(section?: string): WorkspaceConfiguration;
        function onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => any): Disposable;
        function onDidChangeTextDocument(listener: (e: TextDocumentChangeEvent) => any): Disposable;
        function findFiles(pattern: RelativePattern): Thenable<Uri[]>;
        function createFileSystemWatcher(pattern: string): FileSystemWatcher;
        function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;
    }
    
    export interface WorkspaceFolder {
        uri: Uri;
        name: string;
        index: number;
    }
    
    export interface WorkspaceConfiguration {
        get<T>(key: string, defaultValue?: T): T;
    }
    
    export interface ConfigurationChangeEvent {
        affectsConfiguration(section: string): boolean;
    }
    
    export interface TextDocumentChangeEvent {
        document: TextDocument;
        contentChanges: any[];
    }
    
    export interface FileSystemWatcher {
        onDidCreate: Event<Uri>;
        onDidChange: Event<Uri>;
        onDidDelete: Event<Uri>;
    }
    
    export interface RelativePattern {
        constructor(base: WorkspaceFolder, pattern: string);
    }
    
    export namespace commands {
        function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;
        function executeCommand<T>(command: string, ...rest: any[]): Thenable<T | undefined>;
    }
    
    export namespace Uri {
        function file(path: string): Uri;
        function parse(value: string): Uri;
    }
}
