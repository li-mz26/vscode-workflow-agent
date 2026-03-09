import React, { useState } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

interface PropertiesPanelProps {
    selectedNodeId: string | null;
    onOpenConfig?: (nodeId: string) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
    selectedNodeId,
    onOpenConfig
}) => {
    const { workflow, updateNodeData, nodeExecutionData } = useCanvasStore();
    const [activeTab, setActiveTab] = useState<'properties' | 'settings' | 'input' | 'output'>('properties');
    
    const node = selectedNodeId 
        ? workflow?.nodes.find(n => n.id === selectedNodeId) 
        : null;
    
    // 获取节点执行数据
    const executionData = selectedNodeId ? nodeExecutionData[selectedNodeId] : null;
    
    if (!node) {
        return (
            <div style={{
                padding: '16px',
                background: 'var(--vscode-sideBar-background)',
                borderLeft: '1px solid var(--vscode-panel-border)',
                height: '100%',
                color: 'var(--vscode-descriptionForeground)'
            }}>
                <p>选择一个节点编辑属性</p>
            </div>
        );
    }
    
    const handleDataChange = (key: string, value: any) => {
        updateNodeData(node.id, { [key]: value });
    };

    // 判断节点是否支持外部配置
    const supportsExternalConfig = ['code', 'switch', 'llm'].includes(node.type);
    
    // Tab 按钮样式
    const tabButtonStyle = (tab: typeof activeTab) => ({
        padding: '4px 10px',
        border: 'none',
        background: activeTab === tab 
            ? 'var(--vscode-list-activeSelectionBackground)' 
            : 'transparent',
        color: activeTab === tab 
            ? 'var(--vscode-list-activeSelectionForeground)'
            : 'var(--vscode-foreground)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: activeTab === tab ? 600 : 400,
        transition: 'all 0.15s ease'
    });
    
    return (
        <div style={{
            padding: '16px',
            background: 'var(--vscode-sideBar-background)',
            borderLeft: '1px solid var(--vscode-panel-border)',
            height: '100%',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '16px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                paddingBottom: '8px',
                flexWrap: 'wrap'
            }}>
                <button
                    onClick={() => setActiveTab('properties')}
                    style={tabButtonStyle('properties')}
                >
                    属性
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    style={tabButtonStyle('settings')}
                >
                    设置
                </button>
                <button
                    onClick={() => setActiveTab('input')}
                    style={tabButtonStyle('input')}
                >
                    输入
                    {executionData?.input && <span style={{ 
                        marginLeft: '4px', 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        background: '#4CAF50',
                        display: 'inline-block'
                    }} />}
                </button>
                <button
                    onClick={() => setActiveTab('output')}
                    style={tabButtonStyle('output')}
                >
                    输出
                    {executionData?.output && <span style={{ 
                        marginLeft: '4px', 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        background: '#2196F3',
                        display: 'inline-block'
                    }} />}
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

            {/* 外部配置按钮 */}
            {supportsExternalConfig && onOpenConfig && (
                <div style={{ marginBottom: '16px' }}>
                    <button
                        onClick={() => onOpenConfig(node.id)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>📄</span>
                        {node.type === 'code' && '编辑代码文件'}
                        {node.type === 'switch' && '编辑分支配置'}
                        {node.type === 'llm' && '编辑提示词配置'}
                    </button>
                    <p style={{
                        fontSize: '10px',
                        color: 'var(--vscode-descriptionForeground)',
                        marginTop: '4px',
                        textAlign: 'center'
                    }}>
                        配置保存在外部文件中
                    </p>
                </div>
            )}
            
            {activeTab === 'properties' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Common fields */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--vscode-descriptionForeground)',
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}>
                            名称
                        </label>
                        <input
                            type="text"
                            value={node.metadata?.name || ''}
                            onChange={(e) => handleDataChange('name', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'var(--vscode-input-background)',
                                border: '1px solid var(--vscode-input-border)',
                                color: 'var(--vscode-input-foreground)',
                                borderRadius: '4px',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--vscode-descriptionForeground)',
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}>
                            描述
                        </label>
                        <textarea
                            value={node.metadata?.description || ''}
                            onChange={(e) => handleDataChange('description', e.target.value)}
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'var(--vscode-input-background)',
                                border: '1px solid var(--vscode-input-border)',
                                color: 'var(--vscode-input-foreground)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                    
                    {/* 代码节点 - 简化版编辑器（完整代码请使用外部文件） */}
                    {node.type === 'code' && (
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                marginBottom: '4px',
                                textTransform: 'uppercase'
                            }}>
                                Python 代码（预览）
                            </label>
                            <textarea
                                value={typeof node.data.code === 'string' 
                                    ? node.data.code.slice(0, 200) + (node.data.code.length > 200 ? '...' : '')
                                    : ''
                                }
                                readOnly
                                rows={5}
                                style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    background: 'var(--vscode-textCodeBlock-background)',
                                    border: '1px solid var(--vscode-panel-border)',
                                    color: 'var(--vscode-textCodeBlock-foreground)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    resize: 'none'
                                }}
                            />
                            <p style={{
                                fontSize: '10px',
                                color: 'var(--vscode-descriptionForeground)',
                                marginTop: '4px'
                            }}>
                                💡 点击上方按钮编辑完整代码
                            </p>
                        </div>
                    )}
                    
                    {/* LLM 节点基础配置 */}
                    {node.type === 'llm' && (
                        <>
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '11px',
                                    color: 'var(--vscode-descriptionForeground)',
                                    marginBottom: '4px',
                                    textTransform: 'uppercase'
                                }}>
                                    模型
                                </label>
                                <select
                                    value={node.data.model || 'gpt-4'}
                                    onChange={(e) => handleDataChange('model', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 8px',
                                        background: 'var(--vscode-input-background)',
                                        border: '1px solid var(--vscode-input-border)',
                                        color: 'var(--vscode-input-foreground)',
                                        borderRadius: '4px',
                                        fontSize: '13px'
                                    }}
                                >
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
                                    温度
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={node.data.temperature || 0.7}
                                    onChange={(e) => handleDataChange('temperature', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <span style={{
                                    fontSize: '11px',
                                    color: 'var(--vscode-foreground)'
                                }}>
                                    {node.data.temperature || 0.7}
                                </span>
                            </div>
                        </>
                    )}

                    {/* 条件分支节点 */}
                    {node.type === 'switch' && (
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                marginBottom: '4px',
                                textTransform: 'uppercase'
                            }}>
                                分支数量
                            </label>
                            <div style={{
                                padding: '8px',
                                background: 'var(--vscode-textCodeBlock-background)',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}
                            >
                                {(node.data.conditions?.length || 0) + 1} 个分支
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {activeTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--vscode-descriptionForeground)',
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}>
                            节点 ID
                        </label>
                        <code style={{
                            display: 'block',
                            padding: '6px 8px',
                            background: 'var(--vscode-textCodeBlock-background)',
                            color: 'var(--vscode-textCodeBlock-foreground)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace'
                        }}
                        >
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
                            节点类型
                        </label>
                        <code style={{
                            display: 'block',
                            padding: '6px 8px',
                            background: 'var(--vscode-textCodeBlock-background)',
                            color: 'var(--vscode-textCodeBlock-foreground)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace'
                        }}
                        >
                            {node.type}
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
                            位置
                        </label>
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            fontSize: '12px',
                            color: 'var(--vscode-foreground)'
                        }}
                        >
                            <span>X: {Math.round(node.position.x)}</span>
                            <span>Y: {Math.round(node.position.y)}</span>
                        </div>
                    </div>
                </div>
            )}
            
            {activeTab === 'input' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--vscode-descriptionForeground)',
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}>
                            最近运行的输入
                        </label>
                        
                        {executionData?.input ? (
                            <div>
                                <pre style={{
                                    padding: '10px',
                                    background: 'var(--vscode-textCodeBlock-background)',
                                    border: '1px solid var(--vscode-panel-border)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: 'var(--vscode-textCodeBlock-foreground)',
                                    overflow: 'auto',
                                    maxHeight: '300px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}
                                >
                                    {JSON.stringify(executionData.input, null, 2)}
                                </pre>
                                
                                {executionData.timestamp && (
                                    <p style={{
                                        fontSize: '10px',
                                        color: 'var(--vscode-descriptionForeground)',
                                        marginTop: '8px'
                                    }}>
                                        运行时间: {new Date(executionData.timestamp).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: 'var(--vscode-descriptionForeground)',
                                fontSize: '12px',
                                background: 'var(--vscode-textCodeBlock-background)',
                                borderRadius: '4px'
                            }}>
                                <p>暂无输入数据</p>
                                <p style={{ fontSize: '11px', marginTop: '4px' }}>
                                    运行工作流后查看节点输入
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'output' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--vscode-descriptionForeground)',
                            marginBottom: '4px',
                            textTransform: 'uppercase'
                        }}>
                            最近运行的输出
                        </label>
                        
                        {executionData?.output ? (
                            <div>
                                {executionData.status && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        marginBottom: '8px',
                                        background: executionData.status === 'success' 
                                            ? 'rgba(76, 175, 80, 0.2)'
                                            : executionData.status === 'error'
                                                ? 'rgba(244, 67, 54, 0.2)'
                                                : 'rgba(33, 150, 243, 0.2)',
                                        color: executionData.status === 'success'
                                            ? '#4CAF50'
                                            : executionData.status === 'error'
                                                ? '#F44336'
                                                : '#2196F3'
                                    }}
                                    >
                                        <span>
                                            {executionData.status === 'success' && '✓ 成功'}
                                            {executionData.status === 'error' && '✗ 失败'}
                                            {executionData.status === 'running' && '▶ 运行中'}
                                        </span>                                        
                                        {executionData.duration !== undefined && (
                                            <span>{executionData.duration}ms</span>
                                        )}
                                    </div>
                                )}
                                
                                <pre style={{
                                    padding: '10px',
                                    background: 'var(--vscode-textCodeBlock-background)',
                                    border: '1px solid var(--vscode-panel-border)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: 'var(--vscode-textCodeBlock-foreground)',
                                    overflow: 'auto',
                                    maxHeight: '300px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}
                                >
                                    {JSON.stringify(executionData.output, null, 2)}
                                </pre>
                                
                                {executionData.timestamp && (
                                    <p style={{
                                        fontSize: '10px',
                                        color: 'var(--vscode-descriptionForeground)',
                                        marginTop: '8px'
                                    }}>
                                        运行时间: {new Date(executionData.timestamp).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: 'var(--vscode-descriptionForeground)',
                                fontSize: '12px',
                                background: 'var(--vscode-textCodeBlock-background)',
                                borderRadius: '4px'
                            }}
                            >
                                <p>暂无输出数据</p>
                                <p style={{ fontSize: '11px', marginTop: '4px' }}>
                                    运行工作流后查看节点输出
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
