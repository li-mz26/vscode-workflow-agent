import React, { useState, useCallback, useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { NodePalette } from './components/NodePalette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import { useCanvasStore } from './stores/canvasStore';
import { NodeRegistry } from '../../src/core/node/NodeRegistry';

const vscode = acquireVsCodeApi();
const nodeRegistry = new NodeRegistry();

function App() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const { workflow, setWorkflow, addNode, markClean } = useCanvasStore();
    
    // Load workflow from VSCode
    useEffect(() => {
        // 从 window.__WORKFLOW_DATA__ 加载初始数据
        const initialWorkflow = (window as any).__WORKFLOW_DATA__;
        if (initialWorkflow) {
            setWorkflow(initialWorkflow);
        }
        
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'workflow:load':
                    setWorkflow(message.payload);
                    break;
                case 'workflow:update':
                    setWorkflow(message.payload);
                    break;
                case 'execution:status':
                    // Update execution status
                    break;
            }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Request initial workflow data
        vscode.postMessage({ type: 'webview:ready' });
        
        return () => window.removeEventListener('message', handleMessage);
    }, [setWorkflow]);
    
    // Handle node drag from palette
    const handleNodeDragStart = useCallback((type: string) => {
        // Store the node type being dragged
        (window as any).__draggedNodeType = type;
    }, []);
    
    // Handle drop on canvas
    const handleCanvasDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const type = (window as any).__draggedNodeType;
        if (!type) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - 100); // Center the node
        const y = (e.clientY - rect.top - 40);
        
        const node = nodeRegistry.createNode(type, { x, y });
        addNode(node);
        
        // Notify VSCode
        vscode.postMessage({
            type: 'node:add',
            payload: { node }
        });
        
        delete (window as any).__draggedNodeType;
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
        vscode.postMessage({ type: 'workflow:run' });
    }, []);
    
    // Handle debug
    const handleDebug = useCallback(() => {
        vscode.postMessage({ type: 'workflow:debug' });
    }, []);
    
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
                canSave={useCanvasStore(state => state.isDirty)}
            />
            
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                <div style={{ width: '200px', flexShrink: 0 }}>
                    <NodePalette onNodeDragStart={handleNodeDragStart} />
                </div>
                
                <div 
                    style={{ 
                        flex: 1, 
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                >
                    <Canvas onNodeSelect={setSelectedNodeId} />
                </div>
                
                <div style={{ width: '280px', flexShrink: 0 }}>
                    <PropertiesPanel selectedNodeId={selectedNodeId} />
                </div>
            </div>
        </div>
    );
}

export default App;
