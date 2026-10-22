// Trusted plugin runtime with a restricted convenience API.
// node:vm is not an OS security boundary for hostile plugin code.
import { readFileSync, readdirSync, statSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, sep, relative, win32, posix } from 'node:path';
import vm from 'node:vm';
import type { PluginManifest, RestrictedFs, SafeRunResult } from './types.js';

export interface SafeRuntimeOptions {
  manifest: PluginManifest;
  rootDir: string; // 插件目录（文件系统访问根）
  log?: (msg: string) => void;
}

function pathInside(rootDir: string, rel: string): string {
    if (typeof rel !== 'string' || rel.length === 0) throw new Error('路径必须是非空字符串');
    if (win32.isAbsolute(rel) || posix.isAbsolute(rel) || /[:\x00]/.test(rel)) throw new Error('路径逃逸被拒绝');
    const full = resolve(rootDir, rel);
    if (full !== rootDir && !full.startsWith(rootDir + sep)) {
      throw new Error(`路径逃逸被拒绝: ${rel}`);
    }
    let cursor = rootDir;
    for (const part of relative(rootDir, full).split(sep).filter(Boolean)) {
      cursor = resolve(cursor, part);
      try { if (lstatSync(cursor).isSymbolicLink()) throw new Error('符号链接路径逃逸被拒绝'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return full;
}

function restrictedFs(rootDir: string, writable: boolean): RestrictedFs {
  const guard = (rel: string) => pathInside(rootDir, rel);
  const fsApi: RestrictedFs = {
    readText(rel) {
      return readFileSync(guard(rel), 'utf8');
    },
    list(rel = '.') {
      return readdirSync(guard(rel));
    },
    stat(rel) {
      const s = statSync(guard(rel));
      return { size: s.size, isFile: s.isFile(), isDir: s.isDirectory() };
    },
  };
  if (writable) {
    fsApi.writeText = (rel, data) => {
      const path = guard(rel);
      try { if (statSync(path).nlink > 1) throw new Error('写入硬链接被拒绝'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      writeFileSync(path, data, 'utf8');
    };
  }
  return fsApi;
}

/** 执行 safe 插件：entry 源码中必须定义 async run(input)，在受限沙箱中调用 */
export async function runSafePlugin(opts: SafeRuntimeOptions, input: unknown): Promise<SafeRunResult> {
  const start = Date.now();
  const { manifest } = opts;
  try {
    const rootDir = realpathSync(resolve(opts.rootDir));
    const code = readFileSync(pathInside(rootDir, manifest.entry), 'utf8');
    const perms = new Set(manifest.permissions);

    const sandbox: Record<string, unknown> = {
      console: {
        log: (m: string) => opts.log?.(m),
      },
    };
    if (perms.has('filesystem.read')) {
      sandbox.fs = restrictedFs(rootDir, false);
    }
    if (perms.has('filesystem.write')) {
      sandbox.fs = restrictedFs(rootDir, true);
    }
    // network/process/browser/powerpoint/gpu/media 在 safe 中一律不可用（校验层已拒绝）

    const ctx = vm.createContext(sandbox, { name: `safe-plugin:${manifest.name}`, codeGeneration: { strings: false, wasm: false } });
    // export 语句只能在 ESM 顶层；vm 脚本模式不支持 export。
    // 约定：safe 插件源码必须直接定义顶层 async function run(input)（无需 export）。
    // 把源码与调用拼接为顶层脚本执行（run 为 async，返回 promise）
    const wrapped = `${code}\nrun(${JSON.stringify(input ?? null)});`;
    const result = await vm.runInContext(wrapped, ctx, { timeout: 5000 });
    return { ok: true, output: result, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: (e as Error).message, durationMs: Date.now() - start };
  }
}
