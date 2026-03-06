// ============================================
// Executor 层 - 抽象基类
// ============================================

import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../domain';
import { INodeExecutor } from './INodeExecutor';

export abstract class NodeExecutorBase implements INodeExecutor {
    abstract readonly type: string;

    abstract execute(
        node: NodeConfig,
        context: ExecutionContext
    ): Promise<NodeExecutionResult>;

    abstract validate(config: Record<string, any>): ValidationResult;

    protected resolveInputs(node: NodeConfig, context: ExecutionContext): Record<string, any> {
        return context.inputs;
    }

    protected renderTemplate(template: string, context: ExecutionContext): string {
        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
            const parts = path.split('.');
            let value: any = context.inputs;
            
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined) break;
            }
            
            if (value === undefined) {
                value = context.variables.get(path);
            }
            
            return value !== undefined ? String(value) : match;
        });
    }

    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
