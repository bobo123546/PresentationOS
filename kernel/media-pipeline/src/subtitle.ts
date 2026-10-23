import { writeFileSync } from 'node:fs';
import type { SlideNarration, SubtitleEntry, TimelineEntry } from './types.js';

function formatSrtTime(totalMs: number): string {
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

function formatVttTime(totalMs: number): string {
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

export function generateSubtitles(
  narrations: SlideNarration[],
  timeline: TimelineEntry[]
): {
  entries: SubtitleEntry[];
  srtContent: string;
  vttContent: string;
} {
  const entries: SubtitleEntry[] = [];
  const timeMap = new Map<string, TimelineEntry>();
  for (const t of timeline) {
    timeMap.set(t.slideId, t);
  }

  let index = 1;
  for (const n of narrations) {
    if (n.isSilent || !n.narrationScript.trim()) continue;

    const t = timeMap.get(n.slideId);
    if (!t) continue;

    const startMs = Math.round(t.startSec * 1000);
    // Subtitle displays across spoken audio duration, leaving transition buffer
    const endMs = Math.round((t.startSec + t.audioDurationSec) * 1000);

    entries.push({
      index: index++,
      startMs,
      endMs,
      text: n.narrationScript,
    });
  }

  // Build SRT
  const srtLines: string[] = [];
  for (const e of entries) {
    srtLines.push(String(e.index));
    srtLines.push(`${formatSrtTime(e.startMs)} --> ${formatSrtTime(e.endMs)}`);
    srtLines.push(e.text);
    srtLines.push('');
  }
  const srtContent = srtLines.join('\n');

  // Build WebVTT
  const vttLines: string[] = ['WEBVTT', ''];
  for (const e of entries) {
    vttLines.push(String(e.index));
    vttLines.push(`${formatVttTime(e.startMs)} --> ${formatVttTime(e.endMs)}`);
    vttLines.push(e.text);
    vttLines.push('');
  }
  const vttContent = vttLines.join('\n');

  return {
    entries,
    srtContent,
    vttContent,
  };
}

export function writeSubtitleFiles(
  narrations: SlideNarration[],
  timeline: TimelineEntry[],
  basePath: string
): { srtPath: string; vttPath: string } {
  const { srtContent, vttContent } = generateSubtitles(narrations, timeline);
  const srtPath = basePath.replace(/\.[^.]+$/, '') + '.srt';
  const vttPath = basePath.replace(/\.[^.]+$/, '') + '.vtt';

  writeFileSync(srtPath, srtContent, 'utf8');
  writeFileSync(vttPath, vttContent, 'utf8');

  return { srtPath, vttPath };
}
