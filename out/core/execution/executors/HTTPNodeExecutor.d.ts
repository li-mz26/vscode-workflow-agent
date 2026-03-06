import { NodeConfig, ExecutionContext, NodeExecutionResult, ValidationResult } from '../../shared/types';
import { NodeExecutor } from './NodeExecutor';
export declare class HTTPNodeExecutor extends NodeExecutor {
    type: string;
    execute(node: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult>;
    private makeRequest;
    private renderTemplate;
    private sleep;
    validate(config: Record<string, any>): ValidationResult;
}
//# sourceMappingURL=HTTPNodeExecutor.d.ts.map