import React from 'react';

interface ToolbarProps {
    onSave: () => void;
    onRun: () => void;
    onDebug: () => void;
    canSave: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    isRunning?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    onSave,
    onRun,
    onDebug,
    canSave,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    isRunning = false
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
                保存
            </button>
            
            <div style={{ width: '1px', height: '20px', background: 'var(--vscode-panel-border)' }} />

            <button
                onClick={onUndo}
                disabled={!canUndo}
                title="撤销 (Ctrl/Cmd+Z)"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: canUndo
                        ? 'var(--vscode-button-secondaryBackground)'
                        : 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: canUndo ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    opacity: canUndo ? 1 : 0.6
                }}
            >
                ↶ 撤销
            </button>

            <button
                onClick={onRedo}
                disabled={!canRedo}
                title="重做 (Ctrl/Cmd+Y / Ctrl/Cmd+Shift+Z)"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: canRedo ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    opacity: canRedo ? 1 : 0.6
                }}
            >
                ↷ 重做
            </button>

            <div style={{ width: '1px', height: '20px', background: 'var(--vscode-panel-border)' }} />
            <button
                onClick={onRun}
                disabled={isRunning}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: isRunning
                        ? 'var(--vscode-statusBar-debuggingBackground)'
                        : 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    opacity: isRunning ? 0.7 : 1
                }}
            >
                <span>{isRunning ? '⏳' : '▶'}</span>
                {isRunning ? '运行中...' : '运行'}
            </button>
            
            <button
                onClick={onDebug}
                disabled={isRunning}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    opacity: isRunning ? 0.7 : 1
                }}
            >
                <span>🐛</span>
                调试
            </button>
            
            <div style={{ flex: 1 }} />
            
            {isRunning && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'var(--vscode-statusBar-debuggingBackground)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: 'var(--vscode-statusBar-foreground)'
                }}
                >
                    <span style={{
                        width: '8px',
                        height: '8px',
                        background: '#FFA500',
                        borderRadius: '50%',
                        animation: 'pulse 1s infinite'
                    }} />
                    执行中...
                </div>
            )}
            
            <span style={{
                fontSize: '12px',
                color: 'var(--vscode-descriptionForeground)'
            }}>
                Workflow Agent
            </span>
            
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
};
