import React from 'react';

interface ToolbarProps {
    onSave: () => void;
    onRun: () => void;
    onDebug: () => void;
    canSave: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    onSave,
    onRun,
    onDebug,
    canSave
}) => {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 16px',
            background: 'var(--vscode-editor-background)',
            borderBottom: '1px solid var(--vscode-panel-border)',
            gap: '8px'
        }}>
            <button
                onClick={onSave}
                disabled={!canSave}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: canSave 
                        ? 'var(--vscode-button-background)' 
                        : 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    opacity: canSave ? 1 : 0.6
                }}
            >
                <span>💾</span>
                Save
            </button>
            
            <div style={{ width: '1px', height: '20px', background: 'var(--vscode-panel-border)' }} />
            
            <button
                onClick={onRun}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                }}
            >
                <span>▶</span>
                Run
            </button>
            
            <button
                onClick={onDebug}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                }}
            >
                <span>🐛</span>
                Debug
            </button>
            
            <div style={{ flex: 1 }} />
            
            <span style={{
                fontSize: '12px',
                color: 'var(--vscode-descriptionForeground)'
            }}>
                Workflow Agent
            </span>
        </div>
    );
};
