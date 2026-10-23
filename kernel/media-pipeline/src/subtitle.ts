import { existsSync, rmSync, writeFileSync } from 'node:fs';
import type { SlideNarration, SubtitleEntry, TimelineEntry } from './types.js';

/** Preserve text exactly; each chunk will be independently synthesised and timed. */
export function splitNarrationSentences(text: string): string[] {
  if (!text.trim()) return [];
  return text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/gu) ?? [text];
}

function time(ms: number, separator: string): string {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Invalid subtitle timestamp');
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`;
}

export function generateSubtitles(narrations: SlideNarration[], timeline: TimelineEntry[]): { entries: SubtitleEntry[]; srtContent: string; vttContent: string } {
  const entries: SubtitleEntry[] = [];
  const map = new Map(timeline.map(t => [t.slideId, t]));
  if (map.size !== timeline.length || new Set(narrations.map(n => n.slideId)).size !== narrations.length) throw new Error('Duplicate subtitle slide identifiers');
  let lastEnd = 0;
  for (const n of narrations) {
    if (n.isSilent || !n.narrationScript.trim()) continue;
    const t = map.get(n.slideId);
    if (!t || ![t.startSec, t.endSec, t.audioDurationSec].every(Number.isFinite) || t.startSec < 0 || t.audioDurationSec <= 0 || t.endSec < t.startSec + t.audioDurationSec - 1e-7) throw new Error('Invalid or missing subtitle timeline');
    const cues = t.narrationCues ?? [{ startSec: 0, endSec: t.audioDurationSec, text: n.narrationScript }];
    if (!cues.length || cues.map(c => c.text).join('') !== n.narrationScript) throw new Error('Subtitle chunks must preserve the complete narration text');
    for (const cue of cues) {
      if (![cue.startSec, cue.endSec].every(Number.isFinite) || cue.startSec < 0 || cue.endSec <= cue.startSec || cue.endSec > t.audioDurationSec + 1e-7 || !cue.text.trim()) throw new Error('Subtitle cue exceeds its actual narration audio');
      const startMs = Math.round((t.startSec + cue.startSec) * 1000), endMs = Math.round((t.startSec + cue.endSec) * 1000);
      if (startMs < lastEnd || endMs <= startMs || endMs > Math.round(t.endSec * 1000)) throw new Error('Overlapping or empty subtitle cue');
      entries.push({ index: entries.length + 1, startMs, endMs, text: cue.text });
      lastEnd = endMs;
    }
  }
  const serialize = (separator: string) => entries.map(e => `${e.index}\n${time(e.startMs, separator)} --> ${time(e.endMs, separator)}\n${e.text}\n`).join('\n');
  return { entries, srtContent: serialize(','), vttContent: `WEBVTT\n\n${serialize('.')}` };
}

export function writeSubtitleFiles(narrations: SlideNarration[], timeline: TimelineEntry[], basePath: string): { srtPath: string; vttPath: string } {
  const { srtContent, vttContent } = generateSubtitles(narrations, timeline);
  const stem = basePath.replace(/\.mp4$/i, ''), srtPath = `${stem}.srt`, vttPath = `${stem}.vtt`;
  if (existsSync(srtPath) || existsSync(vttPath)) throw new Error('Refusing to overwrite existing subtitle output');
  writeFileSync(srtPath, srtContent, { flag: 'wx' });
  try { writeFileSync(vttPath, vttContent, { flag: 'wx' }); } catch (error) { rmSync(srtPath); throw error; }
  return { srtPath, vttPath };
}
