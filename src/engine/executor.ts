/**
 * 工作流执行引擎
 */

import { 
  Workflow, 
  WorkflowNode, 
  WorkflowEdge,
  NodeConfig,
  NodeType,
  ExecutionContext,
  NodeExecutionResult,
  WorkflowExecutionResult,
  WorkflowExecutionStatus,
  NodeExecutionStatus
} from './types';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/** 节点执行器接口 */
export interface NodeExecutor<TConfig extends NodeConfig = NodeConfig> {
  type: NodeType;
  execute(config: TConfig, input: any, context: ExecutionContext): Promise<any>;
}

/** 执行引擎配置 */
export interface EngineConfig {
  maxConcurrency?: number;
  timeout?: number;
  nodeExecutors?: Map<NodeType, NodeExecutor>;
}

/** 执行事件 */
export type ExecutionEvent = 
  | { type: 'workflow:start'; workflowId: string; executionId: string }
  | { type: 'workflow:end'; result: WorkflowExecutionResult }
  | { type: 'node:start'; nodeId: string; input: any }
  | { type: 'node:end'; result: NodeExecutionResult }
  | { type: 'node:error'; nodeId: string; error: string };

export type ExecutionEventHandler = (event: ExecutionEvent) => void;

export class WorkflowEngine {
  private config: Required<EngineConfig>;
  private nodeExecutors: Map<NodeType, NodeExecutor>;
  private eventHandlers: ExecutionEventHandler[] = [];

