import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface PythonExecutionOptions {
    code: string;
    variables?: Record<string, any>;
    timeout?: number;
    environment?: Record<string, string>;
}

export interface PythonExecutionResult {
    success: boolean;
    output?: any;
    stdout?: string;
    stderr?: string;
    error?: Error;
}

export class PythonSandbox extends EventEmitter {
    private pythonPath: string;
    private activeProcesses: Map<string, ChildProcess> = new Map();

    constructor() {
        super();
        this.pythonPath = this.getConfiguredPythonPath();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workflowAgent.pythonPath')) {
                this.pythonPath = this.getConfiguredPythonPath();
            }
        });
    }

    private getConfiguredPythonPath(): string {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        return config.get<string>('pythonPath', 'python3');
    }

    async execute(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
        const { code, variables = {}, timeout = 30000, environment = {} } = options;
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const script = this.generateSandboxScript(code, variables);
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let timeoutId: NodeJS.Timeout;
            
            const pythonProcess = spawn(this.pythonPath, ['-c', script], {
                env: { ...process.env, ...environment, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
            
            this.activeProcesses.set(executionId, pythonProcess);
            
            pythonProcess.stdout?.on('data', (data) => { stdout += data.toString(); });
            pythonProcess.stderr?.on('data', (data) => { stderr += data.toString(); });
            
            pythonProcess.on('close', (code) => {
                clearTimeout(timeoutId);
                this.activeProcesses.delete(executionId);
                
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        resolve({ success: true, output: result, stdout, stderr: stderr || undefined });
                    } catch (e) {
                        resolve({ success: false, stdout, stderr, error: new Error(`Parse error: ${(e as Error).message}`) });
                    }
                } else {
                    resolve({ success: false, stdout, stderr, error: new Error(`Exit code ${code}`) });
                }
            });
            
            pythonProcess.on('error', (error) => {
                clearTimeout(timeoutId);
                this.activeProcesses.delete(executionId);
                resolve({ success: false, error, stdout, stderr });
            });
            
            timeoutId = setTimeout(() => {
                pythonProcess.kill('SIGTERM');
                this.activeProcesses.delete(executionId);
                resolve({ success: false, stdout, stderr, error: new Error(`Timeout after ${timeout}ms`) });
            }, timeout);
        });
    }

    private generateSandboxScript(code: string, variables: Record<string, any>): string {
        const serializedVars = JSON.stringify(variables);
        return `
import json, sys, builtins
ALLOWED = {'abs','all','any','bin','bool','bytearray','bytes','chr','complex','dict','dir','divmod','enumerate','filter','float','format','frozenset','hasattr','hash','hex','int','isinstance','issubclass','iter','len','list','map','max','min','next','oct','ord','pow','print','range','repr','reversed','round','set','slice','sorted','str','sum','tuple','type','zip','True','False','None'}
restricted = {'__builtins__': {k: v for k, v in builtins.__dict__.items() if k in ALLOWED}, 'json': json}
ctx = json.loads('''${serializedVars.replace(/'/g, "\\'")}''')
user_code = '''${code.replace(/'/g, "\\'")}'''
if 'def main' not in user_code:
    user_code = 'def main(ctx):\\n' + '\\n'.join('    ' + line for line in user_code.split('\\n'))
exec(user_code, restricted)
result = restricted.get('main', lambda x: None)(ctx)
print(json.dumps(result, default=str))
`;
    }

    stopExecution(executionId: string): boolean {
        const process = this.activeProcesses.get(executionId);
        if (process) { process.kill('SIGTERM'); this.activeProcesses.delete(executionId); return true; }
        return false;
    }

    stopAllExecutions(): void {
        for (const [id, process] of this.activeProcesses) { process.kill('SIGTERM'); this.activeProcesses.delete(id); }
    }

    getPythonPath(): string { return this.pythonPath; }

    async validatePython(): Promise<{ valid: boolean; version?: string; error?: string }> {
        return new Promise((resolve) => {
            const process = spawn(this.pythonPath, ['--version']);
            let output = '', errorOutput = '';
            process.stdout?.on('data', (data) => { output += data.toString(); });
            process.stderr?.on('data', (data) => { errorOutput += data.toString(); });
            process.on('close', (code) => {
                if (code === 0) resolve({ valid: true, version: (output || errorOutput).trim() });
                else resolve({ valid: false, error: errorOutput || 'Unknown error' });
            });
            process.on('error', (error) => resolve({ valid: false, error: error.message }));
        });
    }
}
