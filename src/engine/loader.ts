/**
 * 工作流加载器 - 从文件系统加载工作流
 */

import * as fs from 'fs';
import * as path from 'path';
import { Workflow, WorkflowNode, NodeConfig } from './types';

export interface WorkflowLoadResult {
  success: boolean;
  workflow?: Workflow;
  nodeConfigs?: Map<string, NodeConfig>;
  error?: string;
}

export interface WorkflowSaveResult {
  success: boolean;
  error?: string;
}

export class WorkflowLoader {
  /**
   * 从目录加载工作流
   */
  static async loadFromDirectory(dirPath: string): Promise<WorkflowLoadResult> {
    try {
      // 查找工作流定义文件
      const workflowFile = this.findWorkflowFile(dirPath);
      if (!workflowFile) {
        return { success: false, error: '未找到工作流定义文件 (*.workflow.json)' };
      }

      // 读取工作流定义
      const workflowContent = await fs.promises.readFile(workflowFile, 'utf-8');
      const workflow: Workflow = JSON.parse(workflowContent);

      // 验证工作流结构
      const validation = this.validateWorkflow(workflow);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 加载节点配置
      const nodeConfigs = new Map<string, NodeConfig>();
      const nodesDir = path.join(dirPath, 'nodes');

      if (fs.existsSync(nodesDir)) {
        for (const node of workflow.nodes) {
          if (node.configRef) {
            const configPath = path.join(dirPath, node.configRef);
            if (fs.existsSync(configPath)) {
              const configContent = await fs.promises.readFile(configPath, 'utf-8');
              
              // 根据文件扩展名解析
              const ext = path.extname(configPath);
              let config: NodeConfig;
              
              if (ext === '.json') {
                config = JSON.parse(configContent);
              } else if (ext === '.py' || ext === '.js' || ext === '.ts') {
                // 代码文件直接作为配置
                config = {
                  language: ext === '.py' ? 'python' : ext === '.ts' ? 'typescript' : 'javascript',
                  code: configContent
                } as any;
              } else {
                continue;
              }
              
              nodeConfigs.set(node.id, config);
            }
          }
        }
      }

      return { success: true, workflow, nodeConfigs };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * 保存工作流到目录
   */
  static async saveToDirectory(dirPath: string, workflow: Workflow, nodeConfigs: Map<string, NodeConfig>): Promise<WorkflowSaveResult> {
    try {
      // 确保目录存在
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }

      // 创建 nodes 目录
      const nodesDir = path.join(dirPath, 'nodes');
      if (!fs.existsSync(nodesDir)) {
        await fs.promises.mkdir(nodesDir, { recursive: true });
      }

      // 保存工作流定义文件
      const workflowFile = path.join(dirPath, `${workflow.name}.workflow.json`);
      
      // 更新节点的 configRef
      const updatedNodes = workflow.nodes.map(node => {
        if (nodeConfigs.has(node.id)) {
          const config = nodeConfigs.get(node.id)!;
          const configRef = this.getConfigFileName(node, config);
          return { ...node, configRef: `nodes/${configRef}` };
        }
        return node;
      });

      const workflowToSave: Workflow = {
        ...workflow,
        nodes: updatedNodes,
        metadata: {
          ...workflow.metadata,
          updatedAt: new Date().toISOString()
        }
      };

      await fs.promises.writeFile(workflowFile, JSON.stringify(workflowToSave, null, 2), 'utf-8');

      // 保存节点配置文件
      for (const [nodeId, config] of nodeConfigs) {
        const node = workflow.nodes.find(n => n.id === nodeId);
        if (node) {
          const configFileName = this.getConfigFileName(node, config);
          const configPath = path.join(nodesDir, configFileName);
          
          // 代码类型直接保存代码
          if ('code' in config && 'language' in config) {
            await fs.promises.writeFile(configPath, config.code, 'utf-8');
          } else {
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
          }
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * 查找工作流定义文件
   */
  private static findWorkflowFile(dirPath: string): string | null {
    const files = fs.readdirSync(dirPath);
    const workflowFile = files.find(f => f.endsWith('.workflow.json'));
    return workflowFile ? path.join(dirPath, workflowFile) : null;
  }

  /**
   * 验证工作流结构
   */
  private static validateWorkflow(workflow: Workflow): { valid: boolean; error?: string } {
    // 检查必需字段
    if (!workflow.id || !workflow.name || !workflow.version) {
      return { valid: false, error: '工作流缺少必需字段: id, name, version' };
    }

    // 检查节点
    if (!workflow.nodes || workflow.nodes.length === 0) {
      return { valid: false, error: '工作流必须包含至少一个节点' };
    }

    // 检查节点 ID 唯一性
    const nodeIds = new Set<string>();
    for (const node of workflow.nodes) {
      if (nodeIds.has(node.id)) {
        return { valid: false, error: `重复的节点 ID: ${node.id}` };
      }
      nodeIds.add(node.id);
    }

    // 检查边的引用
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.source.nodeId)) {
        return { valid: false, error: `边引用了不存在的源节点: ${edge.source.nodeId}` };
      }
      if (!nodeIds.has(edge.target.nodeId)) {
        return { valid: false, error: `边引用了不存在的目标节点: ${edge.target.nodeId}` };
      }
    }

    // 检查 DAG（无环）
    if (!this.isDAG(workflow)) {
      return { valid: false, error: '工作流必须是有向无环图 (DAG)' };
    }

    return { valid: true };
  }

  /**
   * 检查是否为 DAG
   */
  private static isDAG(workflow: Workflow): boolean {
    const adjacency = new Map<string, string[]>();
    
    // 构建邻接表
    for (const node of workflow.nodes) {
      adjacency.set(node.id, []);
    }
    
    for (const edge of workflow.edges || []) {
      adjacency.get(edge.source.nodeId)?.push(edge.target.nodeId);
    }

    // DFS 检测环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) return false;
      }
    }

    return true;
  }

  /**
   * 获取配置文件名
   */
  private static getConfigFileName(node: WorkflowNode, config: NodeConfig): string {
    if ('code' in config && 'language' in config) {
      const ext = config.language === 'python' ? 'py' : 
                  config.language === 'typescript' ? 'ts' : 'js';
      return `${node.id}_${node.type}.${ext}`;
    }
    return `${node.id}_${node.type}.json`;
  }
}

export default WorkflowLoader;