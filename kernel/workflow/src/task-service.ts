// PresentationOS Core Application Task Service (P03-A / P05)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WorkflowStore, WorkflowExecutor, type WorkflowRun, type StepContext } from '@pres/durable-workflow';
import { applyRevisions } from '@pres/revision-engine';
import { resolveLayout, renderDeck, type DeckSpec } from '@pres/pptx-engine';
import { validate, SCHEMA_IDS } from '@pres/schema-validator';
import { parseDocument, extractFacts, verifyFactsPreserved, type ParsedDocument } from '@pres/document-parser';
import {
  type PresentationProject,
  type CompileJobOptions,
  type CompileJobResult,
  type CompileProgressEvent,
} from './types.js';
import {
  ensureSchemas,
  mdToDeck,
  layoutFor,
  validateDeck,
  inspectDeck,
  contentSnapshot,
  type DeckInspectionResult,
} from './deck-pipeline.js';

export interface TaskServiceOptions {
  dbPath?: string;
}

export class TaskService {
  private readonly store: WorkflowStore;
  private readonly executor: WorkflowExecutor;

  constructor(opts: TaskServiceOptions = {}) {
    const dbPath = opts.dbPath ?? resolve(process.env.PRES_DATA_DIR ?? 'D:/PresentationOSData', 'workflows.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.store = new WorkflowStore(dbPath);
    this.executor = new WorkflowExecutor(this.store);
    this.registerWorkflows();
  }

  private registerWorkflows(): void {
    this.executor.register({
      name: 'markdown_to_deck_v1',
      steps: [
        {
          name: 'parse_and_validate',
          handler: async (input: { markdown: string; title?: string; outPptxPath: string; outReportPath?: string }, ctx: StepContext) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            await ensureSchemas();
            let deck = mdToDeck(input.markdown, input.title ?? 'deck');
            deck = await validateDeck(deck);
            const originalContent = contentSnapshot(deck);
            return { deck, originalContent, title: input.title, outPptxPath: input.outPptxPath, outReportPath: input.outReportPath };
          },
        },
        {
          name: 'revision_loop',
          handler: async (input: { deck: DeckSpec; originalContent: string; title?: string; outPptxPath: string; outReportPath?: string }, ctx: StepContext) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            let deck = input.deck;
            const original = input.originalContent;
            const history: any[] = [];
            let qa: DeckInspectionResult = inspectDeck(deck);

            for (let round = 0; round < 3; round++) {
              if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
              history.push({ round, overall: qa.visual.overall, passed: qa.passed });
              const suggestions = qa.visual.revision.filter((s: any) => ['split', 'increase_font', 'fix_contrast'].includes(s.action));
              if (!suggestions.length) break;

              const revised = applyRevisions(deck, suggestions);
              deck = revised.deck;
              for (const slide of deck.slides) slide.layout = layoutFor(slide);

              if (contentSnapshot(deck) !== original) {
                throw new Error('Revision changed source content; violating 100% fact preservation guarantee');
              }
              await validateDeck(deck);
              qa = inspectDeck(deck);
            }

            return { deck, qa, history, originalContent: original, outPptxPath: input.outPptxPath, outReportPath: input.outReportPath };
          },
        },
        {
          name: 'render_and_export',
          handler: async (
            input: { deck: DeckSpec; qa: DeckInspectionResult; history: any[]; outPptxPath: string; outReportPath?: string },
            ctx: StepContext
          ) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            const { deck, qa, history, outPptxPath, outReportPath } = input;
            const reportPath = outReportPath ?? outPptxPath.replace(/\.pptx$/i, '.loop.json');

            const summary = {
              passed: qa.passed,
              rounds: history,
              final: { overall: qa.visual.overall, slides: deck.slides.length, issues: qa.visual.issues.length },
              mechanical: qa.mechanical,
              native: qa.native,
              sourceContentPreserved: true,
              pptx: outPptxPath,
            };

            mkdirSync(dirname(outPptxPath), { recursive: true });
            mkdirSync(dirname(reportPath), { recursive: true });

            if (!qa.passed) {
              writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
              throw new Error(`QA failed (score=${qa.visual.overall}); presentation was not published`);
            }

            // 渲染 PPTX
            await renderDeck(deck, {
              outPath: outPptxPath,
              resolveRects: (slide) => resolveLayout(slide.layout ?? layoutFor(slide)),
            });

            // 写入质检报告
            writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');

            return {
              outPptxPath,
              reportPath,
              summary,
              slidesCount: deck.slides.length,
              overallScore: qa.visual.overall,
              issuesCount: qa.visual.issues.length,
            };
          },
        },
      ],
    });
  }

  // ---- 项目管理契约（P00 / P02-A） ----

  async createProject(options: {
    projectId: string;
    title: string;
    sourceDocument: { filename: string; format: any; content: string };
    projectDir?: string;
  }): Promise<PresentationProject> {
    await ensureSchemas();
    const now = new Date().toISOString();
    const project: PresentationProject = {
      schema: 'presentationos-project',
      version: '1.0.0',
      projectId: options.projectId,
      title: options.title,
      createdAt: now,
      updatedAt: now,
      sourceDocument: options.sourceDocument,
      artifacts: {
        pptxPath: null,
        qaReportPath: null,
        pdfPath: null,
      },
      lastCompileState: {
        status: 'IDLE',
        compiledAt: null,
        durationMs: null,
        error: null,
      },
    };

    const val = validate(SCHEMA_IDS.project, project);
    if (!val.valid) {
      throw new Error(`Project schema validation failed: ${val.errors.join('; ')}`);
    }

    if (options.projectDir) {
      mkdirSync(options.projectDir, { recursive: true });
      const pPath = resolve(options.projectDir, 'pres-project.json');
      writeFileSync(pPath, JSON.stringify(project, null, 2), 'utf8');
    }

    return project;
  }

  async openProject(projectJsonPath: string): Promise<PresentationProject> {
    await ensureSchemas();
    if (!existsSync(projectJsonPath)) {
      throw new Error(`Project file not found: ${projectJsonPath}`);
    }
    const raw = readFileSync(projectJsonPath, 'utf8');
    const project = JSON.parse(raw) as PresentationProject;
    const val = validate(SCHEMA_IDS.project, project);
    if (!val.valid) {
      throw new Error(`Invalid project schema: ${val.errors.join('; ')}`);
    }
    return project;
  }

  async saveProject(project: PresentationProject, projectJsonPath: string): Promise<void> {
    await ensureSchemas();
    project.updatedAt = new Date().toISOString();
    const val = validate(SCHEMA_IDS.project, project);
    if (!val.valid) {
      throw new Error(`Cannot save invalid project: ${val.errors.join('; ')}`);
    }
    mkdirSync(dirname(projectJsonPath), { recursive: true });
    writeFileSync(projectJsonPath, JSON.stringify(project, null, 2), 'utf8');
  }

  // ---- 多源文档解析与事实提取（P05） ----

  async parseDocument(content: string | Buffer, filename: string): Promise<ParsedDocument> {
    return parseDocument(content, filename);
  }

  // ---- 核心编译任务（P03-A） ----

  async compileMarkdown(
    opts: CompileJobOptions,
    onProgress?: (e: CompileProgressEvent) => void
  ): Promise<CompileJobResult> {
    const started = Date.now();
    const runId = await this.executor.start('markdown_to_deck_v1', {
      markdown: opts.markdown,
      title: opts.title ?? opts.projectId,
      outPptxPath: opts.outPptxPath,
      outReportPath: opts.outReportPath,
    });

    onProgress?.({
      runId,
      stepName: 'parse_and_validate',
      status: 'RUNNING',
      progressPercent: 20,
      message: 'Parsing markdown and validating schema...',
    });

    const execResult = await this.executor.run(runId);
    const durationMs = Date.now() - started;

    if (execResult.status === 'CANCELLED') {
      return {
        ok: false,
        status: 'CANCELLED',
        runId,
        slidesCount: 0,
        overallScore: 0,
        issuesCount: 0,
        sourceContentPreserved: true,
        durationMs,
        error: 'Compilation was cancelled by user',
      };
    }

    if (execResult.status === 'FAILED') {
      return {
        ok: false,
        status: 'FAILED',
        runId,
        slidesCount: 0,
        overallScore: 0,
        issuesCount: 0,
        sourceContentPreserved: false,
        durationMs,
        error: execResult.error ?? `Step ${execResult.failedStep} failed`,
      };
    }

    const steps = this.store.steps(runId);
    const lastStep = steps.find((s) => s.stepName === 'render_and_export');
    const outData = lastStep?.outputJson ? JSON.parse(lastStep.outputJson) : {};

    return {
      ok: true,
      status: 'COMPLETED',
      runId,
      pptxPath: outData.outPptxPath ?? opts.outPptxPath,
      reportPath: outData.reportPath,
      slidesCount: outData.slidesCount ?? 0,
      overallScore: outData.overallScore ?? 100,
      issuesCount: outData.issuesCount ?? 0,
      sourceContentPreserved: true,
      durationMs,
      summary: outData.summary,
    };
  }

  cancel(runId: string): void {
    this.executor.cancel(runId);
  }

  getRun(runId: string): WorkflowRun | null {
    return this.store.getRun(runId);
  }

  findResumable(): WorkflowRun[] {
    return this.store.findResumable();
  }

  close(): void {
    this.store.close();
  }
}

export function createTaskService(opts?: TaskServiceOptions): TaskService {
  return new TaskService(opts);
}
