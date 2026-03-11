import React, { useCallback, useEffect, useState } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';

// JSON syntax highlighting for Prism
(Prism.languages as any).json = {
    'property': {
        pattern: /"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
        greedy: true,
    },
    'string': {
        pattern: /"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,
        greedy: true,
    },
    'number': /\b-?\d+\.?\d*([Ee][+-]?\d+)?\b/,
    'boolean': /\b(?:true|false)\b/,
    'null': /\bnull\b/,
    'punctuation': /[{}[\],:]/,
};

interface JsonEditorProps {
    value: string;
    onChange: (value: string) => void;
    onError?: (error: string | null) => void;
    readOnly?: boolean;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
    value,
    onChange,
    onError,
    readOnly = false
}) => {
    const [internalValue, setInternalValue] = useState(value);

    // Sync external value changes
    useEffect(() => {
        setInternalValue(value);
    }, [value]);

    // Handle content changes
    const handleChange = useCallback((newCode: string) => {
        setInternalValue(newCode);
        onChange(newCode);

        // Validate JSON and report errors
        try {
            JSON.parse(newCode);
            onError?.(null);
        } catch (err) {
            onError?.((err as Error).message);
        }
    }, [onChange, onError]);

    // Highlight function for the editor
    const highlight = useCallback((code: string) => {
        return Prism.highlight(code, (Prism.languages as any).json, 'json');
    }, []);

    // Get VSCode theme colors
    const getThemeColors = () => {
        const style = getComputedStyle(document.documentElement);
        return {
            background: style.getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e',
            foreground: style.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4',
            fontFamily: style.getPropertyValue('--vscode-editor-font-family').trim() || 'Consolas, "Courier New", monospace',
            fontSize: style.getPropertyValue('--vscode-editor-font-size').trim() || '14px',
            lineNumber: style.getPropertyValue('--vscode-editorLineNumber-foreground').trim() || '#858585',
            selection: style.getPropertyValue('--vscode-editor-selectionBackground').trim() || '#264f78',
            lineHighlight: style.getPropertyValue('--vscode-editor-lineHighlightBackground').trim() || '#2a2d2e',
            errorForeground: style.getPropertyValue('--vscode-errorForeground').trim() || '#f44747',
        };
    };

    const theme = getThemeColors();

    return (
        <div style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            background: theme.background,
        }}>
            <Editor
                value={internalValue}
                onValueChange={handleChange}
                highlight={highlight}
                disabled={readOnly}
                padding={16}
                textareaId="json-editor"
                className="json-editor"
                style={{
                    background: theme.background,
                    fontFamily: theme.fontFamily,
                    fontSize: theme.fontSize,
                    lineHeight: 1.5,
                    minHeight: '100%',
                    outline: 'none',
                }}
            />
            <style>{`
                .json-editor {
                    counter-reset: line;
                }
                .json-editor > textarea {
                    outline: none !important;
                    caret-color: ${theme.foreground};
                    background: transparent !important;
                    color: transparent !important;
                }
                .json-editor > textarea:focus {
                    outline: none !important;
                }
                /* JSON syntax colors matching VSCode dark theme */
                .token.property {
                    color: #9cdcfe;
                }
                .token.string {
                    color: #ce9178;
                }
                .token.number {
                    color: #b5cea8;
                }
                .token.boolean {
                    color: #569cd6;
                }
                .token.null {
                    color: #569cd6;
                }
                .token.punctuation {
                    color: #d4d4d4;
                }
                /* Error underline */
                .json-error-line {
                    background: rgba(244, 71, 71, 0.2);
                }
            `}</style>
        </div>
    );
};

export default JsonEditor;