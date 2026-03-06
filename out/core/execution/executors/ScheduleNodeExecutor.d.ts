import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
import { NodeExecutor } from './NodeExecutor';
export declare class ScheduleNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private isValidCron;
    private getNextRunTime;
    validate(config: Record<string, any>): ValidationResult;
}
//# sourceMappingURL=ScheduleNodeExecutor.d.ts.map