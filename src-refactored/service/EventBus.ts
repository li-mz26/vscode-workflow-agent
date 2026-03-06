/**
 * 事件总线 - 用于模块间解耦通信
 */

type EventHandler = (payload: any) => void;

export class EventBus {
    private handlers: Map<string, EventHandler[]> = new Map();
    
    /**
     * 订阅事件
     */
    on(event: string, handler: EventHandler): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event)!.push(handler);
        
        // 返回取消订阅函数
        return () => this.off(event, handler);
    }
    
    /**
     * 取消订阅
     */
    off(event: string, handler: EventHandler): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * 触发事件
     */
    emit(event: string, payload?: any): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * 只监听一次
     */
    once(event: string, handler: EventHandler): void {
        const onceHandler = (payload: any) => {
            this.off(event, onceHandler);
            handler(payload);
        };
        this.on(event, onceHandler);
    }
}

// 全局事件类型定义
export const WorkflowEvents = {
    CREATED: 'workflow:created',
    UPDATED: 'workflow:updated',
    DELETED: 'workflow:deleted',
    NODE_ADDED: 'workflow:node:added',
    NODE_REMOVED: 'workflow:node:removed',
    EDGE_ADDED: 'workflow:edge:added',
    EDGE_REMOVED: 'workflow:edge:removed',
    EXECUTION_STARTED: 'execution:started',
    EXECUTION_COMPLETED: 'execution:completed',
    EXECUTION_FAILED: 'execution:failed'
} as const;
