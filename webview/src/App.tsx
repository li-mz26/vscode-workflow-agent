import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { NodePalette } from './components/NodePalette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import { useCanvasStore } from './stores/canvasStore';
import { NodeRegistry } from '../../src/core/node/NodeRegistry';

const vscode = acquireVsCodeApi();
const nodeRegistry = new NodeRegistry();

// 执行状态类型
interface NodeExecutionState {
    nodeId: string;
    status: 'idle' | 'running' | 'success' | 'error';
    startTime?: number;
    endTime?: number;
    input?: Record<string, any>;
    output?: Record<string, any>;
    duration?: number;
}

interface WorkflowExecutionState {
    workflowId: string;
    status: 'idle' | 'running' | 'completed' | 'failed';
    currentNodeId?: string;
    nodeStates: NodeExecutionState[];
}

// 视图模式
 type ViewMode = 'visual' | 'json';

function App() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [executionState, setExecutionState] = useState<WorkflowExecutionState | null>(null);
    const [isDeleteZoneActive, setIsDeleteZoneActive] = useState(false);
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [jsonContent, setJsonContent] = useState<string>('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    
    // 从 store 获取需要的函数和状态
    const { 
        workflow, 
        setWorkflow, 
        addNode, 
        deleteNode, 
        markClean,
        undo,
        redo,
        history,
        isDirty,
        setNodeExecutionData,
        clearNodeExecutionData
    } = useCanvasStore();
    
    const deleteZoneRef = useRef<HTMLDivElement>(null);
    
    // Load workflow from VSCode
    useEffect(() => {
        const initialWorkflow = (window as any).__WORKFLOW_DATA__;
        if (initialWorkflow) {
            setWorkflow(initialWorkflow);
            setJsonContent(JSON.stringify(initialWorkflow, null, 2));
        }
        
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'workflow:load':
                    setWorkflow(message.payload);
                    setJsonContent(JSON.stringify(message.payload, null, 2));
                    break;
                case 'workflow:update':
                    setWorkflow(message.payload);
                    setJsonContent(JSON.stringify(message.payload, null, 2));
                    break;
                case 'execution:state':
                    setExecutionState(message.payload);
                    // 存储节点执行数据（输入输出）
                    if (message.payload?.nodeStates) {
                        message.payload.nodeStates.forEach((nodeState: NodeExecutionState & { input?: any; output?: any; duration?: number }) => {
                            if (nodeState.status === 'success' || nodeState.status === 'error') {
                                setNodeExecutionData(nodeState.nodeId, {
                                    status: nodeState.status,
                                    input: nodeState.input,
                                    output: nodeState.output,
                                    duration: nodeState.duration,
                                    timestamp: Date.now()
                                });
                            }
                        });
                    }
                    break;
                case 'execution:started':
                    // 开始新执行时清除旧的执行数据
                    clearNodeExecutionData();
                    break;
            }
        };
        
        window.addEventListener('message', handleMessage);
        vscode.postMessage({ type: 'webview:ready' });
        
        return () => window.removeEventListener('message', handleMessage);
    }, [setWorkflow]);

    // 键盘快捷键监听（撤销/恢复）
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Z: 撤销
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (history.canUndo) {
                    undo();
                }
            }
            // Ctrl+Y 或 Ctrl+Shift+Z: 恢复
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                if (history.canRedo) {
                    redo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, history.canUndo, history.canRedo]);

    // 同步 JSON 内容到 workflow
    useEffect(() => {
        if (workflow && viewMode === 'visual') {
            setJsonContent(JSON.stringify(workflow, null, 2));
            setJsonError(null);
        }
    }, [workflow, viewMode]);

    // 处理视图切换
    const handleViewModeChange = useCallback((mode: ViewMode) => {
        if (mode === viewMode) return;
        
        if (mode === 'json' && workflow) {
            setJsonContent(JSON.stringify(workflow, null, 2));
            setJsonError(null);
        }
        
        setViewMode(mode);
    }, [viewMode, workflow]);

    // 处理 JSON 内容变化
    const handleJsonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setJsonContent(newContent);
        
        try {
            const parsed = JSON.parse(newContent);
            setWorkflow(parsed);
            setJsonError(null);
            vscode.postMessage({
                type: 'workflow:update',
                payload: parsed
            });
        } catch (err) {
            setJsonError((err as Error).message);
        }
    }, [setWorkflow]);

    // Handle node drag from palette
    const handleNodeDragStart = useCallback((type: string) => {
        (window as any).__draggedNodeType = type;
        (window as any).__isNewNode = true;
    }, []);

    // Handle existing node drag start
    const handleNodeDragStartFromCanvas = useCallback((nodeId: string) => {
        console.log('[App] Drag start from canvas:', nodeId);
        setDraggedNodeId(nodeId);
        (window as any).__isNewNode = false;
    }, []);
    
    // Handle drag over delete zone
    const handleDeleteZoneDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        console.log('[App] Delete zone drag over, draggedNodeId:', draggedNodeId);
        if (draggedNodeId) {
            setIsDeleteZoneActive(true);
        }
    }, [draggedNodeId]);

    // Handle drag leave delete zone
    const handleDeleteZoneDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        console.log('[App] Delete zone drag leave');
        setIsDeleteZoneActive(false);
    }, []);

    // Handle drop on delete zone
    const handleDeleteZoneDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[App] Delete zone drop, draggedNodeId:', draggedNodeId, 'isNewNode:', (window as any).__isNewNode);
        
        // 只处理从画布拖拽的节点，不处理从 palette 拖拽的新节点
        const isNewNode = (window as any).__isNewNode;
        if (isNewNode) {
            console.log('[App] New node dropped on delete zone, ignoring');
            // 新节点拖到删除区，不删除，但阻止事件传播
            return;
        }
        
        console.log('[App] Attempting to delete node:', draggedNodeId, 'workflow exists:', !!workflow);
        if (draggedNodeId && workflow) {
            const node = workflow.nodes.find(n => n.id === draggedNodeId);
            console.log('[App] Found node:', node?.id, 'node type:', node?.type);
            if (node) {
                console.log('[App] Calling deleteNode for:', draggedNodeId);
                deleteNode(draggedNodeId);
                vscode.postMessage({
                    type: 'node:delete',
                    payload: { 
                        workflow,
                        nodeId: draggedNodeId,
                        nodeType: node.type
                    }
                });
                console.log('[App] Node deleted and message sent');
            }
        }
        setIsDeleteZoneActive(false);
        setDraggedNodeId(null);
        delete (window as any).__isNewNode;
    }, [draggedNodeId, workflow, deleteNode]);
    
    // Handle drop on canvas
    const handleCanvasDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const type = (window as any).__draggedNodeType;
        const isNewNode = (window as any).__isNewNode;

        // 如果是从画布拖拽的节点，不做处理（已由 delete zone 处理）
        if (!isNewNode) {
            setDraggedNodeId(null);
            delete (window as any).__isNewNode;
            return;
        }

        if (!type) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - 100);
        const y = (e.clientY - rect.top - 40);

        const node = nodeRegistry.createNode(type, { x, y });

        // 先添加节点到 store
        addNode(node);

        // 再获取包含新节点的最新 workflow 状态
        const updatedWorkflow = useCanvasStore.getState().workflow;

        vscode.postMessage({
            type: 'node:add',
            payload: { workflow: updatedWorkflow, node }
        });

        delete (window as any).__draggedNodeType;
        delete (window as any).__isNewNode;
    }, [addNode]);
    
    // Handle save
    const handleSave = useCallback(() => {
        if (workflow) {
            vscode.postMessage({
                type: 'workflow:save',
                payload: workflow
            });
            markClean();
        }
    }, [workflow, markClean]);
    
    // Handle run
    const handleRun = useCallback(() => {
        if (workflow) {
            vscode.postMessage({ 
                type: 'workflow:run',
                payload: workflow 
            });
        }
    }, [workflow]);
    
    // Handle debug
    const handleDebug = useCallback(() => {
        if (workflow) {
            vscode.postMessage({
                type: 'workflow:debug',
                payload: workflow
            });
        }
    }, [workflow]);

    // Handle undo
    const handleUndo = useCallback(() => {
        undo();
    }, [undo]);

    // Handle redo
    const handleRedo = useCallback(() => {
        redo();
    }, [redo]);

    // Global mouse up handler to detect delete zone drop
    useEffect(() => {
        const handleGlobalMouseUp = (e: MouseEvent) => {
            if (draggedNodeId && deleteZoneRef.current) {
                const deleteZoneRect = deleteZoneRef.current.getBoundingClientRect();
                const isInDeleteZone =
                    e.clientX >= deleteZoneRect.left &&
                    e.clientX <= deleteZoneRect.right &&
                    e.clientY >= deleteZoneRect.top &&
                    e.clientY <= deleteZoneRect.bottom;

                if (isInDeleteZone) {
                    const node = workflow?.nodes.find(n => n.id === draggedNodeId);
                    if (node) {
                        deleteNode(draggedNodeId);
                        vscode.postMessage({
                            type: 'node:delete',
                            payload: {
                                workflow,
                                nodeId: draggedNodeId,
                                nodeType: node.type
                            }
                        });
                    }
                }
            }
            setDraggedNodeId(null);
            setIsDeleteZoneActive(false);
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [draggedNodeId, workflow, deleteNode]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--vscode-editor-background)',
            color: 'var(--vscode-foreground)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <Toolbar
                onSave={handleSave}
                onRun={handleRun}
                onDebug={handleDebug}
                onUndo={handleUndo}
                onRedo={handleRedo}
                isRunning={executionState?.status === 'running'}
                canSave={isDirty}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
            />
            
            {/* 视图切换按钮 */}
            <div style={{
                display: 'flex',
                padding: '8px 16px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                background: 'var(--vscode-editor-background)',
                gap: '8px'
            }}>
                <button
                    onClick={() => handleViewModeChange('visual')}
                    style={{
                        padding: '6px 16px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: viewMode === 'visual' 
                            ? 'var(--vscode-button-background)' 
                            : 'var(--vscode-button-secondaryBackground)',
                        color: viewMode === 'visual'
                            ? 'var(--vscode-button-foreground)'
                            : 'var(--vscode-button-secondaryForeground)',
                        fontSize: '13px',
                        fontWeight: 500
                    }}
                >
                    可视化
                </button>
                <button
                    onClick={() => handleViewModeChange('json')}
                    style={{
                        padding: '6px 16px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: viewMode === 'json' 
                            ? 'var(--vscode-button-background)' 
                            : 'var(--vscode-button-secondaryBackground)',
                        color: viewMode === 'json'
                            ? 'var(--vscode-button-foreground)'
                            : 'var(--vscode-button-secondaryForeground)',
                        fontSize: '13px',
                        fontWeight: 500
                    }}
                >
                    JSON 文本
                </button>
                {jsonError && (
                    <span style={{
                        color: 'var(--vscode-errorForeground)',
                        fontSize: '12px',
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        ⚠️ JSON 格式错误
                    </span>
                )}
            </div>
            
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* 只在可视化模式显示左侧面板 */}
                {viewMode === 'visual' && (
                    <div style={{ width: '200px', flexShrink: 0 }}>
                        <NodePalette onNodeDragStart={handleNodeDragStart} />
                    </div>
                )}
                
                <div 
                    style={{ 
                        flex: 1, 
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                >
                    {viewMode === 'visual' ? (
                        <>
                            <Canvas
                                onNodeSelect={setSelectedNodeId}
                                onNodeDragStart={handleNodeDragStartFromCanvas}
                                onNodeDragMove={(nodeId, clientX, clientY) => {
                                    if (nodeId && deleteZoneRef.current) {
                                        const rect = deleteZoneRef.current.getBoundingClientRect();
                                        const isInDeleteZone =
                                            clientX >= rect.left &&
                                            clientX <= rect.right &&
                                            clientY >= rect.top &&
                                            clientY <= rect.bottom;
                                        setIsDeleteZoneActive(isInDeleteZone);
                                    }
                                }}
                                onNodeDragEnd={(nodeId, clientX, clientY) => {
                                    console.log('[App] onNodeDragEnd, nodeId:', nodeId, 'clientX:', clientX, 'clientY:', clientY);

                                    // 检测是否在删除区域内
                                    if (deleteZoneRef.current) {
                                        const rect = deleteZoneRef.current.getBoundingClientRect();
                                        const isInDeleteZone =
                                            clientX >= rect.left &&
                                            clientX <= rect.right &&
                                            clientY >= rect.top &&
                                            clientY <= rect.bottom;

                                        console.log('[App] Delete zone rect:', rect, 'isInDeleteZone:', isInDeleteZone);

                                        if (isInDeleteZone) {
                                            // 使用 getState 获取最新状态和函数
                                            const store = useCanvasStore.getState();
                                            console.log('[App] Current workflow exists:', !!store.workflow);
                                            if (store.workflow) {
                                                const node = store.workflow.nodes.find(n => n.id === nodeId);
                                                console.log('[App] Found node for deletion:', node?.id, 'total nodes:', store.workflow.nodes.length);
                                                if (node) {
                                                    console.log('[App] Deleting node:', nodeId);
                                                    store.deleteNode(nodeId);
                                                    
                                                    // deleteNode 后重新获取更新后的状态
                                                    const updatedStore = useCanvasStore.getState();
                                                    console.log('[App] After delete, nodes count:', updatedStore.workflow?.nodes.length);
                                                    
                                                    vscode.postMessage({
                                                        type: 'node:delete',
                                                        payload: {
                                                            workflow: updatedStore.workflow,
                                                            nodeId,
                                                            nodeType: node.type
                                                        }
                                                    });
                                                    console.log('[App] Delete message sent with updated workflow');
                                                }
                                            }
                                        }
                                    }

                                    setIsDeleteZoneActive(false);
                                    setDraggedNodeId(null);
                                    delete (window as any).__isNewNode;
                                }}
                                executionState={executionState}
                            />
                            
                            {/* 删除区域 - 只在从画布拖拽节点时显示 */}
                            {draggedNodeId && (
                            <div
                                ref={deleteZoneRef}
                                style={{
                                    position: 'absolute',
                                    bottom: '20px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: '120px',
                                    height: '60px',
                                    background: isDeleteZoneActive 
                                        ? 'var(--vscode-inputValidation-errorBackground)' 
                                        : 'var(--vscode-editorWidget-background)',
                                    border: `2px dashed ${isDeleteZoneActive 
                                        ? 'var(--vscode-inputValidation-errorBorder)' 
                                        : 'var(--vscode-editorWidget-border)'}`,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    zIndex: 1000
                                }}
                                onDragOver={handleDeleteZoneDragOver}
                                onDragLeave={handleDeleteZoneDragLeave}
                                onDrop={handleDeleteZoneDrop}
                            >
                                <span style={{
                                    fontSize: '24px',
                                    color: isDeleteZoneActive 
                                        ? 'var(--vscode-inputValidation-errorForeground)' 
                                        : 'var(--vscode-foreground)'
                                }}>
                                    🗑️
                                </span>
                                <span style={{
                                    marginLeft: '8px',
                                    fontSize: '12px',
                                    color: isDeleteZoneActive 
                                        ? 'var(--vscode-inputValidation-errorForeground)' 
                                        : 'var(--vscode-foreground)'
                                }}>
                                    删除节点
                                </span>
                            </div>
                            )}
                        </>
                    ) : (
                        /* JSON 文本编辑器 */
                        <textarea
                            value={jsonContent}
                            onChange={handleJsonChange}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                outline: 'none',
                                padding: '16px',
                                fontFamily: 'var(--vscode-editor-font-family), monospace',
                                fontSize: 'var(--vscode-editor-font-size)',
                                lineHeight: '1.5',
                                background: 'var(--vscode-editor-background)',
                                color: 'var(--vscode-editor-foreground)',
                                resize: 'none',
                                tabSize: 2
                            }}
                            spellCheck={false}
                        />
                    )}
                </div>
                
                {/* 只在可视化模式显示右侧面板 */}
                {viewMode === 'visual' && (
                    <div style={{ width: '280px', flexShrink: 0 }}>
                        <PropertiesPanel 
                            selectedNodeId={selectedNodeId}
                            onOpenConfig={(nodeId) => {
                                const node = workflow?.nodes.find(n => n.id === nodeId);
                                if (node) {
                                    vscode.postMessage({
                                        type: 'node:openConfig',
                                        payload: { node }
                                    });
                                }
                            }}
                        />
                    </div>
                )}
            </div>
            
            {/* 执行状态栏 */}
            {executionState && executionState.status !== 'idle' && viewMode === 'visual' && (
                <div style={{
                    height: '30px',
                    background: executionState.status === 'running' 
                        ? 'var(--vscode-statusBar-debuggingBackground)'
                        : executionState.status === 'completed'
                            ? 'var(--vscode-statusBarItem-successBackground)'
                            : 'var(--vscode-statusBarItem-errorBackground)',
                    color: 'var(--vscode-statusBar-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    fontSize: '12px'
                }}>
                    <span style={{ marginRight: '8px' }}>
                        {executionState.status === 'running' && '▶️'}
                        {executionState.status === 'completed' && '✅'}
                        {executionState.status === 'failed' && '❌'}
                    </span>
                    <span>
                        {executionState.status === 'running' && '执行中...'}
                        {executionState.status === 'completed' && '执行完成'}
                        {executionState.status === 'failed' && '执行失败'}
                    </span>
                    {executionState.currentNodeId && (
                        <span style={{ marginLeft: 'auto' }}>
                            当前节点: {executionState.currentNodeId}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