  constructor(config: EngineConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 10,
      timeout: config.timeout ?? 300000, // 5 minutes default
      nodeExecutors: config.nodeExecutors ?? new Map()
    };
    this.nodeExecutors = this.config.nodeExecutors;
    this.registerBuiltinExecutors();
  }

  /**
   * 注册内置执行器
   */
  private registerBuiltinExecutors(): void {
    // Start 节点
    this.nodeExecutors.set('start', {
      type: 'start',
      execute: async (config: any, input: any) => {
        return { triggered: true, triggerType: config.triggerType, ...input };
      }
    });

    // End 节点
    this.nodeExecutors.set('end', {
      type: 'end',
      execute: async (config: any, input: any) => {
        return input;
      }
    });

    // Code 节点
    this.nodeExecutors.set('code', {
      type: 'code',
      execute: async (config: any, input: any, context: ExecutionContext) => {
        const { language, code, timeout = 30000 } = config;
        
        if (language === 'python') {
          return await executePython(code, input, timeout);
        } else if (language === 'javascript' || language === 'typescript') {
          return await executeJavaScript(code, input, timeout);
        }
        
        throw new Error(`Unsupported language: ${language}`);
      }
    });

    // LLM 节点
    this.nodeExecutors.set('llm', {
      type: 'llm',
      execute: async (config: any, input: any) => {
        const { model, systemPrompt, userPrompt, temperature = 0.7 } = config;
        
        // 实际实现需要调用 LLM API
        // 这里是占位实现
        return {
          response: 'LLM response placeholder',
          model: model.model,
          provider: model.provider,
          usage: { promptTokens: 0, completionTokens: 0 }
        };
      }
    });

    // Switch 节点
    this.nodeExecutors.set('switch', {
      type: 'switch',
      execute: async (config: any, input: any) => {
        const { branches, defaultBranch, evaluationMode = 'first-match' } = config;
        
        // 评估条件
        for (const branch of branches) {
          try {
            // 简单表达式评估 (实际需要更安全的实现)
            const result = evaluateCondition(branch.condition, input);
            if (result) {
              return { branch: branch.id, matched: true, input };
            }
          } catch (err) {
            console.error(`Branch condition error: ${branch.condition}`, err);
          }
        }
        
        return { branch: defaultBranch, matched: false, input };
      }
    });

    // Parallel 节点
    this.nodeExecutors.set('parallel', {
      type: 'parallel',
      execute: async (config: any, input: any) => {
        // Parallel 节点本身只是标记，实际并行在引擎层面处理
        return { parallel: true, branches: config.branches, input };
      }
    });
  }

  /**
   * 注册自定义节点执行器
   */
  registerExecutor(executor: NodeExecutor): void {
    this.nodeExecutors.set(executor.type, executor);
  }

  /**
   * 添加事件处理器
   */
  on(handler: ExecutionEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * 移除事件处理器
   */
  off(handler: ExecutionEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index >= 0) this.eventHandlers.splice(index, 1);
  }

  /**
   * 触发事件
   */
  private emit(event: ExecutionEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  /**
   * 执行工作流
   */
  async execute(
    workflow: Workflow, 
    nodeConfigs: Map<string, NodeConfig>,
    initialInput: any = {}
  ): Promise<WorkflowExecutionResult> {
    const executionId = generateExecutionId();
    const context: ExecutionContext = {
      workflowId: workflow.id,
      executionId,
      variables: { ...initialInput },
      nodeResults: new Map(),
      startTime: Date.now(),
      status: 'running'
    };

    this.emit({ type: 'workflow:start', workflowId: workflow.id, executionId });

    try {
      // 拓扑排序
      const sortedNodes = this.topologicalSort(workflow);

      // 执行节点
      for (const node of sortedNodes) {
        const result = await this.executeNode(node, nodeConfigs, context);
        context.nodeResults.set(node.id, result);

        if (result.status === 'failed') {
          context.status = 'failed';
          break;
        }
      }

      context.status = context.status === 'running' ? 'success' : context.status;
    } catch (err) {
      context.status = 'failed';
      this.emit({ type: 'workflow:end', result: this.createResult(context, String(err)) });
      return this.createResult(context, String(err));
    }

    const result = this.createResult(context);
    this.emit({ type: 'workflow:end', result });
    return result;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: WorkflowNode,
    nodeConfigs: Map<string, NodeConfig>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const result: NodeExecutionResult = {
      nodeId: node.id,
      status: 'running',
      startTime
    };

    this.emit({ type: 'node:start', nodeId: node.id, input: node.data });

    try {
      const executor = this.nodeExecutors.get(node.type);
      if (!executor) {
        throw new Error(`No executor for node type: ${node.type}`);
      }

      // 获取配置
      const config = nodeConfigs.get(node.id) || (node.data as NodeConfig) || {};

      // 收集输入（从上游节点）
      const input = this.collectInput(node, context);

      // 执行
      const output = await executor.execute(config as NodeConfig, input, context);

      result.status = 'success';
      result.output = output;
      result.input = input;
    } catch (err) {
      result.status = 'failed';
      result.error = String(err);
      this.emit({ type: 'node:error', nodeId: node.id, error: String(err) });
    }

    result.endTime = Date.now();
    result.duration = result.endTime - startTime;

    this.emit({ type: 'node:end', result });
    return result;
  }

  /**
   * 收集节点输入
   */
  private collectInput(node: WorkflowNode, context: ExecutionContext): any {
    // 从上下文中收集上游节点的输出
    // 简化实现：合并所有上游输出
    return { ...context.variables };
  }

  /**
   * 拓扑排序
   */
  private topologicalSort(workflow: Workflow): WorkflowNode[] {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const inDegree = new Map(workflow.nodes.map(n => [n.id, 0]));
    const adjacency = new Map<string, string[]>();

    // 初始化
    for (const node of workflow.nodes) {
      adjacency.set(node.id, []);
    }

    // 构建图
    for (const edge of workflow.edges || []) {
      adjacency.get(edge.source.nodeId)?.push(edge.target.nodeId);
      inDegree.set(edge.target.nodeId, (inDegree.get(edge.target.nodeId) || 0) + 1);
    }

    // Kahn 算法
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId);
    }

    const sorted: WorkflowNode[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeMap.get(nodeId)!);

      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  /**
   * 创建执行结果
   */
  private createResult(context: ExecutionContext, error?: string): WorkflowExecutionResult {
    return {
      workflowId: context.workflowId,
      executionId: context.executionId,
      status: error ? 'failed' : context.status,
      startTime: context.startTime,
      endTime: Date.now(),
      duration: Date.now() - context.startTime,
      nodeResults: Array.from(context.nodeResults.values()),
      error
    };
  }
}

/**
 * 生成执行 ID
 */
function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 简单条件评估
 */
function evaluateCondition(condition: string, data: any): boolean {
  // 简化实现：实际应该使用安全的表达式引擎
  try {
    // 替换 data.xxx 为实际值
    const expr = condition.replace(/data\.(\w+)/g, (_, key) => {
      const value = data[key];
      return typeof value === 'string' ? `"${value}"` : String(value);
    });
    return eval(expr);
  } catch {
    return false;
  }
}

/**
 * 执行 Python 代码
 */
