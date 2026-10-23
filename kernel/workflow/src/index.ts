// PresentationOS Workflow Package Entrypoint
export { TaskService, createTaskService, type TaskServiceOptions } from './task-service.js';
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
