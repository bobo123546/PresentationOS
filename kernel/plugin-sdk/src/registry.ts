// Plugin Registry —— 插件注册/加载/执行入口
import { loadManifest } from './manifest.js';
import { runSafePlugin } from './safe-runtime.js';
import { startPrivileged, runtimeFromManifest, type PrivilegedHandle } from './privileged.js';
import type { PluginManifest, SafeRunResult, WorkerJob, WorkerResponse } from './types.js';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  rootDir: string;
  type: 'safe' | 'privileged';
  capabilityId?: string;
}

export class PluginRegistry {
  private safe = new Map<string, RegisteredPlugin>();
  private privileged = new Map<string, { registered: RegisteredPlugin; handle: PrivilegedHandle }>();

  /** 注册插件目录：读取 plugin.yaml -> 校验 -> 加载 */
  register(pluginDir: string): { ok: boolean; error?: string } {
    const res = loadManifest(pluginDir);
    if (!res.ok || !res.manifest) {
      return { ok: false, error: res.errors.join('; ') };
    }
    const manifest = res.manifest;
    if (this.safe.has(manifest.name) || this.privileged.has(manifest.name)) {
      return { ok: false, error: `插件已存在: ${manifest.name}` };
    }
    const capabilityId = manifest.capability ?? manifest.name;
    if (manifest.type === 'safe') {
      this.safe.set(manifest.name, { manifest, rootDir: pluginDir, type: 'safe' });
      return { ok: true };
    }
    // privileged：拉起独立 Worker（懒启动改为立即启动以便注册能力）
    const runtime = runtimeFromManifest(pluginDir, manifest.entry, capabilityId);
    const handle = startPrivileged(runtime, pluginDir);
    this.privileged.set(manifest.name, {
      registered: { manifest, rootDir: pluginDir, type: 'privileged', capabilityId },
      handle,
    });
    return { ok: true };
  }

  list(): RegisteredPlugin[] {
    return [
      ...[...this.safe.values()],
      ...[...this.privileged.values()].map((p) => p.registered),
    ];
  }

  has(name: string): boolean {
    return this.safe.has(name) || this.privileged.has(name);
  }

  /** 执行 safe 插件 */
  async runSafe(name: string, input: unknown): Promise<SafeRunResult> {
    const p = this.safe.get(name);
    if (!p) return { ok: false, error: `safe 插件不存在: ${name}`, durationMs: 0 };
    return runSafePlugin({ manifest: p.manifest, rootDir: p.rootDir }, input);
  }

  /** 向 privileged 插件发送 job（worker-protocol 协议） */
  async callPrivileged(name: string, job: Omit<WorkerJob, 'type' | 'capabilityId'>): Promise<WorkerResponse> {
    const p = this.privileged.get(name);
    if (!p) return { type: 'job_response', jobId: job.jobId, ok: false, errorMessage: `privileged 插件不存在: ${name}` };
    return p.handle.send({ type: 'job_request', capabilityId: p.registered.capabilityId!, ...job });
  }

  /** 全部停止（释放 privileged 进程） */
  async shutdown(): Promise<void> {
    for (const p of this.privileged.values()) {
      await p.handle.stop().catch(() => {});
    }
    this.privileged.clear();
  }
}
