// ============================================
// Repository 层 - 工作流存储接口
// ============================================

import { Workflow, WorkflowSummary, CreateWorkflowDTO } from '../domain';

export interface IWorkflowRepository {
    /**
     * 创建新工作流
     */
    create(dto: CreateWorkflowDTO): Promise<Workflow>;

    /**
     * 根据 ID 获取工作流
     */
    getById(id: string): Promise<Workflow | null>;

    /**
     * 更新工作流
     */
    update(id: string, updates: Partial<Workflow>): Promise<Workflow>;

    /**
     * 删除工作流
     */
    delete(id: string): Promise<void>;

    /**
     * 列出所有工作流
     */
    list(): Promise<WorkflowSummary[]>;

    /**
     * 从文件加载工作流
     */
    loadFromFile(filePath: string): Promise<Workflow>;

    /**
     * 保存工作流到文件
     */
    saveToFile(workflow: Workflow, filePath?: string): Promise<void>;

    /**
     * 根据文件路径查找工作流 ID
     */
    findIdByFilePath(filePath: string): string | null;

    /**
     * 检查工作流是否存在
     */
    exists(id: string): boolean;

    /**
     * 监听工作流变更
     */
    onChanged(callback: (event: { type: 'created' | 'updated' | 'deleted'; workflowId: string; workflow?: Workflow }) => void): void;

    /**
     * 移除变更监听器
     */
    offChanged(callback: (event: { type: 'created' | 'updated' | 'deleted'; workflowId: string; workflow?: Workflow }) => void): void;
}
