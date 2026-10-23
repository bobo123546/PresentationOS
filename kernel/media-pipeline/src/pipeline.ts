import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { AudioSegment, MediaPipelineOptions, MediaPipelineResult, NarrationCue, SlideNarration } from './types.js';
import { normalizeNarrationScript } from './normalizer.js';
import { WindowsSapiTtsProvider, type ITtsProvider, readWavInfo, readWavDuration, writeSilenceWav } from './tts-provider.js';
import { buildDeckTimeline } from './timeline.js';
import { splitNarrationSentences, writeSubtitleFiles } from './subtitle.js';
import { renderDeckVideo } from './ffmpeg-runner.js';

export interface RawSlideInput { id: string; index: number; notes?: string; imagePath?: string; }

export class MediaPipeline {
  constructor(private ttsProvider: ITtsProvider = new WindowsSapiTtsProvider()) {}

  /** Sentence boundaries come from independently synthesised audio, not guessed word timing. */
  async processDeck(slides: RawSlideInput[], outMp4Path: string, options: MediaPipelineOptions = {}): Promise<MediaPipelineResult> {
    if (!Array.isArray(slides) || !slides.length || slides.some(s => !s.id || !Number.isInteger(s.index) || s.index < 0) || new Set(slides.map(s => s.id)).size !== slides.length || new Set(slides.map(s => s.index)).size !== slides.length) throw new Error('A nonempty deck with unique slide identifiers/indices is required');
    if (!/\.mp4$/i.test(outMp4Path)) throw new Error('Output path must end with .mp4');
    const fps = options.fps ?? 25;
    if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Video FPS must be between 1 and 120');
    const silenceDuration = options.silentSlideDurationSec ?? 3;
    if (!Number.isFinite(silenceDuration) || silenceDuration <= 0 || silenceDuration > 3600 || !Number.isFinite(options.transitionSec ?? 0.5) || (options.transitionSec ?? 0.5) < 0) throw new Error('Invalid slide/transition duration');
    // Reject missing assets before any synthesis/output. No mock-success branch.
    for (const s of slides) if (!s.imagePath || !existsSync(s.imagePath) || !statSync(s.imagePath).isFile()) throw new Error(`A real slide image is required for ${s.id}`);
    for (const p of [outMp4Path, outMp4Path.replace(/\.mp4$/i, '.srt'), outMp4Path.replace(/\.mp4$/i, '.vtt')]) if (existsSync(p)) throw new Error(`Refusing to overwrite existing media output: ${p}`);
    mkdirSync(dirname(resolve(outMp4Path)), { recursive: true });
    const workDir = resolve(options.workDir ?? dirname(outMp4Path));
    mkdirSync(workDir, { recursive: true });
    const jobDir = mkdtempSync(resolve(workDir, '.speech-job-'));
    const cacheDir = resolve(options.cacheDir ?? resolve(workDir, '.media-cache-v2'));
    mkdirSync(cacheDir, { recursive: true });
    const narrations: SlideNarration[] = slides.map(s => ({ slideId: s.id, slideIndex: s.index, notesRaw: s.notes ?? '', ...normalizeNarrationScript(s.notes ?? ''), voice: options.voice, speed: options.speed }));
    const audioSegments: AudioSegment[] = [];
    for (const n of narrations) {
      if (n.isSilent) {
        const audioPath = resolve(jobDir, `silent-${n.slideIndex}.wav`);
        const durationSec = writeSilenceWav(audioPath, silenceDuration);
        audioSegments.push({ slideId: n.slideId, audioPath, durationSec, cached: false, narrationCues: [] });
        continue;
      }
      const chunks = splitNarrationSentences(n.narrationScript);
      const paths: string[] = [], cues: NarrationCue[] = [];
      let duration = 0, allCached = true, format = '';
      for (const text of chunks) {
        const hash = createHash('sha256').update(JSON.stringify({ schema: 'sentence-wav-v2', provider: this.ttsProvider.name, text, voice: options.voice ?? '', speed: options.speed ?? 0 })).digest('hex');
        const path = resolve(cacheDir, `${hash}.wav`);
        if (!existsSync(path)) {
          allCached = false;
          await this.ttsProvider.synthesize(text, path, { voice: options.voice, speed: options.speed });
        }
        const info = readWavInfo(path);
        const key = [info.audioFormat, info.channels, info.sampleRate, info.bitsPerSample].join('/');
        if (format && format !== key) throw new Error('Narration sentences must share one WAV sample format');
        format = key;
        paths.push(path);
        cues.push({ startSec: duration, endSec: duration + info.durationSec, text });
        duration += info.durationSec;
      }
      let audioPath = paths[0];
      if (paths.length > 1) {
        const manifest = resolve(jobDir, `sentences-${n.slideIndex}.txt`);
        writeFileSync(manifest, paths.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), { flag: 'wx' });
        audioPath = resolve(jobDir, `narration-${n.slideIndex}.wav`);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'concat', '-safe', '0', '-i', manifest, '-c:a', 'copy', audioPath], { timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      }
      const actual = readWavDuration(audioPath);
      if (Math.abs(actual - duration) > 0.0001) throw new Error('Joined sentence audio does not match subtitle boundaries');
      audioSegments.push({ slideId: n.slideId, audioPath, durationSec: actual, cached: allCached, narrationCues: cues });
    }
    const { timeline, totalDurationSec } = buildDeckTimeline(narrations, audioSegments, { transitionSec: options.transitionSec, silentSlideDurationSec: silenceDuration, fps });
    const qa = await renderDeckVideo({ slideImages: slides.map(s => s.imagePath!), audioSegments, timeline, outMp4Path, workDir: jobDir, fps, resolution: options.resolution });
    const { srtPath, vttPath } = writeSubtitleFiles(narrations, timeline, outMp4Path);
    return { ok: qa.syncPassed && !qa.errors.length, mp4Path: outMp4Path, srtPath, vttPath, timeline, totalDurationSec, qa, subtitleAlignment: 'sentence-audio-boundary', audioSegments };
  }
}
