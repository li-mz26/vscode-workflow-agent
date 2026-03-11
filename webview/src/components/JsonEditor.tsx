import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

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
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    // Configure Monaco before editor mounts
    const handleEditorWillMount: BeforeMount = useCallback((monaco) => {
        // Define a custom theme that matches VSCode's dark theme
        monaco.editor.defineTheme('vscode-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#1e1e1e',
                'editor.foreground': '#d4d4d4',
                'editorLineNumber.foreground': '#858585',
                'editorLineNumber.activeForeground': '#c6c6c6',
                'editor.selectionBackground': '#264f78',
                'editor.lineHighlightBackground': '#2a2d2e',
                'editorCursor.foreground': '#aeafad',
                'editorWhitespace.foreground': '#3b3b3b',
                'editorIndentGuide.background': '#404040',
                'editorIndentGuide.activeBackground': '#707070',
            }
        });

        // Configure JSON language settings
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: true,
            schemas: [],
            enableSchemaRequest: false,
            allowComments: false,
            trailingCommas: 'error'
        });
    }, []);

    // Handle editor mount
    const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;

        // Set editor options
        editor.updateOptions({
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'var(--vscode-editor-font-family), Menlo, Monaco, "Courier New", monospace',
            fontLigatures: false,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: 'on',
            folding: true,
            foldingHighlight: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'always',
            bracketPairColorization: { enabled: true },
            formatOnPaste: true,
            formatOnType: true,
            quickSuggestions: {
                other: true,
                comments: false,
                strings: true
            },
            suggest: {
                showProperties: true,
                showKeywords: true
            }
        });

        // Add keyboard shortcuts
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            // Format document on save
            editor.getAction('editor.action.formatDocument')?.run();
        });

        // Add command for format on Shift+Alt+F (VSCode default)
        editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
            editor.getAction('editor.action.formatDocument')?.run();
        });

        // Focus the editor
        editor.focus();
    }, []);

    // Handle content changes
    const handleChange = useCallback((value: string | undefined) => {
        if (value === undefined) return;

        onChange(value);

        // Validate JSON and report errors
        try {
            JSON.parse(value);
            onError?.(null);
        } catch (err) {
            onError?.((err as Error).message);
        }
    }, [onChange, onError]);

    // Format JSON when value changes externally
    useEffect(() => {
        if (editorRef.current) {
            const currentValue = editorRef.current.getValue();
            if (value !== currentValue) {
                // Check if the editor has focus (user is editing)
                const hasFocus = editorRef.current.hasTextFocus();
                if (!hasFocus) {
                    // Only update if editor doesn't have focus
                    editorRef.current.setValue(value);
                }
            }
        }
    }, [value]);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden'
        }}>
            <Editor
                height="100%"
                defaultLanguage="json"
                value={value}
                onChange={handleChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                theme="vscode-dark"
                options={{
                    readOnly,
                    lineNumbers: 'on',
                    glyphMargin: false,
                    folding: true,
                    lineDecorationsWidth: 10,
                    lineNumbersMinChars: 3,
                    renderLineHighlight: 'line',
                    scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        useShadows: false,
                        verticalScrollbarSize: 14,
                        horizontalScrollbarSize: 14
                    },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false
                }}
                loading={
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: 'var(--vscode-foreground)',
                        fontSize: '14px'
                    }}>
                        Loading editor...
                    </div>
                }
            />
        </div>
    );
};

export default JsonEditor;