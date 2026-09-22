// Safe Plugin Runtime —— node:vm 受限沙箱 + 权限门
// 只注入 manifest 声明的权限内 API；路径逃逸被拒绝；未声明权限不可用
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import vm from 'node:vm';
function restrictedFs(rootDir, writable) {
    const guard = (rel) => {
        if (typeof rel !== 'string' || rel.length === 0)
            throw new Error('路径必须是非空字符串');
        const full = resolve(rootDir, rel);
        if (full !== rootDir && !full.startsWith(rootDir + sep)) {
            throw new Error(`路径逃逸被拒绝: ${rel}`);
        }
        return full;
    };
    const fsApi = {
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
            writeFileSync(guard(rel), data, 'utf8');
        };
    }
    return fsApi;
}
/** 执行 safe 插件：entry 源码中必须定义 async run(input)，在受限沙箱中调用 */
export async function runSafePlugin(opts, input) {
    const start = Date.now();
    const { manifest, rootDir } = opts;
    try {
        const code = readFileSync(resolve(rootDir, manifest.entry), 'utf8');
        const perms = new Set(manifest.permissions);
        const sandbox = {
            console: {
                log: (m) => opts.log?.(m),
            },
        };
        if (perms.has('filesystem.read')) {
            sandbox.fs = restrictedFs(rootDir, false);
        }
        if (perms.has('filesystem.write')) {
            sandbox.fs = restrictedFs(rootDir, true);
        }
        // network/process/browser/powerpoint/gpu/media 在 safe 中一律不可用（校验层已拒绝）
        const ctx = vm.createContext(sandbox, { name: `safe-plugin:${manifest.name}` });
        // export 语句只能在 ESM 顶层；vm 脚本模式不支持 export。
        // 约定：safe 插件源码必须直接定义顶层 async function run(input)（无需 export）。
        // 把源码与调用拼接为顶层脚本执行（run 为 async，返回 promise）
        const wrapped = `${code}\nrun(${JSON.stringify(input ?? null)});`;
        const result = await vm.runInContext(wrapped, ctx, { timeout: 5000 });
        return { ok: true, output: result, durationMs: Date.now() - start };
    }
    catch (e) {
        return { ok: false, error: e.message, durationMs: Date.now() - start };
    }
}
