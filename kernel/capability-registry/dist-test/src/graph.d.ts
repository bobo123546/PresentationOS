export interface CapabilityNode {
    id: string;
    version: string;
    dependsOn: string[];
    fallbacks: string[];
    runtime: string;
    permissions: string[];
    providers: Array<{
        providerId: string;
        version: string;
    }>;
}
export declare class CapabilityGraph {
    private readonly nodes;
    add(node: CapabilityNode): void;
    get(id: string): CapabilityNode | undefined;
    /** 拓扑排序；有环返回 null */
    topoSort(): string[] | null;
    /** 解析执行链：capability + 其依赖（拓扑序） */
    resolveChain(capabilityId: string): string[] | null;
}
