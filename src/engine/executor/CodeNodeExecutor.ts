import { NodeExecutorBase } from './INodeExecutor';
import { Node, ExecutionContext, NodeExecutionResult, CodeNodeConfig } from '../types';
import * as vm from 'vm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * 代码节点执行器
 * 支持 JavaScript/TypeScript (使用 VM) 和 Python (使用子进程)
 */
export class CodeNodeExecutor extends NodeExecutorBase {
  async execute(
    node: Node,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      const config = node.data as unknown as CodeNodeConfig;
      
      if (!config) {
        throw new Error('Code node configuration not found');
      }

      let result: unknown;

      switch (config.language) {
        case 'javascript':
        case 'typescript':
          result = await this.executeJavaScript(config, inputs, context);
          break;
        case 'python':
          result = await this.executePython(config, inputs, context);
          break;
        default:
          throw new Error(`Unsupported language: ${config.language}`);
      }

      return this.successResult(result, Date.now() - startTime);
    } catch (error) {
      return this.errorResult(error as Error, Date.now() - startTime);
    }
  }

  /**
   * 执行 JavaScript 代码
   */
  private async executeJavaScript(
    config: CodeNodeConfig,
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    const code = config.code;
    const entryFunction = config.entryFunction || 'main';

    // 创建安全的沙箱环境
    const sandbox = {
      console,
      inputs,
      context: {
        workflowId: context.workflowId,
        executionId: context.executionId,
        variables: Object.fromEntries(context.variables),
        metadata: context.metadata
      },
      require: this.createSafeRequire(),
      module: { exports: {} },
      exports: {}
    };

    const script = new vm.Script(`
      (async () => {
        ${code}
        if (typeof ${entryFunction} === 'function') {
          return await ${entryFunction}(inputs, context);
        }
        throw new Error('Entry function "${entryFunction}" not found');
      })()
    `, {
      filename: `workflow_${context.executionId}.js`
    });

    const result = await script.runInNewContext(sandbox, {
      timeout: (config.timeout || 30) * 1000,
      displayErrors: true
    });

    return result;
  }

  /**
   * 执行 Python 代码
   */
  private async executePython(
    config: CodeNodeConfig,
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    const code = config.code;
    const entryFunction = config.entryFunction || 'main';

    // 创建临时 Python 文件
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `workflow_${context.executionId}.py`);

    // 包装代码以支持 JSON 输入输出
    const wrappedCode = `
import json
import sys
import os

# 设置环境变量
env_vars = ${JSON.stringify(config.environment || {})}
for key, value in env_vars.items():
    os.environ[key] = str(value)

# 输入数据
inputs = json.loads('''${JSON.stringify(inputs)}''')
context = json.loads('''${JSON.stringify({
  workflowId: context.workflowId,
  executionId: context.executionId,
  metadata: context.metadata
})}''')

${code}

# 执行入口函数并输出结果
if __name__ == "__main__":
    if '${entryFunction}' in dir():
        result = ${entryFunction}(inputs, context)
        print("__RESULT_START__")
        print(json.dumps(result))
        print("__RESULT_END__")
    else:
        print(f"Error: Function '${entryFunction}' not found", file=sys.stderr)
        sys.exit(1)
`;

    await fs.promises.writeFile(tempFile, wrappedCode, 'utf-8');

    try {
      const { stdout, stderr } = await execAsync(`python3 "${tempFile}"`, {
        timeout: (config.timeout || 30) * 1000
      });

      if (stderr) {
        console.warn('Python stderr:', stderr);
      }

      // 解析结果
      const resultMatch = stdout.match(/__RESULT_START__\n([\s\S]*)\n__RESULT_END__/);
      if (resultMatch) {
        return JSON.parse(resultMatch[1]);
      }

      throw new Error('Failed to parse Python execution result');
    } finally {
      // 清理临时文件
      try {
        await fs.promises.unlink(tempFile);
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 创建安全的 require 函数
   */
  private createSafeRequire(): NodeRequire {
    const allowedModules = [
      'fs', 'path', 'util', 'crypto', 'url', 'querystring',
      'stream', 'events', 'http', 'https', 'net', 'os'
    ];

    return ((id: string) => {
      if (allowedModules.includes(id)) {
        return require(id);
      }
      throw new Error(`Module '${id}' is not allowed in workflow code`);
    }) as NodeRequire;
  }

  validateConfig(node: Node): string[] {
    const errors: string[] = [];
    const config = node.data as unknown as CodeNodeConfig;

    if (!config) {
      errors.push('Code node requires configuration');
      return errors;
    }

    if (!config.language) {
      errors.push('Code language is required');
    }

    if (!['javascript', 'typescript', 'python'].includes(config.language)) {
      errors.push(`Unsupported language: ${config.language}`);
    }

    if (!config.code) {
      errors.push('Code content is required');
    }

    return errors;
  }
}
