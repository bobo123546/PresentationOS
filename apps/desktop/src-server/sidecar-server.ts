// PresentationOS Desktop Sidecar Server (P04)
// Provides HTTP API to Tauri WebView and External Automated Drivers (UIA)
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTaskService,
  TaskService,
  type PresentationProject,
  type CompileProgressEvent,
} from '@pres/workflow';

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  host?: string;
}

export class DesktopSidecarServer {
  private server: http.Server | null = null;
  private readonly taskService: TaskService;
  private readonly port: number;
  private readonly host: string;
  private readonly activeRuns: Map<string, {
    progress: CompileProgressEvent[];
    result?: any;
    status: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
    startedAt: number;
  }> = new Map();

  constructor(opts: ServerOptions = {}) {
    this.port = opts.port ?? Number(process.env.PRES_PORT ?? 48200);
    this.host = opts.host ?? '127.0.0.1';
    this.taskService = createTaskService({ dbPath: opts.dbPath });
  }

  getTaskService(): TaskService {
    return this.taskService;
  }

  async start(): Promise<number> {
    return new Promise((resolvePromise, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.sendJson(res, 500, { error: err.message ?? String(err) });
        });
      });

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        // eslint-disable-next-line no-console
        console.log(`[PresentationOS Desktop Sidecar] Listening on http://${this.host}:${actualPort}`);
        resolvePromise(actualPort);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolvePromise) => {
      this.taskService.close();
      if (this.server) {
        this.server.close(() => resolvePromise());
      } else {
        resolvePromise();
      }
    });
  }

  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    this.setCorsHeaders(res);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private async parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolvePromise, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) {
          resolvePromise({});
          return;
        }
        try {
          resolvePromise(JSON.parse(body));
        } catch (err: any) {
          reject(new Error(`Invalid JSON: ${err.message}`));
        }
      });
      req.on('error', reject);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    // Health check
    if (req.method === 'GET' && path === '/api/health') {
      this.sendJson(res, 200, {
        status: 'OK',
        version: '0.1.2-alpha',
        service: 'PresentationOS-Sidecar',
        uptime: process.uptime(),
      });
      return;
    }

    // New project
    if (req.method === 'POST' && path === '/api/project/new') {
      const body = await this.parseJsonBody(req);
      if (!body.title || !body.projectId) {
        this.sendJson(res, 400, { error: 'Missing required fields: title, projectId' });
        return;
      }
      try {
        const project = await this.taskService.createProject({
          projectId: body.projectId,
          title: body.title,
          sourceDocument: body.sourceDocument ?? {
            filename: `${body.projectId}.md`,
            format: 'markdown',
            content: body.content ?? `# ${body.title}\n\n## 概述\n- 这是 PresentationOS 创建的演示文稿。`,
          },
          projectDir: body.projectDir,
        });
        this.sendJson(res, 201, { project });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Open project
    if (req.method === 'POST' && path === '/api/project/open') {
      const body = await this.parseJsonBody(req);
      if (!body.projectJsonPath) {
        this.sendJson(res, 400, { error: 'Missing projectJsonPath' });
        return;
      }
      try {
        const project = await this.taskService.openProject(body.projectJsonPath);
        this.sendJson(res, 200, { project });
      } catch (err: any) {
        this.sendJson(res, 404, { error: err.message });
      }
      return;
    }

    // Save project
    if (req.method === 'POST' && path === '/api/project/save') {
      const body = await this.parseJsonBody(req);
      if (!body.project || !body.projectJsonPath) {
        this.sendJson(res, 400, { error: 'Missing project or projectJsonPath' });
        return;
      }
      try {
        await this.taskService.saveProject(body.project as PresentationProject, body.projectJsonPath);
        this.sendJson(res, 200, { success: true, savedAt: new Date().toISOString() });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Parse multi-format document (P05)
    if (req.method === 'POST' && path === '/api/document/parse') {
      const body = await this.parseJsonBody(req);
      const { content, filename, base64 } = body;
      if (!content && !base64) {
        this.sendJson(res, 400, { error: 'Missing content or base64' });
        return;
      }
      try {
        const inputBuffer = base64 ? Buffer.from(base64, 'base64') : content;
        const parsed = await this.taskService.parseDocument(inputBuffer, filename ?? 'document.md');
        this.sendJson(res, 200, { parsed });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Compile markdown / project
    if (req.method === 'POST' && path === '/api/project/compile') {
      const body = await this.parseJsonBody(req);
      const { projectId, title, markdown, outPptxPath, outReportPath, async: isAsync } = body;

      if (!markdown || !outPptxPath) {
        this.sendJson(res, 400, { error: 'Missing required parameters: markdown, outPptxPath' });
        return;
      }

      const runTrackingId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const runEntry: {
        progress: CompileProgressEvent[];
        result?: any;
        status: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
        startedAt: number;
      } = {
        progress: [] as CompileProgressEvent[],
        result: undefined as any,
        status: 'RUNNING',
        startedAt: Date.now(),
      };
      this.activeRuns.set(runTrackingId, runEntry);

      const compilePromise = this.taskService.compileMarkdown(
        {
          projectId: projectId ?? 'default',
          title: title ?? projectId ?? 'Presentation',
          markdown,
          outPptxPath,
          outReportPath,
        },
        (progress) => {
          runEntry.progress.push(progress);
        }
      ).then((result) => {
        runEntry.result = result;
        runEntry.status = result.status as any;
        return result;
      }).catch((err) => {
        runEntry.status = 'FAILED';
        runEntry.result = { ok: false, error: err.message, status: 'FAILED' };
        throw err;
      });

      if (isAsync) {
        // Return run tracking ID immediately for polling
        this.sendJson(res, 202, { sidecarRunId: runTrackingId, status: 'RUNNING' });
      } else {
        // Wait for completion synchronously
        try {
          const result = await compilePromise;
          this.sendJson(res, 200, { sidecarRunId: runTrackingId, ...result });
        } catch (err: any) {
          this.sendJson(res, 500, { sidecarRunId: runTrackingId, error: err.message });
        }
      }
      return;
    }

    // Cancel compilation task
    if (req.method === 'POST' && path === '/api/task/cancel') {
      const body = await this.parseJsonBody(req);
      const { runId } = body;
      if (!runId) {
        this.sendJson(res, 400, { error: 'Missing runId' });
        return;
      }
      this.taskService.cancel(runId);
      const tracked = this.activeRuns.get(runId);
      if (tracked) {
        tracked.status = 'CANCELLED';
      }
      this.sendJson(res, 200, { success: true, message: `Task ${runId} cancellation signaled` });
      return;
    }

    // Get task status
    if (req.method === 'GET' && path.startsWith('/api/task/status/')) {
      const runId = path.replace('/api/task/status/', '');
      const tracked = this.activeRuns.get(runId);
      const dbRun = this.taskService.getRun(runId);

      this.sendJson(res, 200, {
        runId,
        tracked: tracked ?? null,
        dbRun: dbRun ?? null,
      });
      return;
    }

    // Export PPTX artifact to target file
    if (req.method === 'POST' && path === '/api/project/export') {
      const body = await this.parseJsonBody(req);
      const { sourcePptxPath, targetPptxPath } = body;
      if (!sourcePptxPath || !targetPptxPath) {
        this.sendJson(res, 400, { error: 'Missing sourcePptxPath or targetPptxPath' });
        return;
      }
      if (!existsSync(sourcePptxPath)) {
        this.sendJson(res, 404, { error: `Source PPTX file not found: ${sourcePptxPath}` });
        return;
      }
      try {
        mkdirSync(dirname(targetPptxPath), { recursive: true });
        copyFileSync(sourcePptxPath, targetPptxPath);
        this.sendJson(res, 200, { success: true, targetPptxPath });
      } catch (err: any) {
        this.sendJson(res, 500, { error: `Failed to export PPTX: ${err.message}` });
      }
      return;
    }

    // Static Web UI serving (for WebView2 / browser launcher)
    if (req.method === 'GET') {
      const staticDistDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
      let filePath = resolve(staticDistDir, path === '/' ? 'index.html' : `.${path}`);
      if (!existsSync(filePath)) {
        filePath = resolve(staticDistDir, 'index.html');
      }
      if (existsSync(filePath)) {
        const { readFileSync } = await import('node:fs');
        const content = readFileSync(filePath);
        let contentType = 'text/plain';
        if (filePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
        else if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
        else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
        else if (filePath.endsWith('.json')) contentType = 'application/json';
        else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
        this.setCorsHeaders(res);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      }
    }

    this.sendJson(res, 404, { error: `Route not found: ${req.method} ${path}` });
  }
}

// Standalone entrypoint
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const server = new DesktopSidecarServer();
  server.start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[Sidecar Error]', err);
    process.exit(1);
  });
}
