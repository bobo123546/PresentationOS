// PresentationOS Core Application Task Service (P03-A / P05)
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, copyFileSync, constants, unlinkSync, statSync, lstatSync, openSync, closeSync, fsyncSync, renameSync, linkSync, type Stats } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { WorkflowStore, WorkflowExecutor, type WorkflowRun, type StepContext } from '@pres/durable-workflow';
import { applyRevisions } from '@pres/revision-engine';
import { resolveLayout, renderDeck, verifyRenderedDeck, type DeckSpec } from '@pres/pptx-engine';
import { validate, SCHEMA_IDS } from '@pres/schema-validator';
import { parseDocument, type ParsedDocument } from '@pres/document-parser';
import { extractTemplateDna, designTokensFromDna } from '@pres/template-dna';
import { documentSections } from './document-pipeline.js';
import { compileSourceSections, buildCompiledPageMap, verifySourceTraceReadback, type SourceTraceDraft } from './source-trace.js';
import {
  type PresentationProject,
  type CompileJobOptions,
  type CompileJobResult,
  type CompileProgressEvent,
} from './types.js';
import {
  ensureSchemas,
  markdownSections,
  layoutFor,
  validateDeck,
  inspectDeck,
  contentSnapshot,
  type DeckInspectionResult,
} from './deck-pipeline.js';

export interface TaskServiceOptions {
  dbPath?: string;
}

