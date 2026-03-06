import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
import { NodeExecutor } from './NodeExecutor';
export declare class WebhookNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private buildSlackPayload;
    private buildDingTalkPayload;
    private buildDiscordPayload;
    private buildPagerDutyPayload;
    validate(config: Record<string, any>): ValidationResult;
}
//# sourceMappingURL=WebhookNodeExecutor.d.ts.map