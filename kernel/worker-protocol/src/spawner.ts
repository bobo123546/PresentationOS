// Worker Spawner：spawn 外部 worker 进程，走 stdio JSON Lines 协议
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { encodeMessage, decodeMessage, isJobRequest, isJobResponse, type WorkerHandshake, type JobRequest, type JobResponse } from './protocol.js';

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
  private readonly rl: ReturnType<typeof createInterface>;
  private readonly pending = new Map<string, PendingJob>();
  private readonly lines: string[] = [];
  handshake: WorkerHandshake | null = null;
  private readonly handshakeResolvers: Array<(h: WorkerHandshake | null) => void> = [];

  constructor(opts: SpawnOptions) {
    this.proc = spawn(opts.command, opts.args ?? [], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.rl = createInterface({ input: this.proc.stdout!, crlfDelay: Infinity });
    this.rl.on('line', (line) => this.handleLine(line));
    this.proc.stderr!.on('data', (d: Buffer) => {
      this.lines.push(`[stderr] ${d.toString().trimEnd()}`);
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

  private handleLine(line: string): void {
    const m = decodeMessage(line);
    if (!m) { this.lines.push(`[bad-json] ${line}`); return; }
    if (m.type === 'handshake') {
      this.handshake = m;
      const resolvers = this.handshakeResolvers.splice(0);
      for (const r of resolvers) r(m);
    } else if (isJobResponse(m)) {
      const p = this.pending.get(m.jobId);
      if (p) { clearTimeout(p.timer); this.pending.delete(m.jobId); p.resolve(m); }
    } else {
      this.lines.push(`[msg] ${JSON.stringify(m)}`);
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
        resolve({ type: 'job_response', jobId: msg.jobId, ok: false, output: null, errorType: 'JOB_TIMEOUT', errorMessage: `job timed out after ${timeoutMs}ms`, durationMs: timeoutMs, artifactRefs: [] });
      }, timeoutMs);
      this.pending.set(msg.jobId, { resolve, timer });
      this.proc.stdin!.write(encodeMessage(msg));
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
