import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, writeFileSync, readFileSync, openSync, closeSync, writeSync, mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AudioSegment, MediaQaReport, TimelineEntry } from './types.js';

export interface VideoRenderInput {
  slideImages: string[]; audioSegments: AudioSegment[]; timeline: TimelineEntry[];
  outMp4Path: string; workDir: string; fps?: number;
  resolution?: { width: number; height: number };
}

export function runFfprobe(mediaPath: string): any {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,start_time,duration,nb_frames', '-of', 'json', resolve(mediaPath)], { encoding: 'utf8', timeout: 30000, windowsHide: true }));
}

/** Structural clock checks, not a perceptual/semantic synchronisation certificate. */
export function verifyMediaQuality(mp4Path: string, expectedDurationSec?: number): MediaQaReport {
  const errors: string[] = [];
  let probe: any = {};
  if (!existsSync(mp4Path)) errors.push('Output MP4 file does not exist');
  else { try { probe = runFfprobe(mp4Path); } catch { errors.push('FFprobe could not read output MP4'); } }
  const video = probe.streams?.find((s: any) => s.codec_type === 'video');
  const audio = probe.streams?.find((s: any) => s.codec_type === 'audio');
  const vd = Number(video?.duration), ad = Number(audio?.duration);
  const vs = Number(video?.start_time), as = Number(audio?.start_time);
  const videoValid = !!video && video.codec_name === 'h264' && Number.isFinite(vd) && vd > 0;
  const audioValid = !!audio && audio.codec_name === 'aac' && Number.isFinite(ad) && ad > 0;
  if (!videoValid) errors.push('Missing or invalid H.264 video stream duration');
  if (!audioValid) errors.push('Missing or invalid AAC audio stream duration');
  const tolerance = 0.04;
  const delta = Math.abs(vd - ad), startDelta = Math.abs(vs - as);
  if (!Number.isFinite(delta) || delta > tolerance + 1e-6) errors.push(`Stream duration delta exceeds tolerance: ${delta}s > ${tolerance}s`);
  if (!Number.isFinite(startDelta) || startDelta > tolerance + 1e-6) errors.push(`Stream start delta exceeds tolerance: ${startDelta}s > ${tolerance}s`);
  if (expectedDurationSec !== undefined && (!Number.isFinite(expectedDurationSec) || expectedDurationSec <= 0 || !videoValid || Math.abs(vd - expectedDurationSec) > tolerance + 1e-6 || !audioValid || Math.abs(ad - expectedDurationSec) > tolerance + 1e-6)) errors.push('Rendered duration differs from the planned timeline');
  const [num, den] = String(video?.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    videoDurationSec: Number.isFinite(vd) ? vd : 0, audioDurationSec: Number.isFinite(ad) ? ad : 0,
    syncDeltaSec: Number.isFinite(delta) ? delta : 0, startDeltaSec: Number.isFinite(startDelta) ? startDelta : 0,
    syncPassed: errors.length === 0, videoStreamValid: videoValid, audioStreamValid: audioValid,
    width: video?.width ?? 0, height: video?.height ?? 0, fps: den ? num / den : 0,
    bitrate: Number(probe.format?.bit_rate) || 0, errors,
    syncMetric: 'stream-start-and-duration', syncToleranceSec: tolerance,
    expectedDurationSec, semanticAlignmentVerified: false,
  };
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { timeout: 180000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Encode audio once for the whole deck; avoid per-page AAC delay accumulating at joins. */
export async function renderDeckVideo(input: VideoRenderInput): Promise<MediaQaReport> {
  const { slideImages, audioSegments, timeline, outMp4Path, workDir } = input;
  const fps = input.fps ?? 25;
  const { width, height } = input.resolution ?? { width: 1920, height: 1080 };
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Video FPS must be between 1 and 120');
  if (![width, height].every(n => Number.isInteger(n) && n >= 2 && n <= 8192 && n % 2 === 0)) throw new Error('Video dimensions must be positive even integers <=8192');
  if (!timeline.length || timeline.length !== slideImages.length) throw new Error('Every timeline page requires its own image');
  if (existsSync(outMp4Path)) throw new Error(`Refusing to overwrite video: ${outMp4Path}`);
  mkdirSync(workDir, { recursive: true });
  const job = mkdtempSync(resolve(workDir, '.video-job-'));
  const audioMap = new Map(audioSegments.map(a => [a.slideId, a]));
  const clips: string[] = [];
  const rawTimeline = resolve(job, 'narration-timeline.pcm');
  const fd = openSync(rawTimeline, 'wx');
  let previousEnd = 0;
  try {
    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i], seg = audioMap.get(t.slideId);
      if (!seg || !existsSync(seg.audioPath) || !existsSync(slideImages[i])) throw new Error(`Missing audio/image for ${t.slideId}`);
      if (!Number.isFinite(t.totalDurationSec) || t.totalDurationSec <= 0 || Math.abs(t.startSec - previousEnd) > 1e-7 || Math.abs(t.endSec - t.startSec - t.totalDurationSec) > 1e-7 || t.audioDurationSec > t.totalDurationSec + 1e-6) throw new Error('Invalid or discontinuous video timeline');
      const frames = Math.round(t.totalDurationSec * fps);
      if (frames < 1 || Math.abs(frames / fps - t.totalDurationSec) > 1e-6) throw new Error('Timeline duration must align with output video frames');
      const samples = Math.round(t.endSec * 48000) - Math.round(t.startSec * 48000);
      const raw = resolve(job, `audio-${i}.pcm`);
      ffmpeg(['-n', '-i', resolve(seg.audioPath), '-vn', '-af', `aresample=48000,apad,atrim=end_sample=${samples},asetpts=PTS-STARTPTS`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 's16le', raw]);
      const bytes = readFileSync(raw);
      if (bytes.length !== samples * 2) throw new Error('Padded audio sample count does not match timeline');
      writeSync(fd, bytes);
      const clip = resolve(job, `slide-${i}.mp4`); clips.push(clip);
      ffmpeg(['-n', '-loop', '1', '-framerate', String(fps), '-i', resolve(slideImages[i]), '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', String(fps), '-frames:v', String(frames), clip]);
      previousEnd = t.endSec;
    }
  } finally { closeSync(fd); }
  const manifest = resolve(job, 'clips.txt');
  writeFileSync(manifest, clips.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), { flag: 'wx' });
  const candidate = resolve(job, 'candidate.mp4');
  ffmpeg(['-n', '-f', 'concat', '-safe', '0', '-i', manifest, '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', rawTimeline, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', String(previousEnd), '-movflags', '+faststart', candidate]);
  const qa = verifyMediaQuality(candidate, previousEnd);
  if (!qa.syncPassed) throw new Error(`Rendered media failed structural QA: ${qa.errors.join('; ')}`);
  copyFileSync(candidate, outMp4Path, constants.COPYFILE_EXCL);
  return qa;
}
