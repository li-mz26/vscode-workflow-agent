import { NodeConfig, Workflow } from '../../engine/types';

export interface HistorySnapshot {
  workflow: Workflow;
  nodeConfigs: Record<string, NodeConfig>;
}

function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as HistorySnapshot;
}

export class CanvasHistory {
  private readonly maxSize: number;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  push(snapshot: HistorySnapshot): void {
    this.undoStack.push(cloneSnapshot(snapshot));
    this.redoStack = [];

    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  undo(current: HistorySnapshot): HistorySnapshot | null {
    if (this.undoStack.length <= 1) return null;

    const currentCopy = cloneSnapshot(current);
    this.redoStack.push(currentCopy);

    this.undoStack.pop();
    const previous = this.undoStack[this.undoStack.length - 1];
    return cloneSnapshot(previous);
  }

  redo(current: HistorySnapshot): HistorySnapshot | null {
    if (this.redoStack.length === 0) return null;

    const currentCopy = cloneSnapshot(current);
    this.undoStack.push(currentCopy);

    const next = this.redoStack.pop()!;
    return cloneSnapshot(next);
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
