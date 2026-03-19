import { NodeConfig, Workflow } from '../../engine/types';
import { CanvasHistory, HistorySnapshot } from './history';
import { CanvasSelection, CanvasState, CanvasViewport } from './types';

function cloneWorkflow(workflow: Workflow): Workflow {
  return JSON.parse(JSON.stringify(workflow)) as Workflow;
}

function cloneConfigs(nodeConfigs: Record<string, NodeConfig>): Record<string, NodeConfig> {
  return JSON.parse(JSON.stringify(nodeConfigs)) as Record<string, NodeConfig>;
}

export class CanvasStateStore {
  private state: CanvasState;
  private readonly history: CanvasHistory;

  constructor(workflow: Workflow, nodeConfigs: Record<string, NodeConfig>, maxHistory = 50) {
    this.history = new CanvasHistory(maxHistory);
    this.state = {
      workflow: cloneWorkflow(workflow),
      nodeConfigs: cloneConfigs(nodeConfigs),
      selection: {},
      viewport: { scale: 1, offset: { x: 0, y: 0 } }
    };

    this.history.push(this.getSnapshot());
  }

  getState(): CanvasState {
    return {
      workflow: cloneWorkflow(this.state.workflow),
      nodeConfigs: cloneConfigs(this.state.nodeConfigs),
      selection: { ...this.state.selection },
      viewport: {
        scale: this.state.viewport.scale,
        offset: { ...this.state.viewport.offset }
      }
    };
  }

  setWorkflowAndConfigs(workflow: Workflow, nodeConfigs: Record<string, NodeConfig>, pushHistory = true): void {
    this.state.workflow = cloneWorkflow(workflow);
    this.state.nodeConfigs = cloneConfigs(nodeConfigs);
    if (pushHistory) {
      this.history.push(this.getSnapshot());
    }
  }

  setSelection(selection: CanvasSelection): void {
    this.state.selection = { ...selection };
  }

  setViewport(viewport: CanvasViewport): void {
    this.state.viewport = {
      scale: viewport.scale,
      offset: { ...viewport.offset }
    };
  }

  undo(): boolean {
    const next = this.history.undo(this.getSnapshot());
    if (!next) return false;
    this.applySnapshot(next);
    return true;
  }

  redo(): boolean {
    const next = this.history.redo(this.getSnapshot());
    if (!next) return false;
    this.applySnapshot(next);
    return true;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  private getSnapshot(): HistorySnapshot {
    return {
      workflow: cloneWorkflow(this.state.workflow),
      nodeConfigs: cloneConfigs(this.state.nodeConfigs)
    };
  }

  private applySnapshot(snapshot: HistorySnapshot): void {
    this.state.workflow = cloneWorkflow(snapshot.workflow);
    this.state.nodeConfigs = cloneConfigs(snapshot.nodeConfigs);
  }
}
