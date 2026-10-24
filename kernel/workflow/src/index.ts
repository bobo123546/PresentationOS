// PresentationOS Workflow Package Entrypoint
export { TaskService, createTaskService, type TaskServiceOptions } from './task-service.js';
export { documentToDeck } from './document-pipeline.js';
export { compileSourceSections, buildCompiledPageMap, validateCompiledPageMap, verifySourceTraceReadback, resolveSourceRef, sourceHash,
  type SourceLedger, type SourceRef, type SourceFact, type SourceTraceDraft, type CompiledPageMap } from './source-trace.js';
export {
  parseDocument,
  documentIrToDeck,
  extractFacts,
  verifyFactsPreserved,
  detectFormat,
  type ParsedDocument,
  type ExtractedFact,
  type DocumentIR,
  type DocumentFormat,
} from '@pres/document-parser';
export {
  mdToDeck,
  layoutFor,
  validateDeck,
  inspectDeck,
  contentSnapshot,
  ensureSchemas,
  type DeckInspectionResult,
} from './deck-pipeline.js';
export type {
  TaskStatus,
  PresentationProject,
  SourceDocument,
  CompileJobOptions,
  CompileJobResult,
  CompileProgressEvent,
} from './types.js';
