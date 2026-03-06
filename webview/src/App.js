"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const Canvas_1 = require("./components/Canvas");
const NodePalette_1 = require("./components/NodePalette");
const PropertiesPanel_1 = require("./components/PropertiesPanel");
const Toolbar_1 = require("./components/Toolbar");
const canvasStore_1 = require("./stores/canvasStore");
const NodeRegistry_1 = require("../../src/core/node/NodeRegistry");
const vscode = acquireVsCodeApi();
const nodeRegistry = new NodeRegistry_1.NodeRegistry();
function App() {
    const [selectedNodeId, setSelectedNodeId] = (0, react_1.useState)(null);
    const { workflow, setWorkflow, addNode, markClean } = (0, canvasStore_1.useCanvasStore)();
    // Load workflow from VSCode
    (0, react_1.useEffect)(() => {
        // 从 window.__WORKFLOW_DATA__ 加载初始数据
        const initialWorkflow = window.__WORKFLOW_DATA__;
        if (initialWorkflow) {
            setWorkflow(initialWorkflow);
        }
        const handleMessage = (event) => {
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
    const handleNodeDragStart = (0, react_1.useCallback)((type) => {
        // Store the node type being dragged
        window.__draggedNodeType = type;
    }, []);
    // Handle drop on canvas
    const handleCanvasDrop = (0, react_1.useCallback)((e) => {
        e.preventDefault();
        const type = window.__draggedNodeType;
        if (!type)
            return;
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
        delete window.__draggedNodeType;
    }, [addNode]);
    // Handle save
    const handleSave = (0, react_1.useCallback)(() => {
        if (workflow) {
            vscode.postMessage({
                type: 'workflow:save',
                payload: workflow
            });
            markClean();
        }
    }, [workflow, markClean]);
    // Handle run
    const handleRun = (0, react_1.useCallback)(() => {
        vscode.postMessage({ type: 'workflow:run' });
    }, []);
    // Handle debug
    const handleDebug = (0, react_1.useCallback)(() => {
        vscode.postMessage({ type: 'workflow:debug' });
    }, []);
    return (<div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--vscode-editor-background)',
            color: 'var(--vscode-foreground)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <Toolbar_1.Toolbar onSave={handleSave} onRun={handleRun} onDebug={handleDebug} canSave={(0, canvasStore_1.useCanvasStore)(state => state.isDirty)}/>
            
            <div style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden'
        }}>
                <div style={{ width: '200px', flexShrink: 0 }}>
                    <NodePalette_1.NodePalette onNodeDragStart={handleNodeDragStart}/>
                </div>
                
                <div style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative'
        }} onDragOver={(e) => e.preventDefault()} onDrop={handleCanvasDrop}>
                    <Canvas_1.Canvas onNodeSelect={setSelectedNodeId}/>
                </div>
                
                <div style={{ width: '280px', flexShrink: 0 }}>
                    <PropertiesPanel_1.PropertiesPanel selectedNodeId={selectedNodeId}/>
                </div>
            </div>
        </div>);
}
exports.default = App;
//# sourceMappingURL=App.js.map