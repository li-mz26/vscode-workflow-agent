/**
 * Webview 模块导出
 */

export * from './editor';
export * from './explorer';

import { WorkflowEditorProvider } from './editor';
import { WorkflowExplorer } from './explorer';

export { WorkflowEditorProvider, WorkflowExplorer };
export default { WorkflowEditorProvider, WorkflowExplorer };