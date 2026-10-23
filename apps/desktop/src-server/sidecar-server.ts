// PresentationOS Desktop Sidecar Server (P04)
// Same-origin authenticated HTTP API for the Windows WebView host.
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, constants, statSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DataPaths } from './local-paths.js';
import { fileURLToPath } from 'node:url';
import {
  createTaskService,
  TaskService,
  type PresentationProject,
  type CompileProgressEvent,
} from '@pres/workflow';
import { reconstructDeckFromScene, type SceneIR } from '@pres/scene-reconstruction';
import { MediaPipeline } from '@pres/media-pipeline';

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  host?: string;
  dataRoot?: string;
  sessionToken?: string;
}

export class DesktopSidecarServer {
  private server: http.Server | null = null;
  private readonly taskService: TaskService;
  private readonly port: number;
  private readonly host: string;
  private boundPort = 0;
  private readonly sessionToken: string;
  private readonly paths: DataPaths;
  private readonly activeRuns: Map<string, {
    progress: CompileProgressEvent[];
    result?: any;
    status: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
    startedAt: number;
    workflowRunId?: string;
  }> = new Map();

  constructor(opts: ServerOptions = {}) {
    this.port = opts.port ?? Number(process.env.PRES_PORT ?? 48200);
    this.host = opts.host ?? '127.0.0.1';
    if (this.host !== '127.0.0.1') throw new Error('Desktop API may only bind to 127.0.0.1');
    this.sessionToken = opts.sessionToken ?? process.env.PRES_SESSION_TOKEN ?? randomBytes(32).toString('hex');
    if (this.sessionToken.length < 32) throw new Error('Session token is too short');
    this.paths = new DataPaths(opts.dataRoot ?? process.env.PRES_DATA_DIR ?? (opts.dbPath ? dirname(opts.dbPath) : join(process.env.LOCALAPPDATA ?? homedir(), 'PresentationOS', 'data')));
    this.taskService = createTaskService({ dbPath: opts.dbPath ?? join(this.paths.root, 'workflows.db') });
  }

  getTaskService(): TaskService {
    return this.taskService;
  }

