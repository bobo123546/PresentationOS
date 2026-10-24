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
  /** 1.0.0 remains readable; newly written projects use 1.1.0. */
  version: '1.0.0' | '1.1.0';
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceDocument: SourceDocument;
  compileProfile?: {
    sourceAsset?: { path: string; sha256: string; filename: string; markdownSha256: string };
    referenceAsset?: { path: string; sha256: string; filename: string };
  };
  editorState?: { sections: Array<{ speakerNotes?: string; layout?: 'title' | 'bullet_list' | 'two_column' | 'big_stat' | 'quote' }> };
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
  /** Reference theme only: does not copy template slide layouts or embedded assets. */
  referencePptxPath?: string;
  /** Optional desktop binding; compared with the exact bytes consumed by compilation. */
  referenceAssetSha256?: string;
  designTokens?: Record<string, unknown>;
  /** Used by compileDocumentFile; source bytes are read by the recorded parse step. */
  sourceDocumentPath?: string;
  sourceAssetSha256?: string;
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
