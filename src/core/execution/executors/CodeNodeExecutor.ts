import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../../shared/types/index';
import { NodeExecutor } from './NodeExecutorFactory';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export class CodeNodeExecutor extends NodeExecutor {
    type = 'code';

    async execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
        const { code, timeout = 30, environment = {} } = node.data;
        const inputs = this.resolveInputs(node, context);

        if (!code || typeof code !== 'string') {
            return {
                success: false,
                error: new Error('Code is required'),
                outputs: {}
            };
        }

        try {
            const result = await this.executePython(code, inputs, environment, timeout);
            
            return {
                success: result.success,
                outputs: result.success ? { output: result.data } : {},
                error: result.error,
                logs: result.logs
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                outputs: {},
                logs: [`Fatal error: ${(error as Error).message}`]
            };
        }
    }

    private async executePython(
        code: string,
        inputs: Record<string, any>,
        environment: Record<string, string>,
        timeout: number
    ): Promise<{ success: boolean; data?: any; error?: Error; logs: string[] }> {
        const logs: string[] = [];
        
        // 创建临时 Python 脚本
        const tempDir = os.tmpdir();
        const scriptPath = path.join(tempDir, `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
        
        // 包装用户代码，提供 ctx 变量和捕获输出
        const wrappedCode = `
import json
import sys
import os

# 设置环境变量
env_vars = ${JSON.stringify(environment)}
for key, value in env_vars.items():
    os.environ[key] = str(value)

# 输入数据
ctx = ${JSON.stringify(inputs)}

# 捕获输出
_output = []
_original_print = print

def _capture_print(*args, **kwargs):
    message = ' '.join(str(arg) for arg in args)
    _output.append(message)
    _original_print(*args, **kwargs)

# 替换 print
globals()['print'] = _capture_print

# 执行用户代码
_result = None
_error = None

try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    _error = str(e)

# 输出结果
print(json.dumps({
    'success': _error is None,
    'data': _result if '_result' in dir() else None,
    'logs': _output,
    'error': _error
}))
`;

        try {
            // 写入临时文件
            fs.writeFileSync(scriptPath, wrappedCode, 'utf-8');
            
            // 执行 Python
            const result = await this.runPython(scriptPath, timeout);
            
            // 解析输出
            const lines = result.stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            
            try {
                const parsed = JSON.parse(lastLine);
                return {
                    success: parsed.success,
                    data: parsed.data,
                    error: parsed.error ? new Error(parsed.error) : undefined,
                    logs: parsed.logs || lines.slice(0, -1)
                };
            } catch (parseError) {
                // 如果不是 JSON，返回原始输出
                return {
                    success: result.code === 0,
                    data: result.stdout,
                    error: result.stderr ? new Error(result.stderr) : undefined,
                    logs: lines
                };
            }
        } finally {
            // 清理临时文件
            try {
                fs.unlinkSync(scriptPath);
            } catch {
                // 忽略清理错误
            }
        }
    }

    private runPython(scriptPath: string, timeout: number): Promise<{ code: number; stdout: string; stderr: string }> {
        return new Promise((resolve) => {
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const proc = spawn(pythonCmd, [scriptPath], {
                timeout: timeout * 1000,
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                resolve({ code: code || 0, stdout, stderr });
            });

            proc.on('error', (err) => {
                resolve({ code: 1, stdout, stderr: err.message });
            });

            // 超时处理
            setTimeout(() => {
                proc.kill('SIGTERM');
                resolve({ code: 124, stdout, stderr: 'Execution timeout' });
            }, timeout * 1000);
        });
    }

    validate(config: Record<string, any>): ValidationResult {
        if (!config.code || typeof config.code !== 'string') {
            return { valid: false, errors: ['Code is required'] };
        }
        return { valid: true };
    }
}