async function executePython(code: string, input: any, timeout: number): Promise<any> {
  // 创建临时目录
  const tmpDir = path.join(os.tmpdir(), `workflow_exec_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  
  // 包装代码，注入 input 并捕获输出
  const wrappedCode = `
import json
import sys

# 输入数据
_input = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

# 用户代码
${code}

# 执行 main 函数并输出结果
if 'main' in dir():
    try:
        _result = main(_input)
        print("__RESULT_START__")
        print(json.dumps(_result, ensure_ascii=False, default=str))
        print("__RESULT_END__")
    except Exception as e:
        print("__ERROR_START__")
        print(json.dumps({"error": str(e)}))
        print("__ERROR_END__")
`;

  const scriptPath = path.join(tmpDir, 'script.py');
  await fs.promises.writeFile(scriptPath, wrappedCode, 'utf-8');

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [scriptPath, JSON.stringify(input)], {
      cwd: tmpDir,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 超时处理
    const timeoutId = setTimeout(() => {
      pythonProcess.kill();
      cleanup(tmpDir);
      reject(new Error(`Execution timeout after ${timeout}ms`));
    }, timeout);

    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      cleanup(tmpDir);

      if (code !== 0) {
        reject(new Error(`Python execution failed (exit code ${code}): ${stderr}`));
        return;
      }

      // 解析输出
      try {
        const resultMatch = stdout.match(/__RESULT_START__\s*([\s\S]*?)\s*__RESULT_END__/);
        const errorMatch = stdout.match(/__ERROR_START__\s*([\s\S]*?)\s*__ERROR_END__/);

        if (errorMatch) {
          const errorData = JSON.parse(errorMatch[1]);
          reject(new Error(errorData.error || 'Unknown error in Python code'));
          return;
        }

        if (resultMatch) {
          const result = JSON.parse(resultMatch[1]);
          resolve(result);
          return;
        }

        // 如果没有找到标记，返回原始输出
        resolve({ output: stdout.trim() });
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${err}\nOutput: ${stdout}`));
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      cleanup(tmpDir);
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

/**
 * 执行 JavaScript 代码
 */
async function executeJavaScript(code: string, input: any, timeout: number): Promise<any> {
  // 创建临时目录
  const tmpDir = path.join(os.tmpdir(), `workflow_exec_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  // 包装代码
  const wrappedCode = `
const input = ${JSON.stringify(input)};

${code}

// 执行并输出结果
(async () => {
  try {
    let result;
    if (typeof main === 'function') {
      result = await main(input);
    } else if (typeof module !== 'undefined' && module.exports) {
      result = await module.exports(input);
    } else {
      result = { output: 'No main function found' };
    }
    console.log('__RESULT_START__');
    console.log(JSON.stringify(result));
    console.log('__RESULT_END__');
  } catch (e) {
    console.log('__ERROR_START__');
    console.log(JSON.stringify({ error: e.message }));
    console.log('__ERROR_END__');
  }
})();
`;

  const scriptPath = path.join(tmpDir, 'script.js');
  await fs.promises.writeFile(scriptPath, wrappedCode, 'utf-8');

  return new Promise((resolve, reject) => {
    const nodeProcess = spawn('node', [scriptPath], {
      cwd: tmpDir
    });

    let stdout = '';
    let stderr = '';

    nodeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    nodeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      nodeProcess.kill();
      cleanup(tmpDir);
      reject(new Error(`Execution timeout after ${timeout}ms`));
    }, timeout);

    nodeProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      cleanup(tmpDir);

      if (code !== 0) {
        reject(new Error(`JavaScript execution failed (exit code ${code}): ${stderr}`));
        return;
      }

      try {
        const resultMatch = stdout.match(/__RESULT_START__\s*([\s\S]*?)\s*__RESULT_END__/);
        const errorMatch = stdout.match(/__ERROR_START__\s*([\s\S]*?)\s*__ERROR_END__/);

        if (errorMatch) {
          const errorData = JSON.parse(errorMatch[1]);
          reject(new Error(errorData.error || 'Unknown error in JavaScript code'));
          return;
        }

        if (resultMatch) {
          const result = JSON.parse(resultMatch[1]);
          resolve(result);
          return;
        }

        resolve({ output: stdout.trim() });
      } catch (err) {
        reject(new Error(`Failed to parse JavaScript output: ${err}\nOutput: ${stdout}`));
      }
    });

    nodeProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      cleanup(tmpDir);
      reject(new Error(`Failed to start Node process: ${err.message}`));
    });
  });
}

/**
 * 清理临时目录
 */
async function cleanup(tmpDir: string): Promise<void> {
  try {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

export default WorkflowEngine;