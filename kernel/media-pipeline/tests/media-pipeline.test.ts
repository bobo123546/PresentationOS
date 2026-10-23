import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  normalizeNarrationScript,
  writeSilenceWav,
  readWavDuration,
  buildDeckTimeline,
  generateSubtitles,
  MediaPipeline,
  WindowsSapiTtsProvider,
} from '../src/index.js';

test('TC-M01: Normalizes speech script with numbers, currencies, and years', () => {
  const raw = '在2026年，我们的营收达到50万元，交付了120台设备，同比增长24%。';
  const { narrationScript, isSilent } = normalizeNarrationScript(raw);

  assert.equal(isSilent, false);
  assert.ok(narrationScript.includes('二零二六年'), 'Year normalized');
  assert.ok(narrationScript.includes('五十万元'), 'Currency normalized');
  assert.ok(narrationScript.includes('一百二十台'), 'Quantity normalized');
  assert.ok(narrationScript.includes('百分之二十四'), 'Percentage normalized');
});

test('TC-M02: Handles empty notes as silent slides without error', () => {
  const { narrationScript, isSilent } = normalizeNarrationScript('');
  assert.equal(isSilent, true);
  assert.equal(narrationScript, '');
});

test('Narration does not partially rewrite decimal, grouped or embedded numeric tokens', () => {
  const input = '净变动-12.5万元，服务10,000家；误差0.25%，编号12026年。';
  const result = normalizeNarrationScript(input).narrationScript;
  assert.ok(result.includes('负12.5万元'));
  assert.ok(result.includes('10000家'));
  assert.ok(result.includes('百分之0.25'));
  assert.ok(result.includes('12026年'));
});

test('Narration distinguishes negative values from ranges and retains identifier/math symbols', () => {
  const result = normalizeNarrationScript('净额−12.5万元、-8万元，区间5-10家，版本a_b，C#，x~y，成本1,234,567.89元。').narrationScript;
  assert.ok(result.includes('负12.5万元')); assert.ok(result.includes('负八万元'));
  assert.ok(result.includes('5-10家')); // Never rewrite just one end of a numeric range.
  assert.ok(result.includes('a_b')); assert.ok(result.includes('C#')); assert.ok(result.includes('x~y'));
  assert.ok(result.includes('1234567.89元'));
});

test('TC-M03: Standard PCM WAV synthesis generates valid readable audio header', () => {
  const dir = mkdtempSync(join(tmpdir(), 'presentationos-media-unit-'));
  const testWav = join(dir, 'silence.wav');
  try {
    const dur = writeSilenceWav(testWav, 2.5);
    assert.equal(dur, 2.5);
    assert.ok(existsSync(testWav));

    const readDur = readWavDuration(testWav);
    assert.ok(Math.abs(readDur - 2.5) < 0.05, `Expected 2.5s, got ${readDur}`);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'presentationos-media-unit-')));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TC-M04: Timeline calculation handles transition buffers and multi-slide sequence', () => {
  const narrations = [
    { slideId: 's1', slideIndex: 0, notesRaw: 'intro', narrationScript: 'intro', isSilent: false },
    { slideId: 's2', slideIndex: 1, notesRaw: '', narrationScript: '', isSilent: true },
  ];
  const audioSegments = [
    { slideId: 's1', audioPath: 's1.wav', durationSec: 3.0, cached: false },
    { slideId: 's2', audioPath: 's2.wav', durationSec: 2.0, cached: false },
  ];

  const { timeline, totalDurationSec } = buildDeckTimeline(narrations, audioSegments, {
    transitionSec: 0.5,
  });

  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].startSec, 0);
  assert.equal(timeline[0].endSec, 3.5); // 3.0 audio + 0.5 trans
  assert.equal(timeline[1].startSec, 3.5);
  assert.equal(timeline[1].endSec, 6.0); // 3.5 + 2.0 + 0.5
  assert.equal(totalDurationSec, 6.0);
});

test('TC-M05: Subtitle generator outputs synchronized SRT and WebVTT', () => {
  const narrations = [
    { slideId: 's1', slideIndex: 0, notesRaw: 'Slide 1 Notes', narrationScript: '欢迎进入系统演示。', isSilent: false },
  ];
  const timeline = [
    { slideId: 's1', slideIndex: 0, startSec: 0, endSec: 3.5, audioDurationSec: 3.0, transitionDurationSec: 0.5, totalDurationSec: 3.5 },
  ];

  const { srtContent, vttContent, entries } = generateSubtitles(narrations, timeline);
  assert.equal(entries.length, 1);
  assert.ok(srtContent.includes('00:00:00,000 --> 00:00:03,000'));
  assert.ok(srtContent.includes('欢迎进入系统演示。'));
  assert.ok(vttContent.startsWith('WEBVTT'));
  assert.ok(vttContent.includes('00:00:00.000 --> 00:00:03.000'));
});

test('TC-M06: End-to-end Media Pipeline synthesizes audio, builds MP4, and verifies media QA', { skip: process.platform !== 'win32' }, async () => {
  const testDir = mkdtempSync(join(tmpdir(), 'presentationos-media-native-'));

  const slide1Img = resolve(testDir, 'slide-1.png');
  const slide2Img = resolve(testDir, 'slide-2.png');
  const outMp4 = resolve(testDir, 'presentation.mp4');

  try {
    // Generate 2 test 720p frames using ffmpeg lavfi
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:d=1', '-frames:v', '1', '-update', '1', slide1Img], { stdio: 'pipe' });
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=darkgreen:s=1280x720:d=1', '-frames:v', '1', '-update', '1', slide2Img], { stdio: 'pipe' });

    const pipeline = new MediaPipeline(new WindowsSapiTtsProvider());

    const result = await pipeline.processDeck(
      [
        {
          id: 'slide-1',
          index: 0,
          notes: '尊敬的各位嘉宾，欢迎参加2026年年度产品发布会。',
          imagePath: slide1Img,
        },
        {
          id: 'slide-2',
          index: 1,
          notes: '本季度核心业务增长达到150%，服务全球超过500家企业客户。',
          imagePath: slide2Img,
        },
      ],
      outMp4,
      // Hosted Windows runners do not promise a particular optional voice pack.
      // Leaving the voice unset still exercises real SAPI synthesis while using
      // the runner's installed default voice.
      { workDir: testDir }
    );

    assert.equal(result.ok, true, `Pipeline failed: ${JSON.stringify(result.qa.errors)}`);
    assert.ok(existsSync(result.mp4Path), 'MP4 exists');
    assert.ok(existsSync(result.srtPath), 'SRT exists');
    assert.ok(existsSync(result.vttPath), 'VTT exists');

    // Media QA checks
    assert.equal(result.qa.videoStreamValid, true, 'H.264 video stream valid');
    assert.equal(result.qa.audioStreamValid, true, 'AAC audio stream valid');
    assert.equal(result.qa.syncPassed, true, 'Audio-visual sync within tolerance');
    assert.ok(result.totalDurationSec > 3.0, 'Valid total duration');
  } finally {
    if (existsSync(testDir)) {
      assert.ok(testDir.startsWith(join(tmpdir(), 'presentationos-media-native-')));
      rmSync(testDir, { recursive: true, force: true });
    }
  }
});
