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
exports.PropertiesPanel = void 0;
const react_1 = __importStar(require("react"));
const canvasStore_1 = require("../stores/canvasStore");
const PropertiesPanel = ({ selectedNodeId }) => {
    const { workflow, updateNodeData } = (0, canvasStore_1.useCanvasStore)();
    const [activeTab, setActiveTab] = (0, react_1.useState)('properties');
    const node = selectedNodeId
        ? workflow?.nodes.find(n => n.id === selectedNodeId)
        : null;
    if (!node) {
        return (<div style={{
                padding: '16px',
                background: 'var(--vscode-sideBar-background)',
                borderLeft: '1px solid var(--vscode-panel-border)',
                height: '100%',
                color: 'var(--vscode-descriptionForeground)'
            }}>
                <p>Select a node to edit properties</p>
            </div>);
    }
    const handleDataChange = (key, value) => {
        updateNodeData(node.id, { [key]: value });
    };
    return (<div style={{
            padding: '16px',
            background: 'var(--vscode-sideBar-background)',
            borderLeft: '1px solid var(--vscode-panel-border)',
            height: '100%',
            overflow: 'auto'
        }}>
            <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            paddingBottom: '8px'
        }}>
                <button onClick={() => setActiveTab('properties')} style={{
            padding: '4px 12px',
            border: 'none',
            background: activeTab === 'properties'
                ? 'var(--vscode-list-activeSelectionBackground)'
                : 'transparent',
            color: 'var(--vscode-foreground)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        }}>
                    Properties
                </button>
                <button onClick={() => setActiveTab('settings')} style={{
            padding: '4px 12px',
            border: 'none',
            background: activeTab === 'settings'
                ? 'var(--vscode-list-activeSelectionBackground)'
                : 'transparent',
            color: 'var(--vscode-foreground)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        }}>
                    Settings
                </button>
            </div>
            
            <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--vscode-foreground)'
        }}>
                {node.metadata?.name || node.type}
            </h3>
            
            {activeTab === 'properties' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Common fields */}
                    <div>
                        <label style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: '4px',
                textTransform: 'uppercase'
            }}>
                            Name
                        </label>
                        <input type="text" value={node.metadata?.name || ''} onChange={(e) => handleDataChange('name', e.target.value)} style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
                color: 'var(--vscode-input-foreground)',
                borderRadius: '4px',
                fontSize: '13px'
            }}/>
                    </div>
                    
                    <div>
                        <label style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: '4px',
                textTransform: 'uppercase'
            }}>
                            Description
                        </label>
                        <textarea value={node.metadata?.description || ''} onChange={(e) => handleDataChange('description', e.target.value)} rows={3} style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--vscode-input-background)',
                border: '1px solid var(--vscode-input-border)',
                color: 'var(--vscode-input-foreground)',
                borderRadius: '4px',
                fontSize: '13px',
                resize: 'vertical'
            }}/>
                    </div>
                    
                    {/* Type-specific fields */}
                    {node.type === 'code' && (<div>
                            <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--vscode-descriptionForeground)',
                    marginBottom: '4px',
                    textTransform: 'uppercase'
                }}>
                                Python Code
                            </label>
                            <textarea value={node.data.code || ''} onChange={(e) => handleDataChange('code', e.target.value)} rows={10} style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-input-border)',
                    color: 'var(--vscode-input-foreground)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    resize: 'vertical'
                }}/>
                        </div>)}
                    
                    {node.type === 'llm' && (<>
                            <div>
                                <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--vscode-descriptionForeground)',
                    marginBottom: '4px',
                    textTransform: 'uppercase'
                }}>
                                    Model
                                </label>
                                <select value={node.data.model || 'gpt-4'} onChange={(e) => handleDataChange('model', e.target.value)} style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-input-border)',
                    color: 'var(--vscode-input-foreground)',
                    borderRadius: '4px',
                    fontSize: '13px'
                }}>
                                    <option value="gpt-4">GPT-4</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                    <option value="claude-3-opus">Claude 3 Opus</option>
                                    <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                                </select>
                            </div>
                            
                            <div>
                                <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--vscode-descriptionForeground)',
                    marginBottom: '4px',
                    textTransform: 'uppercase'
                }}>
                                    Prompt
                                </label>
                                <textarea value={node.data.prompt || ''} onChange={(e) => handleDataChange('prompt', e.target.value)} rows={6} style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--vscode-input-background)',
                    border: '1px solid var(--vscode-input-border)',
                    color: 'var(--vscode-input-foreground)',
                    borderRadius: '4px',
                    fontSize: '13px',
                    resize: 'vertical'
                }}/>
                            </div>
                        </>)}
                </div>)}
            
            {activeTab === 'settings' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: '4px',
                textTransform: 'uppercase'
            }}>
                            Node ID
                        </label>
                        <code style={{
                display: 'block',
                padding: '6px 8px',
                background: 'var(--vscode-textCodeBlock-background)',
                color: 'var(--vscode-textCodeBlock-foreground)',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace'
            }}>
                            {node.id}
                        </code>
                    </div>
                    
                    <div>
                        <label style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: '4px',
                textTransform: 'uppercase'
            }}>
                            Position
                        </label>
                        <div style={{
                display: 'flex',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--vscode-foreground)'
            }}>
                            <span>X: {Math.round(node.position.x)}</span>
                            <span>Y: {Math.round(node.position.y)}</span>
                        </div>
                    </div>
                </div>)}
        </div>);
};
exports.PropertiesPanel = PropertiesPanel;
//# sourceMappingURL=PropertiesPanel.js.map