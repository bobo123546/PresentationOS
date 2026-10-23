import type { AudioSegment, SlideNarration, TimelineEntry } from './types.js';
export interface TimelineOptions { transitionSec?: number; silentSlideDurationSec?: number; fps?: number; }

export function buildDeckTimeline(narrations: SlideNarration[], audioSegments: AudioSegment[], options: TimelineOptions = {}): { timeline: TimelineEntry[]; totalDurationSec: number } {
  const transition = options.transitionSec ?? 0.5, silent = options.silentSlideDurationSec ?? 3;
  if (!Number.isFinite(transition) || transition < 0 || !Number.isFinite(silent) || silent <= 0) throw new Error('Invalid timeline duration options');
  if (options.fps !== undefined && (!Number.isFinite(options.fps) || options.fps < 1 || options.fps > 120)) throw new Error('Invalid timeline FPS');
  const audio = new Map(audioSegments.map(s => [s.slideId, s]));
  if (audio.size !== audioSegments.length || new Set(narrations.map(n => n.slideId)).size !== narrations.length) throw new Error('Duplicate slide identifiers');
  const timeline: TimelineEntry[] = [];
  let current = 0;
  for (const n of narrations) {
    const segment = audio.get(n.slideId);
    if (!segment && !n.isSilent) throw new Error(`Missing narration audio for ${n.slideId}`);
    const duration = segment?.durationSec ?? silent;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio duration must be finite and positive');
    const intended = duration + transition;
    const total = options.fps ? Math.ceil(intended * options.fps - 1e-9) / options.fps : intended;
    const end = current + total;
    timeline.push({ slideId: n.slideId, slideIndex: n.slideIndex, startSec: current, endSec: end, audioDurationSec: duration, transitionDurationSec: total - duration, totalDurationSec: total, narrationCues: segment?.narrationCues });
    current = end;
  }
  return { timeline, totalDurationSec: current };
}
