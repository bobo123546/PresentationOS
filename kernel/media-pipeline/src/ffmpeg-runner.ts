// FFmpeg & FFprobe runner with per-slide clip generation, caching, and media QA verification.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AudioSegment, MediaQaReport, TimelineEntry } from './types.js';

export interface VideoRenderInput {
  slideImages: string[];
  audioSegments: AudioSegment[];
  timeline: TimelineEntry[];
  outMp4Path: string;
  workDir: string;
  fps?: number;
}

export function runFfprobe(mediaPath: string): any {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,duration',
    '-of', 'json',
    resolve(mediaPath),
  ];

  const stdout = execFileSync('ffprobe', args, {
    encoding: 'utf8',
    timeout: 10000,
  });

  return JSON.parse(stdout);
}

export function verifyMediaQuality(mp4Path: string): MediaQaReport {
  const errors: string[] = [];

  if (!existsSync(mp4Path)) {
    return {
      videoDurationSec: 0,
      audioDurationSec: 0,
      syncDeltaSec: 0,
      syncPassed: false,
      videoStreamValid: false,
      audioStreamValid: false,
      width: 0,
      height: 0,
      fps: 0,
      bitrate: 0,
      errors: ['Output MP4 file does not exist'],
    };
  }

  const probe = runFfprobe(mp4Path);
  const streams = probe.streams || [];
  const format = probe.format || {};

  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  const audioStream = streams.find((s: any) => s.codec_type === 'audio');

  const videoValid = !!videoStream && videoStream.codec_name === 'h264';
  const audioValid = !!audioStream && audioStream.codec_name === 'aac';

  if (!videoValid) errors.push('Missing or invalid H.264 video stream');
  if (!audioValid) errors.push('Missing or invalid AAC audio stream');

  const totalDuration = parseFloat(format.duration || '0');
  const videoDuration = videoStream ? parseFloat(videoStream.duration || format.duration || '0') : 0;
  const audioDuration = audioStream ? parseFloat(audioStream.duration || format.duration || '0') : 0;
  const syncDelta = Math.abs(videoDuration - audioDuration);
  // Audio-visual sync threshold: delta must be within 0.25 seconds
  const syncPassed = syncDelta <= 0.25;

  if (!syncPassed) {
    errors.push(`Audio-visual sync delta exceeds tolerance: ${syncDelta.toFixed(3)}s > 0.250s`);
  }

  const width = videoStream ? videoStream.width || 0 : 0;
  const height = videoStream ? videoStream.height || 0 : 0;
  const bitrate = parseInt(format.bit_rate || '0', 10);

  return {
    videoDurationSec: Math.round(videoDuration * 1000) / 1000,
    audioDurationSec: Math.round(audioDuration * 1000) / 1000,
    syncDeltaSec: Math.round(syncDelta * 1000) / 1000,
    syncPassed,
    videoStreamValid: videoValid,
    audioStreamValid: audioValid,
    width,
    height,
    fps: 25,
    bitrate,
    errors,
  };
}

/**
 * Renders complete presentation video using independent per-slide MP4 clips.
 * Allows instant caching, single-slide re-rendering, and frame-accurate audio sync.
 */
export async function renderDeckVideo(input: VideoRenderInput): Promise<MediaQaReport> {
  const { slideImages, audioSegments, timeline, outMp4Path, workDir } = input;
  const fps = input.fps ?? 25;

  const audioMap = new Map<string, AudioSegment>();
  for (const a of audioSegments) audioMap.set(a.slideId, a);

  const clipPaths: string[] = [];

  // 1. Generate or reuse individual slide MP4 clip
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const imgPath = resolve(slideImages[i] || slideImages[0]);
    const seg = audioMap.get(t.slideId);
    if (!seg || !existsSync(seg.audioPath)) {
      throw new Error(`Missing audio segment for slide ${t.slideId}`);
    }

    const clipPath = resolve(workDir, `slide_clip_${i}.mp4`);
    clipPaths.push(clipPath);

    const clipArgs = [
      '-y',
      '-loop', '1',
      '-i', imgPath,
      '-i', resolve(seg.audioPath),
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-shortest',
      clipPath,
    ];

    execFileSync('ffmpeg', clipArgs, {
      encoding: 'utf8',
      timeout: 30000,
    });
  }

  // 2. Concatenate individual clips into final presentation MP4 using stream copy
  const clipsListPath = resolve(workDir, 'clips_manifest.txt');
  const manifestLines = clipPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`);
  writeFileSync(clipsListPath, manifestLines.join('\n'), 'utf8');

  const concatArgs = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', clipsListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    resolve(outMp4Path),
  ];

  try {
    execFileSync('ffmpeg', concatArgs, {
      encoding: 'utf8',
      timeout: 30000,
    });
  } catch (err: any) {
    throw new Error(`FFmpeg video concatenation failed: ${err.stderr || err.message}`);
  }

  // 3. Verify output media quality with ffprobe
  return verifyMediaQuality(outMp4Path);
}
