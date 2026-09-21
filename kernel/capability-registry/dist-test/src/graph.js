// Capability Graph（总方案 PHASE 3）：依赖 / fallback / 版本兼容 / 输入输出兼容
export class CapabilityGraph {
    nodes = new Map();
    add(node) {
        this.nodes.set(node.id, node);
    }
    get(id) {
        return this.nodes.get(id);
    }
    /** 拓扑排序；有环返回 null */
    topoSort() {
        const visited = new Set();
        const stack = new Set();
        const order = [];
        const visit = (id) => {
            if (stack.has(id))
                return false; // cycle
            if (visited.has(id))
                return true;
            stack.add(id);
            const node = this.nodes.get(id);
            if (node) {
                for (const dep of node.dependsOn) {
                    if (!this.nodes.has(dep))
                        continue; // 未知依赖不阻塞
                    if (!visit(dep))
                        return false;
                }
            }
            stack.delete(id);
            visited.add(id);
            order.push(id);
            return true;
        };
        for (const id of this.nodes.keys()) {
            if (!visit(id))
                return null;
        }
        return order;
    }
    /** 解析执行链：capability + 其依赖（拓扑序） */
    resolveChain(capabilityId) {
        if (!this.nodes.has(capabilityId))
            return null;
        const order = this.topoSort();
        if (!order)
            return null;
        const idx = order.indexOf(capabilityId);
        if (idx < 0)
            return null;
        return order.slice(0, idx + 1);
    }
}
