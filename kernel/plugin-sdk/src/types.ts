// PHASE 16 Plugin System —— 类型定义
// Safe Plugin: 受限运行时（vm 沙箱），适合文本转换/规则/布局算法/Style
// Privileged Plugin: 独立 Worker（stdio JSON Lines），适合 filesystem/browser/PowerPoint/GPU/FFmpeg

/** 插件类型 */
export type PluginType = 'safe' | 'privileged';

/** 权限清单（Permission Manifest，必须显式声明） */
export type Permission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'process'
  | 'browser'
  | 'powerpoint'
  | 'gpu'
  | 'media';

export const PERMISSIONS: readonly Permission[] = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'process',
  'browser',
  'powerpoint',
  'gpu',
  'media',
];

/** Safe 插件允许的权限（受限运行时不开网络/进程/浏览器/Office/GPU/媒体） */
export const SAFE_PERMISSIONS: readonly Permission[] = ['filesystem.read', 'filesystem.write'];

/** 插件清单（plugin.yaml） */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  type: PluginType;
  permissions: Permission[];
  /** 相对插件目录的入口文件（safe: .mjs 源码；privileged: 可执行入口） */
  entry: string;
  /** privileged 插件注册的 capability id（默认 manifest.name） */
  capability?: string;
  author?: string;
}

/** 校验结果 */
export interface ManifestResult {
  ok: boolean;
  manifest?: PluginManifest;
  errors: string[];
}

/** Safe 插件 run(input) 的输入/输出 */
export interface SafeRunResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

/** 受限文件系统 API（safe 插件可见） */
export interface RestrictedFs {
  readText(relPath: string): string;
  list(relPath?: string): string[];
  stat(relPath: string): { size: number; isFile: boolean; isDir: boolean };
  writeText?(relPath: string, data: string): void;
}

/** Privileged 插件运行时（独立 Worker） */
export interface PrivilegedRuntime {
  capabilityId: string;
  command: string[];
  cwd: string;
}

/** 与现有 worker-protocol 一致的消息形状 */
export interface WorkerJob {
  type: 'job_request';
  jobId: string;
  capabilityId: string;
  input: Record<string, unknown>;
}

export interface WorkerResponse {
  type: 'job_response';
  jobId: string;
  ok: boolean;
  output?: Record<string, unknown>;
  errorType?: string | null;
  errorMessage?: string | null;
}
