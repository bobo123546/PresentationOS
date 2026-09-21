// Capability Graph（总方案 PHASE 3）：依赖 / fallback / 版本兼容 / 输入输出兼容

export interface CapabilityNode {
  id: string;
  version: string;
  dependsOn: string[];
  fallbacks: string[];
  runtime: string;
  permissions: string[];
  providers: Array<{ providerId: string; version: string }>;
}

export class CapabilityGraph {
  private readonly nodes = new Map<string, CapabilityNode>();

  add(node: CapabilityNode): void {
    this.nodes.set(node.id, node);
  }

  get(id: string): CapabilityNode | undefined {
    return this.nodes.get(id);
  }

  /** 拓扑排序；有环返回 null */
  topoSort(): string[] | null {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const order: string[] = [];
    const visit = (id: string): boolean => {
      if (stack.has(id)) return false; // cycle
      if (visited.has(id)) return true;
      stack.add(id);
      const node = this.nodes.get(id);
      if (node) {
        for (const dep of node.dependsOn) {
          if (!this.nodes.has(dep)) continue; // 未知依赖不阻塞
          if (!visit(dep)) return false;
        }
      }
      stack.delete(id);
      visited.add(id);
      order.push(id);
      return true;
    };
    for (const id of this.nodes.keys()) {
      if (!visit(id)) return null;
    }
    return order;
  }

  /** 解析执行链：capability + 其依赖（拓扑序） */
  resolveChain(capabilityId: string): string[] | null {
    if (!this.nodes.has(capabilityId)) return null;
    const order = this.topoSort();
    if (!order) return null;
    const idx = order.indexOf(capabilityId);
    if (idx < 0) return null;
    return order.slice(0, idx + 1);
  }
}