  async start(): Promise<number> {
    return new Promise((resolvePromise, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.sendJson(res, err.message?.startsWith('Invalid JSON:') ? 400 : err.message === 'Payload too large' ? 413 : 500, { error: err.message ?? String(err) });
        });
      });

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        this.boundPort = actualPort;
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    this.setCorsHeaders(res);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private async parseJsonBody(req: IncomingMessage): Promise<any> {
    req.setEncoding('utf8');
    return new Promise((resolvePromise, reject) => {
      let body = '';
      let rejected = false;
      req.on('data', (chunk) => {
        if (rejected) return;
        body += chunk;
        if (Buffer.byteLength(body) > 25 * 1024 * 1024) {
          rejected = true;
          body = '';
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (rejected) return;
        if (!body) {
          resolvePromise({});
          return;
        }
        try {
          const parsed = JSON.parse(body);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object required');
          for (const key of ['projectDir','projectJsonPath','outPptxPath','outReportPath','outMp4Path','sourcePptxPath','targetPptxPath']) {
            if (parsed[key] !== undefined) parsed[key] = this.paths.file(parsed[key]);
          }
          if (Array.isArray(parsed.slides)) {
            for (const slide of parsed.slides) if (slide?.imagePath) slide.imagePath = this.paths.file(slide.imagePath);
          }
          resolvePromise(parsed);
        } catch (err: any) {
          reject(new Error(`Invalid JSON: ${err.message}`));
        }
      });
      req.on('error', reject);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);
    const authority = `127.0.0.1:${this.boundPort}`;
    const origin = `http://${authority}`;
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== origin)) {
      this.sendJson(res, 403, { error: 'Request host or origin is not permitted' }); return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    if (path.startsWith('/api/') && path !== '/api/health') {
      const supplied = Buffer.from(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '');
      const expected = Buffer.from(this.sessionToken);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        this.sendJson(res, 401, { error: 'Start the desktop app or use its private session link' }); return;
      }
    }
    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) {
      this.sendJson(res, 415, { error: 'Content-Type application/json is required' }); return;
    }
    if (req.method === 'GET' && path === '/api/session') {
      this.sendJson(res, 200, { dataRoot: this.paths.root }); return;
    }

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

    // Reconstruct editable presentation from reference scene (P13)
    if (req.method === 'POST' && path === '/api/reconstruct') {
      const body = await this.parseJsonBody(req);
      const { sceneIr } = body;
      if (!sceneIr || !Array.isArray(sceneIr.elements)) {
        this.sendJson(res, 400, { error: 'Missing or invalid sceneIr payload' });
        return;
      }
      try {
        const result = reconstructDeckFromScene(sceneIr as SceneIR);
        this.sendJson(res, 200, { result });
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Generate speech, subtitles and MP4 video (P14)
    if (req.method === 'POST' && path === '/api/media/generate') {
      const body = await this.parseJsonBody(req);
      const { slides, outMp4Path, voice, speed } = body;
      if (!Array.isArray(slides) || !outMp4Path) {
        this.sendJson(res, 400, { error: 'Missing required slides array or outMp4Path' });
        return;
      }
      try {
        const pipeline = new MediaPipeline();
        const result = await pipeline.processDeck(slides, outMp4Path, { voice, speed });
        this.sendJson(res, 200, { result });
      } catch (err: any) {
        this.sendJson(res, 500, { error: err.message });
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
        workflowRunId?: string;
      } = {
        progress: [] as CompileProgressEvent[],
        result: undefined as any,
        status: 'RUNNING',
        startedAt: Date.now(),
      };
      this.activeRuns.set(runTrackingId, runEntry);

      const compilePromise = new Promise<void>((done) => setImmediate(done)).then(() => this.taskService.compileMarkdown(
        {
          projectId: projectId ?? 'default',
          title: title ?? projectId ?? 'Presentation',
          markdown,
          outPptxPath,
          outReportPath,
        },
        (progress) => {
          runEntry.workflowRunId = progress.runId;
          runEntry.progress.push(progress);
          if (runEntry.status === 'CANCELLED') this.taskService.cancel(progress.runId);
        }
      )).then((result) => {
        runEntry.result = result;
        runEntry.status = result.status as any;
        return result;
      }).catch((err) => {
        runEntry.status = 'FAILED';
        runEntry.result = { ok: false, error: err.message, status: 'FAILED' };
        return runEntry.result;
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
      const tracked = this.activeRuns.get(runId);
      const actualRun = tracked?.workflowRunId ?? runId;
      const actualState = this.taskService.getRun(actualRun);
      if (!tracked && !actualState) {
        this.sendJson(res, 404, { error: 'Task not found' }); return;
      }
      if (['COMPLETED', 'FAILED'].includes(tracked?.status ?? '') || ['COMPLETED', 'FAILED'].includes(actualState?.status ?? '')) {
        this.sendJson(res, 409, { error: 'Task is already terminal' }); return;
      }
      this.taskService.cancel(actualRun);
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
      const dbRun = this.taskService.getRun(tracked?.workflowRunId ?? runId);

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
        copyFileSync(sourcePptxPath, targetPptxPath, constants.COPYFILE_EXCL);
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
      const local = relative(staticDistDir, filePath);
      if (isAbsolute(local) || local.startsWith('..')) { this.sendJson(res, 403, { error: 'Invalid asset path' }); return; }
      if (!existsSync(filePath)) {
        filePath = resolve(staticDistDir, 'index.html');
      }
      if (existsSync(filePath) && statSync(filePath).isFile() && !relative(realpathSync(staticDistDir), realpathSync(filePath)).startsWith('..')) {
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
