import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { NodePalette } from './components/NodePalette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import { JsonEditor } from './components/JsonEditor';
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

// 拖拽状态类型
interface DragState {
    isDragging: boolean;
    nodeId: string | null;
    isNewNode: boolean;
    nodeType: string | null;
}

function App() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [executionState, setExecutionState] = useState<WorkflowExecutionState | null>(null);
    const [isDeleteZoneActive, setIsDeleteZoneActive] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [jsonContent, setJsonContent] = useState<string>('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    
    // 使用 ref 存储拖拽状态，避免闭包问题和全局变量污染
    const dragStateRef = useRef<DragState>({
        isDragging: false,
        nodeId: null,
        isNewNode: false,
        nodeType: null
    });
    
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
        clearNodeExecutionData,
        saveMoveHistory
    } = useCanvasStore();
    
    const deleteZoneRef = useRef<HTMLDivElement>(null);
    
    // 统一的删除节点处理函数
    const handleDeleteNode = useCallback((nodeId: string) => {
        const store = useCanvasStore.getState();
        if (!store.workflow) return;
        
        const node = store.workflow.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        console.log('[App] Deleting node:', nodeId);
        store.deleteNode(nodeId);
        
        // 获取更新后的 workflow
        const updatedWorkflow = useCanvasStore.getState().workflow;
        
        vscode.postMessage({
            type: 'node:delete',
            payload: {
                workflow: updatedWorkflow,
                nodeId,
                nodeType: node.type
            }
        });
    }, []);
    
    // 检查坐标是否在删除区域内
    const checkInDeleteZone = useCallback((clientX: number, clientY: number): boolean => {
        if (!deleteZoneRef.current) return false;
        
        const rect = deleteZoneRef.current.getBoundingClientRect();
        return (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        );
    }, []);
    
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
    const handleJsonChange = useCallback((newContent: string) => {
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

    // Handle node drag start from palette (新节点)
    const handleNodeDragStart = useCallback((type: string) => {
        dragStateRef.current = {
            isDragging: true,
            nodeId: null,
            isNewNode: true,
            nodeType: type
        };
    }, []);

    // Handle existing node drag start (画布上的节点)
    const handleNodeDragStartFromCanvas = useCallback((nodeId: string) => {
        const node = workflow?.nodes.find(n => n.id === nodeId);
        dragStateRef.current = {
            isDragging: true,
            nodeId,
            isNewNode: false,
            nodeType: node?.type || null
        };
    }, [workflow]);
    
    // Handle node drag move - 更新删除区域状态
    const handleNodeDragMove = useCallback((nodeId: string | null, clientX: number, clientY: number) => {
        if (dragStateRef.current.isDragging && !dragStateRef.current.isNewNode) {
            setIsDeleteZoneActive(checkInDeleteZone(clientX, clientY));
        }
    }, [checkInDeleteZone]);
    
    // Handle node drag end - 统一的拖拽结束处理
    const handleNodeDragEnd = useCallback((nodeId: string | null, clientX: number, clientY: number) => {
        const dragState = dragStateRef.current;
        
        // 只处理画布上的节点拖拽结束
        if (!dragState.isDragging || dragState.isNewNode || !nodeId) {
            // 如果是新节点，检查是否要添加到画布
            if (dragState.isNewNode && dragState.nodeType) {
                // 新节点处理由 handleCanvasDrop 处理
            }
            dragStateRef.current = { isDragging: false, nodeId: null, isNewNode: false, nodeType: null };
            setIsDeleteZoneActive(false);
            return;
        }
        
        // 检查是否在删除区域
        if (checkInDeleteZone(clientX, clientY)) {
            handleDeleteNode(nodeId);
        } else {
            // 不在删除区域，保存移动历史（支持撤销）
            saveMoveHistory();
        }
        
        // 重置拖拽状态
        dragStateRef.current = { isDragging: false, nodeId: null, isNewNode: false, nodeType: null };
        setIsDeleteZoneActive(false);
    }, [checkInDeleteZone, handleDeleteNode, saveMoveHistory]);
    
    // Handle drop on canvas (添加新节点)
    const handleCanvasDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const dragState = dragStateRef.current;
        
        // 只处理新节点拖拽
        if (!dragState.isDragging || !dragState.isNewNode || !dragState.nodeType) {
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - 100);
        const y = (e.clientY - rect.top - 40);

        const node = nodeRegistry.createNode(dragState.nodeType, { x, y });

        // 添加节点到 store
        addNode(node);

        // 获取包含新节点的最新 workflow 状态
        const updatedWorkflow = useCanvasStore.getState().workflow;

        vscode.postMessage({
            type: 'node:add',
            payload: { workflow: updatedWorkflow, node }
        });

        // 重置拖拽状态
        dragStateRef.current = { isDragging: false, nodeId: null, isNewNode: false, nodeType: null };
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

    // 全局 mouseup 监听，确保拖拽状态正确重置
    useEffect(() => {
        const handleGlobalMouseUp = (e: MouseEvent) => {
            const dragState = dragStateRef.current;
            
            if (dragState.isDragging && !dragState.isNewNode && dragState.nodeId) {
                // 如果还在拖拽状态，检查最终位置
                if (checkInDeleteZone(e.clientX, e.clientY)) {
                    handleDeleteNode(dragState.nodeId);
                }
            }
            
            // 重置状态
            dragStateRef.current = { isDragging: false, nodeId: null, isNewNode: false, nodeType: null };
            setIsDeleteZoneActive(false);
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [checkInDeleteZone, handleDeleteNode]);

    // 判断是否显示删除区域
    const showDeleteZone = dragStateRef.current.isDragging && !dragStateRef.current.isNewNode && dragStateRef.current.nodeId !== null;

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
                                onNodeDragMove={handleNodeDragMove}
                                onNodeDragEnd={handleNodeDragEnd}
                                executionState={executionState}
                            />
                            
                            {/* 删除区域 - 只在从画布拖拽节点时显示 */}
                            {showDeleteZone && (
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
                        <JsonEditor
                            value={jsonContent}
                            onChange={handleJsonChange}
                            onError={setJsonError}
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