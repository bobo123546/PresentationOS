// Privileged Plugin Runtime —— 独立 Worker（stdio JSON Lines）
// 消息形状与 worker-protocol 一致：job_request -> job_response
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
/** 启动 privileged 插件（独立进程） */
export function startPrivileged(runtime, cwdOverride) {
    const cwd = cwdOverride ?? runtime.cwd;
    const [cmd, ...args] = runtime.command;
    const child = spawn(cmd, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let buffer = '';
    const pending = new Map();
    const timeouters = new Map();
    child.stdout?.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line)
                continue;
            try {
                const msg = JSON.parse(line);
                if (msg.type === 'job_response' && pending.has(msg.jobId)) {
                    const t = timeouters.get(msg.jobId);
                    if (t)
                        clearTimeout(t);
                    timeouters.delete(msg.jobId);
                    pending.get(msg.jobId)(msg);
                    pending.delete(msg.jobId);
                }
            }
            catch {
                // 忽略非 JSON 行
            }
        }
    });
    child.stderr?.on('data', () => { });
    return {
        send(job, timeoutMs = 10000) {
            return new Promise((resolvePromise, reject) => {
                if (!child.pid) {
                    reject(new Error('插件进程已退出'));
                    return;
                }
                pending.set(job.jobId, resolvePromise);
                timeouters.set(job.jobId, setTimeout(() => {
                    pending.delete(job.jobId);
                    timeouters.delete(job.jobId);
                    reject(new Error(`插件响应超时 (${timeoutMs}ms)`));
                }, timeoutMs));
                child.stdin?.write(JSON.stringify(job) + '\n');
            });
        },
        stop() {
            return new Promise((resolvePromise) => {
                for (const t of timeouters.values())
                    clearTimeout(t);
                timeouters.clear();
                pending.clear();
                if (!child.pid)
                    return resolvePromise();
                child.once('exit', () => resolvePromise());
                child.stdin?.end();
                child.kill();
                // 兜底：2 秒后仍未退出则强制
                setTimeout(() => {
                    if (child.pid)
                        child.kill('SIGKILL');
                    resolvePromise();
                }, 2000).unref();
            });
        },
    };
}
/** 由 manifest 构造 privileged 运行时（command 基于插件目录解析） */
export function runtimeFromManifest(pluginDir, entry, capabilityId) {
    const command = ['node', resolve(pluginDir, entry)];
    return { capabilityId, command, cwd: pluginDir };
}
