/**
 * 存储层接口 - 工作流仓库
 * 定义工作流的持久化操作，与具体存储方式解耦
 */

import { Workflow, WorkflowSummary, CreateWorkflowDTO } from '../domain/Workflow';

export interface IWorkflowRepository {
    /**
     * 创建工作流
     */
    create(dto: CreateWorkflowDTO): Promise<Workflow>;
    
    /**
     * 根据ID获取工作流
     */
    findById(id: string): Promise<Workflow | null>;
    
    /**
     * 获取所有工作流摘要
     */
    findAll(): Promise<WorkflowSummary[]>;
    
    /**
     * 更新工作流
     */
    update(id: string, updates: Partial<Workflow>): Promise<Workflow>;
    
    /**
     * 删除工作流
     */
    delete(id: string): Promise<void>;
    
    /**
     * 检查工作流是否存在
     */
    exists(id: string): Promise<boolean>;
    
    /**
     * 添加节点
     */
    addNode(workflowId: string, node: import('../domain/Workflow').NodeConfig): Promise<import('../domain/Workflow').NodeConfig>;
    
    /**
     * 更新节点
     */
    updateNode(workflowId: string, nodeId: string, updates: Partial<import('../domain/Workflow').NodeConfig>): Promise<import('../domain/Workflow').NodeConfig>;
    
    /**
     * 删除节点
     */
    removeNode(workflowId: string, nodeId: string): Promise<void>;
    
    /**
     * 添加边
     */
    addEdge(workflowId: string, edge: import('../domain/Workflow').Edge): Promise<import('../domain/Workflow').Edge>;
    
    /**
     * 删除边
     */
    removeEdge(workflowId: string, edgeId: string): Promise<void>;
}
