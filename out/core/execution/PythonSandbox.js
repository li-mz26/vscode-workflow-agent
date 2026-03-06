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
exports.PythonSandbox = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const events_1 = require("events");
class PythonSandbox extends events_1.EventEmitter {
    constructor() {
        super();
        this.activeProcesses = new Map();
        this.pythonPath = this.getConfiguredPythonPath();
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workflowAgent.pythonPath')) {
                this.pythonPath = this.getConfiguredPythonPath();
            }
        });
    }
    getConfiguredPythonPath() {
        const config = vscode.workspace.getConfiguration('workflowAgent');
        return config.get('pythonPath', 'python3');
    }
    async execute(options) {
        const { code, variables = {}, timeout = 30000, environment = {} } = options;
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const script = this.generateSandboxScript(code, variables);
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let timeoutId;
            const pythonProcess = (0, child_process_1.spawn)(this.pythonPath, ['-c', script], {
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
                    }
                    catch (e) {
                        resolve({ success: false, stdout, stderr, error: new Error(`Parse error: ${e.message}`) });
                    }
                }
                else {
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
    generateSandboxScript(code, variables) {
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
    stopExecution(executionId) {
        const process = this.activeProcesses.get(executionId);
        if (process) {
            process.kill('SIGTERM');
            this.activeProcesses.delete(executionId);
            return true;
        }
        return false;
    }
    stopAllExecutions() {
        for (const [id, process] of this.activeProcesses) {
            process.kill('SIGTERM');
            this.activeProcesses.delete(id);
        }
    }
    getPythonPath() { return this.pythonPath; }
    async validatePython() {
        return new Promise((resolve) => {
            const process = (0, child_process_1.spawn)(this.pythonPath, ['--version']);
            let output = '', errorOutput = '';
            process.stdout?.on('data', (data) => { output += data.toString(); });
            process.stderr?.on('data', (data) => { errorOutput += data.toString(); });
            process.on('close', (code) => {
                if (code === 0)
                    resolve({ valid: true, version: (output || errorOutput).trim() });
                else
                    resolve({ valid: false, error: errorOutput || 'Unknown error' });
            });
            process.on('error', (error) => resolve({ valid: false, error: error.message }));
        });
    }
}
exports.PythonSandbox = PythonSandbox;
//# sourceMappingURL=PythonSandbox.js.map