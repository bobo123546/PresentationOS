// Worker Spawner：spawn 外部 worker 进程，走 stdio JSON Lines 协议
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  encodeMessage, decodeMessage, isJobRequest, isJobResponse, isJobCancelAck,
  PROTOCOL_VERSION, type WorkerHandshake, type JobRequest, type JobResponse, type JobCancelAck,
} from './protocol.js';

export interface SpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  workerId?: string;
  /** 期望 worker 声明的 capabilities */
  expectedCapabilities?: string[];
}

export interface PendingJob {
  resolve: (r: JobResponse) => void;
  timer: NodeJS.Timeout;
}

export class WorkerProcess {
  readonly proc: ChildProcess;
  private readonly opts: SpawnOptions;
  private readonly rl: ReturnType<typeof createInterface>;
  private readonly pending = new Map<string, PendingJob>();
  private readonly cancelAcks = new Map<string, (ack: JobCancelAck) => void>();
  private readonly lines: string[] = [];
  private static readonly MAX_LOG_LINES = 500;
  handshake: WorkerHandshake | null = null;
  private readonly handshakeResolvers: Array<(h: WorkerHandshake | null) => void> = [];

  constructor(opts: SpawnOptions) {
    this.opts = opts;
    this.proc = spawn(opts.command, opts.args ?? [], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.rl = createInterface({ input: this.proc.stdout!, crlfDelay: Infinity });
    this.rl.on('line', (line) => this.handleLine(line));
    this.proc.stderr!.on('data', (d: Buffer) => {
      this.appendLog(`[stderr] ${d.toString().trimEnd()}`);
    });
    this.proc.on('exit', (code) => {
      const pendingJobs = Array.from(this.pending.entries());
      this.pending.clear();
      for (const [jobId, p] of pendingJobs) {
        clearTimeout(p.timer);
        p.resolve({
          type: 'job_response',
          jobId,
          ok: false,
          output: null,
          errorType: 'WORKER_EXITED',
          errorMessage: `Worker process exited with code ${code}`,
          durationMs: 0,
          artifactRefs: [],
        });
      }
      const resolvers = this.handshakeResolvers.splice(0);
      for (const r of resolvers) r(null);
    });
  }

  private appendLog(line: string): void {
    if (this.lines.length >= WorkerProcess.MAX_LOG_LINES) {
      this.lines.shift();
    }
    this.lines.push(line);
  }

  private handleLine(line: string): void {
    const m = decodeMessage(line);
    if (!m) { this.appendLog(`[bad-json] ${line}`); return; }
    if (m.type === 'handshake') {
      // 运行时校验协议版本
      if (m.protocolVersion !== PROTOCOL_VERSION) {
        this.appendLog(`[protocol-version-mismatch] expected ${PROTOCOL_VERSION}, got ${m.protocolVersion}`);
      }

      // 运行时校验期望能力
      if (this.opts.expectedCapabilities && this.opts.expectedCapabilities.length > 0) {
        const declared = new Set(m.capabilities.map((c) => c.capabilityId));
        const missing = this.opts.expectedCapabilities.filter((c) => !declared.has(c));
        if (missing.length > 0) {
          this.appendLog(`[missing-expected-capabilities] missing: ${missing.join(', ')}`);
          this.handshake = null;
          const resolvers = this.handshakeResolvers.splice(0);
          for (const r of resolvers) r(null);
          return;
        }
      }

      this.handshake = m;
      const resolvers = this.handshakeResolvers.splice(0);
      for (const r of resolvers) r(m);
    } else if (isJobCancelAck(m)) {
      const ackCb = this.cancelAcks.get(m.jobId);
      if (ackCb) {
        this.cancelAcks.delete(m.jobId);
        ackCb(m);
      }
    } else if (isJobResponse(m)) {
      const p = this.pending.get(m.jobId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(m.jobId);
        p.resolve(m);
      } else {
        // 迟到响应隔离：超时或已取消的任务产物，不污染其他任务
        this.appendLog(`[late-job-response] received late response for non-pending job: ${m.jobId}`);
      }
    } else {
      this.appendLog(`[msg] ${JSON.stringify(m)}`);
    }
  }

  waitHandshake(timeoutMs = 10000): Promise<WorkerHandshake | null> {
    if (this.handshake) return Promise.resolve(this.handshake);
    return new Promise((resolve) => {
      const t = setTimeout(() => { resolve(null); }, timeoutMs);
      this.handshakeResolvers.push((h) => { clearTimeout(t); resolve(h); });
    });
  }

  submitJob(job: Omit<JobRequest, 'type'>, timeoutMs = 60000): Promise<JobResponse> {
    return new Promise((resolve) => {
      const msg: JobRequest = { type: 'job_request', ...job };
      const timer = setTimeout(() => {
        this.pending.delete(msg.jobId);
        // 超时触发下发 job_cancel 请求通知 Worker 进程中止
        if (this.proc.stdin && !this.proc.stdin.destroyed) {
          this.proc.stdin.write(encodeMessage({ type: 'job_cancel', jobId: msg.jobId }));
        }
        resolve({
          type: 'job_response',
          jobId: msg.jobId,
          ok: false,
          output: null,
          errorType: 'JOB_TIMEOUT',
          errorMessage: `job timed out after ${timeoutMs}ms`,
          durationMs: timeoutMs,
          artifactRefs: [],
        });
      }, timeoutMs);
      this.pending.set(msg.jobId, { resolve, timer });
      this.proc.stdin!.write(encodeMessage(msg));
    });
  }

  /** 发起任务取消请求 */
  cancelJob(jobId: string, reason = 'user_cancelled'): Promise<JobCancelAck | null> {
    const p = this.pending.get(jobId);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(jobId);
      p.resolve({
        type: 'job_response',
        jobId,
        ok: false,
        output: null,
        errorType: 'JOB_CANCELLED',
        errorMessage: `job cancelled: ${reason}`,
        durationMs: 0,
        artifactRefs: [],
      });
    }

    if (!this.proc.stdin || this.proc.stdin.destroyed) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.cancelAcks.delete(jobId);
        resolve(null);
      }, 3000);
      this.cancelAcks.set(jobId, (ack) => {
        clearTimeout(t);
        resolve(ack);
      });
      this.proc.stdin!.write(encodeMessage({ type: 'job_cancel', jobId }));
    });
  }

  stderrLog(): string { return this.lines.join('\n'); }

  async close(timeoutMs = 3000): Promise<void> {
    if (this.proc.killed || this.proc.exitCode !== null) return;
    this.proc.stdin!.end();
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => { this.proc.kill(); resolve(); }, timeoutMs);
      this.proc.on('exit', () => { clearTimeout(t); resolve(); });
    });
  }
}

export function spawnWorker(opts: SpawnOptions): WorkerProcess {
  return new WorkerProcess(opts);
}
