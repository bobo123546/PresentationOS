// Desktop Workbench Type Definitions
export interface SlideItem {
  id: string;
  title: string;
  bullets: string[];
  layout: 'title' | 'bullet_list' | 'two_column' | 'big_stat' | 'quote';
  speakerNotes?: string;
  headingLevel?: 1 | 2;
}

export interface ImportedAsset {
  path: string;
  sha256: string;
  filename: string;
}

export interface CompileProfile {
  sourceAsset?: ImportedAsset & { markdownSha256: string };
  referenceAsset?: ImportedAsset;
}

export interface QaReport {
  passed: boolean;
  overallScore: number;
  slidesCount: number;
  issuesCount: number;
  sourceContentPreserved: boolean;
  mechanicalPassed?: boolean;
  visualPassed?: boolean;
  nativeStatus?: string;
  sourceTrace?: {
    passed: boolean;
    chunks: number;
    occurrences: number;
    pages: number;
  };
  issues?: Array<{
    slideIndex: number;
    ruleId: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
}

export type TaskEngineStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface CompilationState {
  status: TaskEngineStatus;
  runId: string | null;
  progressPercent: number;
  message: string;
  pptxPath: string | null;
  reportPath: string | null;
  qaReport: QaReport | null;
  durationMs: number | null;
  error: string | null;
}
