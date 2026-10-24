// Media Pipeline Types & Interfaces (P14 / TASK-0021)

export type NarrationLanguage = 'zh-CN' | 'en-US';
export type NarrationNormalizationLanguage = NarrationLanguage | 'verbatim';

export interface SlideNarration {
  slideId: string;
  slideIndex: number;
  notesRaw: string;
  narrationScript: string;
  voice?: string;
  speed?: number;
  isSilent?: boolean;
}

export interface AudioSegment {
  slideId: string;
  audioPath: string;
  durationSec: number;
  cached: boolean;
  narrationCues?: NarrationCue[];
}

export interface NarrationCue { startSec: number; endSec: number; text: string; }

export interface TimelineEntry {
  slideId: string;
  slideIndex: number;
  startSec: number;
  endSec: number;
  audioDurationSec: number;
  transitionDurationSec: number;
  totalDurationSec: number;
  narrationCues?: NarrationCue[];
}

export interface SubtitleEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface MediaQaReport {
  videoDurationSec: number;
  audioDurationSec: number;
  syncDeltaSec: number;
  syncPassed: boolean;
  videoStreamValid: boolean;
  audioStreamValid: boolean;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  errors: string[];
  syncMetric?: 'stream-start-and-duration';
  syncToleranceSec?: number;
  startDeltaSec?: number;
  expectedDurationSec?: number;
  semanticAlignmentVerified?: boolean;
}

export interface MediaPipelineOptions {
  fps?: number;
  resolution?: { width: number; height: number };
  voice?: string;
  /** Explicit normalization language; this does not select or install a voice. */
  narrationLanguage?: NarrationLanguage;
  speed?: number;
  transitionSec?: number;
  silentSlideDurationSec?: number;
  cacheDir?: string;
  workDir?: string;
}

export interface MediaPipelineResult {
  ok: boolean;
  mp4Path: string;
  vttPath: string;
  srtPath: string;
  timeline: TimelineEntry[];
  totalDurationSec: number;
  qa: MediaQaReport;
  error?: string;
  subtitleAlignment?: 'sentence-audio-boundary';
  audioSegments?: AudioSegment[];
  narrationProfile?: {
    requestedLanguage?: NarrationLanguage;
    requestedVoice?: string;
    automaticVoiceSelection: false;
    slides: Array<{ slideId: string; language: NarrationNormalizationLanguage; selection: 'explicit' | 'han-detection' | 'verbatim-fallback' }>;
  };
}
