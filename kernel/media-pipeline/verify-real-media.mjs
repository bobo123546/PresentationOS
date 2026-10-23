import { MediaPipeline, runFfprobe, readWavInfo } from './dist/index.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [outArgument, imagesArgument, nativeReportArgument] = process.argv.slice(2);
if (!outArgument || !imagesArgument) throw new Error('Usage: node verify-real-media.mjs <new-evidence-directory> <native-slide-PNG-directory>');
const out = resolve(outArgument), images = resolve(imagesArgument);
mkdirSync(out); // Existing evidence must never be replaced.
let slides = [
  { id: 'finance-intro', index: 0, notes: '这是修复后的金融演示页面。下面核对真实旁白、字幕与画面切换。' },
  { id: 'finance-facts', index: 1, notes: '三个预算分别为37万元、58万元和91万元。净变动为-12.5万元，服务10,000家企业。' },
  { id: 'silent-page', index: 2, notes: '' },
  { id: 'finance-summary', index: 3, notes: '这一页在静音页面之后播放。字幕只覆盖实际语音段，页面停留时间另行计算。' },
].map((s, i) => ({ ...s, imagePath: join(images, `slide-${i + 1}.png`) }));
if (nativeReportArgument) {
  const report = JSON.parse(readFileSync(resolve(nativeReportArgument), 'utf8'));
  const shapes = report.probe.readback_shapes;
  slides = [1, 2, 3].map((page, index) => ({
    id: `native-page-${page}`, index, imagePath: join(images, `slide-${page}.png`),
    notes: shapes.filter(s => s.Slide === page && s.Text !== 'PresentationOS' && !/^\d+\s*\/\s*\d+$/.test(s.Text)).map(s => s.Text).join('\n'),
  }));
  assert.ok(slides.every(s => s.notes.trim()), 'Native source must contain readback text for each narrated page');
  writeFileSync(join(out, 'native-source.json'), JSON.stringify({ report: resolve(nativeReportArgument), reportSha256: createHash('sha256').update(readFileSync(nativeReportArgument)).digest('hex'), pptx: report.input, narrationSource: 'Ordered native PowerPoint text shapes excluding footer/page number; first three pages' }, null, 2));
}
writeFileSync(join(out, 'input.json'), JSON.stringify(slides, null, 2));
const result = await new MediaPipeline().processDeck(slides, join(out, 'narration-1080p.mp4'), {
  fps: 25, transitionSec: 0.35, silentSlideDurationSec: 1.5, voice: 'Microsoft Huihui Desktop',
  workDir: join(out, 'work'), cacheDir: join(out, 'cache'), resolution: { width: 1920, height: 1080 },
});
assert.equal(result.ok, true); assert.equal(result.qa.semanticAlignmentVerified, false);
const probe = runFfprobe(result.mp4Path);
const video = probe.streams.find(s => s.codec_type === 'video');
assert.equal(Number(video.nb_frames), Math.round(result.totalDurationSec * 25));
const decoded = join(out, 'decoded-audio.pcm');
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { windowsHide: true, stdio: 'pipe' });
ffmpeg(['-i', result.mp4Path, '-vn', '-ar', '48000', '-ac', '1', '-f', 's16le', decoded]);
const samples = readFileSync(decoded);
const audioChecks = [];
for (let i = 0; i < result.timeline.length; i++) {
  const page = result.timeline[i], segment = result.audioSegments[i], expected = join(out, `expected-audio-${i}.pcm`);
  ffmpeg(['-i', segment.audioPath, '-ar', '48000', '-ac', '1', '-f', 's16le', expected]);
  const source = readFileSync(expected), start = Math.round(page.startSec * 48000), count = Math.floor(source.length / 2);
  let dot = 0, powerA = 0, powerB = 0, maximum = 0;
  for (let n = 256; n < count - 256; n++) {
    const a = source.readInt16LE(n * 2), b = samples.readInt16LE((start + n) * 2);
    dot += a * b; powerA += a * a; powerB += b * b; maximum = Math.max(maximum, Math.abs(b));
  }
  const similarity = powerA ? dot / Math.sqrt(powerA * powerB) : null;
  if (slides[i].notes) assert.ok(similarity > 0.95, `Decoded speech differs or drifted on page ${i + 1}: ${similarity}`);
  else assert.ok(maximum < 20, `Silent-page unexpected audio peak: ${maximum}`);
  audioChecks.push({ slideId: page.slideId, sourceWav: readWavInfo(segment.audioPath), sourceToMp4Correlation: similarity, silentDecodedPeak: maximum, verifiedStartSample: start });
  const snapshot = join(out, `decoded-page-${i + 1}.png`);
  ffmpeg(['-ss', String(page.startSec + 0.1), '-i', result.mp4Path, '-frames:v', '1', '-update', '1', snapshot]);
}
const hashes = [result.mp4Path, result.srtPath, result.vttPath].map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
writeFileSync(join(out, 'result.json'), JSON.stringify({ ...result, probe, audioChecks, hashes, purpose: nativeReportArgument ? 'Native content narration sample' : 'Fixed-narration technical regression fixture; test words are not the finance deck content', validationScope: 'Real SAPI speech, native PNG inputs, stream clocks, frame count and decoded source audio correlation. No claim of word alignment or perceptual review.' }, null, 2));
console.log(JSON.stringify({ ok: result.ok, totalDurationSec: result.totalDurationSec, qa: result.qa, audioChecks: audioChecks.map(({ sourceWav, ...check }) => check), hashes }, null, 2));
