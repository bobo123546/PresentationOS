import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readWavDuration, readWavInfo, writeSilenceWav, WindowsSapiTtsProvider, MediaPipeline, buildDeckTimeline, generateSubtitles, splitNarrationSentences, verifyMediaQuality, runFfprobe } from '../src/index.js';

function isolated(): string { return mkdtempSync(join(tmpdir(), 'presentationos-media-regression-')); }
function cleanup(dir: string): void {
  assert.ok(dir.startsWith(join(tmpdir(), 'presentationos-media-regression-')));
  rmSync(dir, { recursive: true, force: true });
}
function riff(fmtSize = 16, extra = false): Buffer {
  const fmt = Buffer.alloc(fmtSize); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(22050, 4); fmt.writeUInt32LE(44100, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunk = (name: string, b: Buffer) => { const h = Buffer.alloc(8); h.write(name); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, ...(b.length % 2 ? [Buffer.alloc(1)] : [])]); };
  const body = Buffer.concat([Buffer.from('WAVE'), ...(extra ? [chunk('JUNK', Buffer.from([1, 2, 3]))] : []), chunk('fmt ', fmt), chunk('data', Buffer.alloc(44100)), ...(extra ? [chunk('LIST', Buffer.from('metadata'))] : [])]);
  const h = Buffer.alloc(8); h.write('RIFF'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]);
}
function image(dir: string, name = 'slide'): string {
  const path = join(dir, `${name}.png`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180', '-frames:v', '1', '-update', '1', path], { stdio: 'pipe' });
  return path;
}

test('RIFF parser reads actual SAPI fmt18 and padded metadata chunks', () => {
  const dir = isolated();
  try { for (const [size, extra] of [[18, false], [18, true], [16, true]] as const) { const p = join(dir, `${size}-${extra}.wav`); writeFileSync(p, riff(size, extra)); assert.equal(readWavDuration(p), 1); assert.equal(readWavInfo(p).dataSize, 44100); } } finally { cleanup(dir); }
});

test('RIFF parser rejects truncated file, invalid chunk length, zero rate and missing data', () => {
  const dir = isolated();
  try {
    const original = riff(18);
    const cases = [original.subarray(0, original.length - 2), Buffer.from(original), Buffer.from(original), Buffer.from(original)];
    cases[1].writeUInt32LE(0xffffffff, 16); cases[2].writeUInt32LE(0, 28); cases[3].write('JUNK', 38);
    for (let i = 0; i < cases.length; i++) { const p = join(dir, `bad-${i}.wav`); writeFileSync(p, cases[i]); assert.throws(() => readWavDuration(p)); }
  } finally { cleanup(dir); }
});

test('Silence writer refuses invalid lengths and existing user output', () => {
  const dir = isolated();
  try { const p = join(dir, 'x.wav'); for (const value of [0, -1, NaN, Infinity]) assert.throws(() => writeSilenceWav(p, value)); writeFileSync(p, 'untouched'); assert.throws(() => writeSilenceWav(p, 1)); assert.equal(readFileSync(p, 'utf8'), 'untouched'); } finally { cleanup(dir); }
});

test('Nonempty SAPI request fails explicitly for unavailable voice; no silent fallback', { skip: process.platform !== 'win32' }, async () => {
  const dir = isolated();
  try { const p = join(dir, 'fail.wav'); await assert.rejects(new WindowsSapiTtsProvider().synthesize('这条语音不允许静默兜底。', p, { voice: 'PresentationOS regression nonexistent voice' }), /synthesis failed/); assert.equal(existsSync(p), false); } finally { cleanup(dir); }
});

test('Missing images reject before provider invocation; no dry-run success or outputs', async () => {
  const dir = isolated(); let calls = 0;
  try { const pipeline = new MediaPipeline({ name: 'must-not-run', async synthesize() { calls++; throw new Error('should not run'); } }); await assert.rejects(pipeline.processDeck([{ id: 's1', index: 0, notes: 'hello' }], join(dir, 'deck.mp4')), /real slide image/); assert.equal(calls, 0); assert.equal(existsSync(join(dir, 'deck.srt')), false); assert.equal(existsSync(join(dir, 'deck.mp4')), false); } finally { cleanup(dir); }
});

test('Provider failure and malformed WAV cannot produce an accepted media result', async () => {
  const dir = isolated();
  try {
    const img = image(dir);
    const fail = new MediaPipeline({ name: 'throws', async synthesize() { throw new Error('provider unavailable'); } });
    await assert.rejects(fail.processDeck([{ id: 's', index: 0, notes: 'hello', imagePath: img }], join(dir, 'a.mp4')), /provider unavailable/);
    const invalid = new MediaPipeline({ name: 'malformed', async synthesize(_, p) { writeFileSync(p, 'not audio'); return { durationSec: 1 }; } });
    await assert.rejects(invalid.processDeck([{ id: 's', index: 0, notes: 'hello', imagePath: img }], join(dir, 'b.mp4')), /RIFF/);
    assert.equal(existsSync(join(dir, 'a.mp4')), false); assert.equal(existsSync(join(dir, 'b.mp4')), false);
  } finally { cleanup(dir); }
});

test('Media output overwrite protection preserves existing video/subtitle bytes', async () => {
  const dir = isolated();
  try { const img = image(dir), p = join(dir, 'deck.mp4'); writeFileSync(join(dir, 'deck.srt'), 'user subtitles'); await assert.rejects(new MediaPipeline().processDeck([{ id: 's', index: 0, notes: 'test', imagePath: img }], p), /overwrite/); assert.equal(readFileSync(join(dir, 'deck.srt'), 'utf8'), 'user subtitles'); assert.equal(existsSync(p), false); } finally { cleanup(dir); }
});

test('Sentence segmentation preserves text and punctuation without pretending word alignment', () => {
  const text = '第一句。第二句！第三句？End. Next;最终一句';
  const parts = splitNarrationSentences(text); assert.ok(parts.length >= 4); assert.equal(parts.join(''), text);
});

test('Subtitle cues use measured sentence boundaries and reject escaped/overlapping timelines', () => {
  const narrations = [{ slideId: 's', slideIndex: 0, notesRaw: '一。二。', narrationScript: '一。二。' }];
  const timeline = [{ slideId: 's', slideIndex: 0, startSec: 2, endSec: 5, audioDurationSec: 2.5, totalDurationSec: 3, transitionDurationSec: 0.5, narrationCues: [{ startSec: 0, endSec: 1.25, text: '一。' }, { startSec: 1.25, endSec: 2.5, text: '二。' }] }];
  const result = generateSubtitles(narrations, timeline); assert.deepEqual(result.entries.map(e => [e.startMs, e.endMs]), [[2000, 3250], [3250, 4500]]);
  assert.throws(() => generateSubtitles(narrations, []), /timeline/);
  const bad = structuredClone(timeline); bad[0].narrationCues[1].endSec = 10; assert.throws(() => generateSubtitles(narrations, bad), /audio/);
  bad[0].narrationCues[1].endSec = 2.5; bad[0].narrationCues[1].startSec = 1; assert.throws(() => generateSubtitles(narrations, bad), /Overlapping/);
});

test('Timeline validates audio and rounds each page to actual output frames, including zero transition', () => {
  const n = [{ slideId: 's', slideIndex: 0, notesRaw: 'x', narrationScript: 'x' }], a = [{ slideId: 's', audioPath: '', durationSec: 1.111, cached: false }];
  assert.equal(buildDeckTimeline(n, a, { fps: 25, transitionSec: 0 }).totalDurationSec, 1.12);
  assert.throws(() => buildDeckTimeline(n, [], { fps: 25 }), /Missing/);
  assert.throws(() => buildDeckTimeline(n, a, { transitionSec: -1 }), /Invalid/);
});

test('Multi-page sentence audio, transition gaps and silent page render without AAC join drift', async () => {
  const dir = isolated(); let calls = 0;
  try {
    const img = image(dir);
    const provider = { name: 'synthetic-duration-only-not-speech', async synthesize(_: string, p: string) { calls++; return { durationSec: writeSilenceWav(p, 0.37 + calls * 0.01) }; } };
    const slides = [0, 1, 2, 3].map(i => ({ id: `s${i}`, index: i, imagePath: img, notes: i === 2 ? '' : `第${i}页第一句。第二句。` }));
    const result = await new MediaPipeline(provider).processDeck(slides, join(dir, 'deck.mp4'), { fps: 25, transitionSec: 0.13, silentSlideDurationSec: 0.31, resolution: { width: 320, height: 180 } });
    assert.equal(result.ok, true); assert.equal(result.subtitleAlignment, 'sentence-audio-boundary');
    assert.equal(result.qa.semanticAlignmentVerified, false); assert.ok(result.qa.syncDeltaSec <= 0.04); assert.equal(result.qa.startDeltaSec, 0);
    assert.ok(Math.abs(result.audioSegments![2].durationSec - 0.31) <= 1 / 22050); assert.equal(result.audioSegments![2].narrationCues!.length, 0);
    const text = readFileSync(result.srtPath, 'utf8'); assert.equal((text.match(/-->/g) ?? []).length, 6); assert.ok(!text.includes('第2页'));
    const probe = runFfprobe(result.mp4Path); assert.equal(Number(probe.streams.find((s: any) => s.codec_type === 'video').nb_frames), Math.round(result.totalDurationSec * 25));
    assert.equal(verifyMediaQuality(result.mp4Path, result.totalDurationSec + 1).syncPassed, false);
  } finally { cleanup(dir); }
});
