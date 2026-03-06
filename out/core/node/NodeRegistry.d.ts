import { NodeConfig, NodeTypeDefinition, Position, Port } from '../../shared/types';
export declare class NodeRegistry {
    private nodeTypes;
    constructor();
    private registerDefaultNodes;
    register(definition: NodeTypeDefinition): void;
    unregister(type: string): void;
    getDefinition(type: string): NodeTypeDefinition | undefined;
    getAllDefinitions(): NodeTypeDefinition[];
    getDefinitionsByCategory(category: string): NodeTypeDefinition[];
    getCategories(): string[];
    createNode(type: string, position: Position): NodeConfig;
    getSwitchOutputs(conditions: Array<{
        name: string;
        target: string;
    }>): Port[];
    getParallelOutputs(branches: Array<{
        name: string;
        id: string;
    }>): Port[];
    getMergeInputs(branchCount: number): Port[];
}
//# sourceMappingURL=NodeRegistry.d.ts.map