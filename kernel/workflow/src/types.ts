// PresentationOS Shared Application Workflow & Task Types

export type TaskStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'CANCELLING' | 'CANCELLED' | 'COMPLETED' | 'FAILED';

export interface SourceDocument {
  filename: string;
  format: 'markdown' | 'txt' | 'docx' | 'csv' | 'tsv' | 'xlsx' | 'pdf' | 'pptx';
  content: string;
  sha256?: string;
}

export interface PresentationProject {
  schema: 'presentationos-project';
  version: '1.0.0';
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceDocument: SourceDocument;
  template?: {
    id: string;
    name: string;
    themeOverrides?: Record<string, unknown>;
  };
  artifacts?: {
    pptxPath: string | null;
    qaReportPath: string | null;
    pdfPath: string | null;
  };
  lastCompileState?: {
    status: TaskStatus;
    compiledAt: string | null;
    durationMs: number | null;
    error: string | null;
  };
}

export interface CompileJobOptions {
  projectId: string;
  markdown: string;
  title?: string;
  outPptxPath: string;
  outReportPath?: string;
  maxRevisionRounds?: number;
}

export interface CompileJobResult {
  ok: boolean;
  status: TaskStatus;
  runId: string;
  pptxPath?: string;
  reportPath?: string;
  slidesCount: number;
  overallScore: number;
  issuesCount: number;
  sourceContentPreserved: boolean;
  durationMs: number;
  error?: string;
  summary?: Record<string, unknown>;
}

export interface CompileProgressEvent {
  runId: string;
  stepName: string;
  status: TaskStatus;
  progressPercent: number;
  message: string;
}
