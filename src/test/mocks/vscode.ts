export const window = {
  createOutputChannel: () => ({
    appendLine: (msg: string) => console.log('[LOG]', msg)
  }),
  showInformationMessage: (...args: any[]) => Promise.resolve(),
  showWarningMessage: (...args: any[]) => Promise.resolve(),
  showErrorMessage: (...args: any[]) => Promise.resolve(),
  showInputBox: () => Promise.resolve(undefined),
  showSaveDialog: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  withProgress: async (options: any, task: any) => task({ report: () => {} }, { onCancellationRequested: () => {} }),
};

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined
  }),
  findFiles: () => Promise.resolve([]),
  openTextDocument: () => Promise.resolve({}),
  applyEdit: () => Promise.resolve(true),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, toString: () => path }),
  parse: (uri: string) => ({ fsPath: uri, toString: () => uri }),
};

export const ExtensionContext = {};
export const Disposable = {};
export const ProgressLocation = { Notification: 1 };
export const Range = class {};
export const WorkspaceEdit = class {
  replace() {}
};
export const CancellationTokenSource = class {};
export const env = { clipboard: { writeText: () => Promise.resolve() } };

export default { window, workspace, commands, Uri, env, ProgressLocation, Range, WorkspaceEdit };
