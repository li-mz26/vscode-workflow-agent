/**
 * 依赖注入容器
 * 管理所有服务的生命周期和依赖关系
 */

import { EventBus } from '../service/EventBus';
import { MemoryWorkflowRepository } from '../repository/MemoryWorkflowRepository';
import { WorkflowService, IWorkflowService } from '../service/WorkflowService';
import { ExecutionService, IExecutionService } from '../service/ExecutionService';
import { ExecutorFactory } from '../executor/ExecutorFactory';
import { MCPServerAdapter } from '../adapter/mcp/MCPServerAdapter';

export class DIContainer {
    private static instance: DIContainer;
    private services: Map<string, any> = new Map();
    
    private constructor() {}
    
    static getInstance(): DIContainer {
        if (!DIContainer.instance) {
            DIContainer.instance = new DIContainer();
        }
        return DIContainer.instance;
    }
    
    /**
     * 初始化所有服务
     */
    initialize(): void {
        // 基础设施层
        const eventBus = new EventBus();
        this.register('eventBus', eventBus);
        
        // 存储层
        const repository = new MemoryWorkflowRepository();
        this.register('workflowRepository', repository);
        
        // 服务层
        const workflowService = new WorkflowService(repository, eventBus);
        this.register('workflowService', workflowService);
        
        // 执行器工厂
        const executorFactory = new ExecutorFactory();
        this.register('executorFactory', executorFactory);
        
        // 执行服务
        const executionService = new ExecutionService(executorFactory, eventBus);
        this.register('executionService', executionService);
        
        // MCP 适配器
        const mcpServer = new MCPServerAdapter(workflowService, executionService);
        this.register('mcpServer', mcpServer);
    }
    
    /**
     * 注册服务
     */
    register<T>(key: string, instance: T): void {
        this.services.set(key, instance);
    }
    
    /**
     * 获取服务
     */
    resolve<T>(key: string): T {
        const service = this.services.get(key);
        if (!service) {
            throw new Error(`Service not found: ${key}`);
        }
        return service;
    }
    
    /**
     * 快捷访问方法
     */
    getEventBus(): EventBus {
        return this.resolve('eventBus');
    }
    
    getWorkflowService(): IWorkflowService {
        return this.resolve('workflowService');
    }
    
    getExecutionService(): IExecutionService {
        return this.resolve('executionService');
    }
    
    getMCPServer(): MCPServerAdapter {
        return this.resolve('mcpServer');
    }
}

// 导出单例
export const container = DIContainer.getInstance();
