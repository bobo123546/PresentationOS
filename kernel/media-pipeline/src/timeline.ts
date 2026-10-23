import type { AudioSegment, SlideNarration, TimelineEntry } from './types.js';

export interface TimelineOptions {
  transitionSec?: number;
  silentSlideDurationSec?: number;
}

export function buildDeckTimeline(
  narrations: SlideNarration[],
  audioSegments: AudioSegment[],
  options: TimelineOptions = {}
): {
  timeline: TimelineEntry[];
  totalDurationSec: number;
} {
  const transitionSec = options.transitionSec ?? 0.5;
  const silentDurationSec = options.silentSlideDurationSec ?? 3.0;

  const audioMap = new Map<string, AudioSegment>();
  for (const seg of audioSegments) {
    audioMap.set(seg.slideId, seg);
  }

  const timeline: TimelineEntry[] = [];
  let currentStartSec = 0;

  for (let i = 0; i < narrations.length; i++) {
    const n = narrations[i];
    const seg = audioMap.get(n.slideId);

    const audioDur = seg ? seg.durationSec : (n.isSilent ? silentDurationSec : 2.0);
    const isLastSlide = i === narrations.length - 1;
    // Keep a buffer at the end of each slide for transition
    const transDur = isLastSlide ? 0.5 : transitionSec;
    const slideTotalDur = Math.round((audioDur + transDur) * 1000) / 1000;

    const startSec = Math.round(currentStartSec * 1000) / 1000;
    const endSec = Math.round((currentStartSec + slideTotalDur) * 1000) / 1000;

    timeline.push({
      slideId: n.slideId,
      slideIndex: n.slideIndex,
      startSec,
      endSec,
      audioDurationSec: audioDur,
      transitionDurationSec: transDur,
      totalDurationSec: slideTotalDur,
    });

    currentStartSec = endSec;
  }

  const totalDurationSec = Math.round(currentStartSec * 1000) / 1000;

  return {
    timeline,
    totalDurationSec,
  };
}