/** Stage complete bytes before publication; never overwrite another project or an invalid file. */
function persistProject(project: PresentationProject, destination: string, createOnly: boolean): void {
  const path = resolve(destination), bytes = Buffer.from(JSON.stringify(project, null, 2), 'utf8');
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  let original: { stat: Stats; sha256: string } | undefined;
  let entry: Stats | undefined;
  try { entry = lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (entry) {
    if (createOnly) throw new Error(`Project file already exists; choose a new project directory: ${path}`);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Cannot replace a non-regular project file or symbolic link: ${path}`);
    const previousBytes = readFileSync(path);
    let previous: PresentationProject;
    try { previous = JSON.parse(previousBytes.toString('utf8')) as PresentationProject; }
    catch { throw new Error(`Cannot overwrite an existing file that is not valid project JSON: ${path}`); }
    const checked = validate(SCHEMA_IDS.project, previous);
    if (!checked.valid) throw new Error(`Cannot overwrite an existing file with an invalid project schema: ${path}`);
    if (previous.projectId !== project.projectId) throw new Error(`Project identity mismatch; refusing to replace ${previous.projectId} with ${project.projectId}: ${path}`);
    original = { stat: entry, sha256: hash(previousBytes) };
  }
  mkdirSync(dirname(path), { recursive: true });
  const staged = join(dirname(path), `.pres-project-save-${randomUUID()}.json.tmp`);
  try {
    const fd = openSync(staged, 'wx', 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); }
    finally { closeSync(fd); }
    const stagedBytes = readFileSync(staged);
    if (hash(stagedBytes) !== hash(bytes) || !validate(SCHEMA_IDS.project, JSON.parse(stagedBytes.toString('utf8'))).valid) throw new Error('Staged project did not pass readback verification');
    if (original) {
      const current = lstatSync(path);
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== original.stat.dev || current.ino !== original.stat.ino || hash(readFileSync(path)) !== original.sha256) {
        throw new Error('Existing project changed during save; reopen it before saving again');
      }
      // Atomic replacement of an existing, rechecked same-ID project. This is
      // not a complete compare-and-swap protocol for concurrent same-ID editors.
      renameSync(staged, path);
    } else {
      // Same-directory hard-link publication is atomic and refuses a destination
      // created after our initial check. Do not fall back to an overwriting rename.
      linkSync(staged, path);
      unlinkSync(staged);
    }
  } catch (error) {
    throw new Error(`Project save failed; existing destination was not removed. Staged recovery file: ${staged}. ${error instanceof Error ? error.message : String(error)}`);
  }
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
          handler: async (input: { markdown: string; title?: string; outPptxPath: string; outReportPath?: string; referencePptxPath?: string; designTokens?: Record<string, unknown>; maxRevisionRounds?: number; sourceDocumentPath?: string; sourceAssetSha256?: string; referenceAssetSha256?: string }, ctx: StepContext) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            await ensureSchemas();
            const maxRevisionRounds = input.maxRevisionRounds === undefined ? 3 : input.maxRevisionRounds;
            if (!Number.isSafeInteger(maxRevisionRounds) || maxRevisionRounds < 0 || maxRevisionRounds > 10) throw new Error('maxRevisionRounds must be an integer between 0 and 10');
            let deck: DeckSpec;
            let sourceTrace: SourceTraceDraft;
            let sourceProfile: Record<string, unknown> | undefined;
            if (input.sourceDocumentPath) {
              if (input.markdown) throw new Error('Choose Markdown content or a document source path, not both');
              if (statSync(input.sourceDocumentPath).size > 16 * 1024 * 1024) throw new Error('Document source exceeds the 16 MiB ingestion limit');
              const bytes = readFileSync(input.sourceDocumentPath);
              if (bytes.length > 16 * 1024 * 1024) throw new Error('Document source exceeds the 16 MiB ingestion limit');
              if (input.sourceAssetSha256 && createHash('sha256').update(bytes).digest('hex') !== input.sourceAssetSha256) throw new Error('SOURCE_HASH_CHANGED: document asset changed before ingestion');
              if (/\.(?:md|markdown)$/i.test(input.sourceDocumentPath)) {
                let text: string;
                try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
                catch { throw new Error('Document text must be valid UTF-8'); }
                if (text.includes('\u0000') || text.startsWith('%PDF-') || bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('Binary document cannot be parsed as Markdown');
                const parsed = markdownSections(text, input.title ?? basename(input.sourceDocumentPath));
                const compiled = compileSourceSections(parsed.title, parsed.sections, { bytes, extractedText: text, format: 'markdown' });
                deck = compiled.deck; sourceTrace = compiled.trace;
                sourceProfile = { path: resolve(input.sourceDocumentPath), sha256: sourceTrace.ledger.sourceBytesSha256, format: 'markdown',
                  scope: 'The same source-order Markdown parser as direct Markdown compilation; syntax is normalized, all presentation text and table cells are source-bound' };
              } else {
                const source = await parseDocument(bytes, basename(input.sourceDocumentPath));
                const parsed = documentSections(source.doc, input.title ?? basename(input.sourceDocumentPath));
                const compiled = compileSourceSections(parsed.title, parsed.sections, { bytes, extractedText: source.rawText, format: source.doc.sourceType });
                deck = compiled.deck; sourceTrace = compiled.trace;
                sourceProfile = { path: resolve(input.sourceDocumentPath), sha256: source.sha256, format: source.doc.sourceType, summary: source.summary,
                  scope: 'Parsed body text, lists, code and cached table values; embedded assets, document styling and formula evaluation are not reproduced' };
              }
            } else {
              const parsed = markdownSections(input.markdown, input.title ?? 'deck');
              const compiled = compileSourceSections(parsed.title, parsed.sections, { bytes: Buffer.from(input.markdown, 'utf8'), extractedText: input.markdown, format: 'markdown' });
              deck = compiled.deck; sourceTrace = compiled.trace;
            }
            await new Promise<void>(done => setImmediate(done));
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            if (input.referencePptxPath && input.designTokens) throw new Error('Choose a reference template or explicit design tokens, not both');
            let designProfile: Record<string, unknown> | undefined;
            if (input.referencePptxPath) {
              if (!/\.pptx$/i.test(input.referencePptxPath)) throw new Error('Reference template must be a .pptx file');
              const bytes = readFileSync(input.referencePptxPath);
              if (input.referenceAssetSha256 && createHash('sha256').update(bytes).digest('hex') !== input.referenceAssetSha256) throw new Error('SOURCE_HASH_CHANGED: reference asset changed before ingestion');
              const dna = await extractTemplateDna(bytes, resolve(input.referencePptxPath));
              deck.designTokens = { ...designTokensFromDna(dna) };
              designProfile = { source: resolve(input.referencePptxPath), sha256: createHash('sha256').update(bytes).digest('hex'),
                dna, tokens: deck.designTokens, scope: 'Theme colors and fonts applied to generated editable slides; template geometry and assets are not copied' };
            } else if (input.designTokens) {
              deck.designTokens = input.designTokens;
              designProfile = { tokens: input.designTokens, scope: 'Explicit role-based colors and fonts applied to generated editable slides' };
            }
            deck = await validateDeck(deck);
            const originalContent = contentSnapshot(deck);
            return { deck, originalContent, sourceTrace, designProfile, sourceProfile, maxRevisionRounds, title: input.title, outPptxPath: input.outPptxPath, outReportPath: input.outReportPath };
          },
        },
        {
          name: 'revision_loop',
          handler: async (input: { deck: DeckSpec; originalContent: string; sourceTrace: SourceTraceDraft; designProfile?: Record<string, unknown>; sourceProfile?: Record<string, unknown>; maxRevisionRounds: number; title?: string; outPptxPath: string; outReportPath?: string }, ctx: StepContext) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            let deck = input.deck;
            const original = input.originalContent;
            const history: any[] = [];
            let qa: DeckInspectionResult = inspectDeck(deck);

            for (let round = 0; round < input.maxRevisionRounds; round++) {
              if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
              history.push({ round, overall: qa.visual.overall, passed: qa.passed });
              const suggestions = qa.visual.revision.filter((s: any) => ['split', 'increase_font', 'fix_contrast'].includes(s.action));
              if (!suggestions.length) break;

              const revised = applyRevisions(deck, suggestions);
              deck = revised.deck;
              for (const slide of deck.slides) slide.layout = layoutFor(slide);

              if (contentSnapshot(deck) !== original) {
                throw new Error('Revision changed source blocks; refusing to publish altered content');
              }
              await validateDeck(deck);
              qa = inspectDeck(deck);
            }

            return { deck, qa, history, sourceTrace: input.sourceTrace, designProfile: input.designProfile, sourceProfile: input.sourceProfile, originalContent: original, outPptxPath: input.outPptxPath, outReportPath: input.outReportPath };
          },
        },
        {
          name: 'render_and_export',
          handler: async (
            input: { deck: DeckSpec; qa: DeckInspectionResult; history: any[]; sourceTrace: SourceTraceDraft; designProfile?: Record<string, unknown>; sourceProfile?: Record<string, unknown>; outPptxPath: string; outReportPath?: string },
            ctx: StepContext
          ) => {
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            const { deck, qa, history, outPptxPath, outReportPath } = input;
            const outputPath = resolve(outPptxPath);
            const reportPath = resolve(outReportPath ?? outPptxPath.replace(/\.pptx$/i, '.loop.json'));
            if (!/\.pptx$/i.test(outputPath) || outputPath.toLowerCase() === reportPath.toLowerCase()) {
              throw new Error('Use a .pptx output and a distinct report path');
            }
            if (existsSync(outputPath) || existsSync(reportPath)) {
              throw new Error('Output or report already exists; choose new paths to preserve existing files');
            }
            mkdirSync(dirname(outputPath), { recursive: true });
            mkdirSync(dirname(reportPath), { recursive: true });
            const stagingDir = mkdtempSync(join(dirname(outputPath), '.pres-compile-'));
            const candidate = join(stagingDir, 'candidate.pptx');
            const stagedReport = join(stagingDir, 'report.json');
            const summary: Record<string, any> = {
              runId: ctx.runId,
              passed: false,
              rounds: history,
              final: { overall: qa.visual.overall, slides: deck.slides.length, issues: qa.visual.issues.length },
              mechanical: qa.mechanical,
              native: qa.native,
              visual: qa.visual,
              sourceContentPreserved: false,
              verificationScope: 'Source block content and OOXML readback; no claim of semantic truth or Native/UI acceptance',
              visualScope: 'Deterministic rules on the actual resolved render commands',
              pptx: outputPath,
              stagingDirectory: stagingDir,
              designProfile: input.designProfile,
              sourceProfile: input.sourceProfile,
              sourceLedger: input.sourceTrace.ledger,
              sourceTraceStatus: 'NOT_ATTEMPTED_QA_FAILED',
            };
            if (!qa.passed) {
              writeFileSync(stagedReport, JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
              copyFileSync(stagedReport, reportPath, constants.COPYFILE_EXCL);
              throw new Error(`QA failed (score=${qa.visual.overall}); not published. Evidence: ${stagedReport}`);
            }
            let compiledPageMap;
            try { compiledPageMap = buildCompiledPageMap(deck, input.sourceTrace); }
            catch (error) {
              summary.sourceTraceStatus = 'FAILED';
              summary.sourceTraceError = error instanceof Error ? error.message : String(error);
              writeFileSync(stagedReport, JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
              copyFileSync(stagedReport, reportPath, constants.COPYFILE_EXCL);
              throw error;
            }
            summary.compiledPageMap = compiledPageMap;
            summary.sourceTraceStatus = 'QUOTATIONS_BOUND_READBACK_PENDING';
            await new Promise<void>(done => setImmediate(done));
            if (ctx.isCancelled?.()) throw new Error('Task was cancelled');
            await renderDeck(deck, {
              outPath: candidate,
              resolveRects: (slide) => resolveLayout(slide.layout ?? layoutFor(slide)),
              signal: ctx.signal,
            });
            const contentVerification = await verifyRenderedDeck(candidate, deck);
            summary.contentVerification = contentVerification;
            try {
              verifySourceTraceReadback(input.sourceTrace.ledger, compiledPageMap, contentVerification);
              summary.sourceTraceStatus = 'EXACT_QUOTATION_READBACK_PASS';
            } catch (error) {
              summary.sourceTraceStatus = 'FAILED';
              summary.sourceTraceError = error instanceof Error ? error.message : String(error);
              contentVerification.ok = false;
              contentVerification.missing.push(summary.sourceTraceError);
            }
            summary.sourceContentPreserved = contentVerification.ok;
            summary.passed = qa.passed && contentVerification.ok;
            summary.sha256 = createHash('sha256').update(readFileSync(candidate)).digest('hex');
            if (ctx.isCancelled?.()) {
              summary.passed = false;
              summary.status = 'CANCELLED';
              writeFileSync(stagedReport, JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
              throw new Error(`Task was cancelled; candidate retained at ${stagingDir}`);
            }
            writeFileSync(stagedReport, JSON.stringify(summary, null, 2), { encoding: 'utf8', flag: 'wx' });
            if (!contentVerification.ok) {
              copyFileSync(stagedReport, reportPath, constants.COPYFILE_EXCL);
              throw new Error(`PPTX content readback failed; not published. Evidence: ${stagedReport}`);
            }
            // Never overwrite an existing destination, including a file created
            // while rendering. Publish the independently checked candidate only.
            let publishedIdentity: { ino: number; dev: number } | undefined;
            try {
              copyFileSync(candidate, outputPath, constants.COPYFILE_EXCL);
              publishedIdentity = statSync(outputPath);
              copyFileSync(stagedReport, reportPath, constants.COPYFILE_EXCL);
            } catch (error) {
              // Remove only this task's unchanged copy on partial publication;
              // a destination another task or the user replaced is preserved.
              if (publishedIdentity && existsSync(outputPath)) {
                const current = statSync(outputPath);
                if (current.ino === publishedIdentity.ino && current.dev === publishedIdentity.dev &&
                    createHash('sha256').update(readFileSync(outputPath)).digest('hex') === summary.sha256) unlinkSync(outputPath);
              }
              throw error;
            }
            return {
              outPptxPath: outputPath,
              reportPath,
              summary,
              sourceContentPreserved: contentVerification.ok,
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
      version: '1.1.0',
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
      const pPath = resolve(options.projectDir, 'pres-project.json');
      persistProject(project, pPath, true);
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
    const saved: PresentationProject = { ...project, version: '1.1.0', updatedAt: new Date().toISOString() };
    const val = validate(SCHEMA_IDS.project, saved);
    if (!val.valid) {
      throw new Error(`Cannot save invalid project: ${val.errors.join('; ')}`);
    }
    persistProject(saved, projectJsonPath, false);
    project.version = saved.version;
    project.updatedAt = saved.updatedAt;
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
      referencePptxPath: opts.referencePptxPath,
      designTokens: opts.designTokens,
      maxRevisionRounds: opts.maxRevisionRounds,
      sourceDocumentPath: opts.sourceDocumentPath,
      sourceAssetSha256: opts.sourceAssetSha256,
      referenceAssetSha256: opts.referenceAssetSha256,
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
        sourceContentPreserved: false,
        durationMs,
        error: 'Compilation was cancelled by user',
      };
    }

    if (execResult.status === 'FAILED') {
      const candidateReport = resolve(opts.outReportPath ?? opts.outPptxPath.replace(/\.pptx$/i, '.loop.json'));
      let ownReport: string | undefined;
      try { if (JSON.parse(readFileSync(candidateReport, 'utf8')).runId === runId) ownReport = candidateReport; } catch { /* No report for this run. */ }
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
        reportPath: ownReport,
      };
    }

    const steps = this.store.steps(runId);
    const lastStep = steps.find((s) => s.stepName === 'render_and_export');
    const outData = lastStep?.outputJson ? JSON.parse(lastStep.outputJson) : {};

    if (!outData.summary?.passed || outData.sourceContentPreserved !== true || !outData.summary?.contentVerification?.ok || outData.summary?.compiledPageMap?.readback?.status !== 'PASS') {
      return { ok: false, status: 'FAILED', runId, slidesCount: 0, overallScore: 0, issuesCount: 0,
        sourceContentPreserved: false, durationMs, error: 'Completed workflow is missing successful final PPTX readback evidence' };
    }
    return {
      ok: true,
      status: 'COMPLETED',
      runId,
      pptxPath: outData.outPptxPath ?? opts.outPptxPath,
      reportPath: outData.reportPath,
      slidesCount: outData.slidesCount ?? 0,
      overallScore: outData.overallScore ?? 0,
      issuesCount: outData.issuesCount ?? 0,
      sourceContentPreserved: outData.sourceContentPreserved === true,
      durationMs,
      summary: outData.summary,
    };
  }

  async compileDocumentFile(
    opts: Omit<CompileJobOptions, 'markdown' | 'sourceDocumentPath'> & { inputPath: string },
    onProgress?: (e: CompileProgressEvent) => void
  ): Promise<CompileJobResult> {
    const { inputPath, ...options } = opts;
    return this.compileMarkdown({ ...options, title: options.title ?? basename(inputPath).replace(/\.[^.]+$/, ''), markdown: '', sourceDocumentPath: resolve(inputPath) }, onProgress);
  }

  cancel(runId: string): void {
    const run = this.store.getRun(runId);
    if (!run || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return;
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
