import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShowcaseSubtitles, verifyShowcaseCues, comparePcmAtOffset } from '../../tools/system-test/verify-video-showcase.mjs';

function fixture() {
  return {
    narrations: [{ slideId: 'one', slideIndex: 0, narrationScript: '一。二。' }, { slideId: 'two', slideIndex: 1, narrationScript: '三。' }],
    timeline: [
      { slideId: 'one', slideIndex: 0, startSec: 0, endSec: 2.04, audioDurationSec: 2.01, narrationCues: [{ startSec: 0, endSec: 1.01, text: '一。' }, { startSec: 1.01, endSec: 2.01, text: '二。' }] },
      { slideId: 'two', slideIndex: 1, startSec: 2.04, endSec: 3.08, audioDurationSec: 1.03, narrationCues: [{ startSec: 0, endSec: 1.03, text: '三。' }] },
    ],
    entries: [{ index: 1, startMs: 0, endMs: 1010, text: '一。' }, { index: 2, startMs: 1010, endMs: 2010, text: '二。' }, { index: 3, startMs: 2040, endMs: 3070, text: '三。' }],
    totalDurationSec: 3.08,
  };
}

test('showcase validation matches serialized SRT/VTT to measured sentences across rounded page boundaries', () => {
  const data = fixture();
  const srt = '1\r\n00:00:00,000 --> 00:00:01,010\r\n一。\r\n\r\n2\r\n00:00:01,010 --> 00:00:02,010\r\n二。\r\n\r\n3\r\n00:00:02,040 --> 00:00:03,070\r\n三。\r\n';
  assert.deepEqual(parseShowcaseSubtitles(srt), data.entries);
  assert.deepEqual(parseShowcaseSubtitles(`WEBVTT\n\n${srt.replaceAll(',', '.')}`, 'vtt'), data.entries);
  assert.equal(verifyShowcaseCues(data).cueCount, 3);
});

test('showcase gate rejects historical 51-hour timestamps, omitted text and missing/reordered cues', () => {
  const overflow = fixture(); overflow.entries[2].endMs = 184459531;
  assert.throws(() => verifyShowcaseCues(overflow), /outside the video/);
  const changed = fixture(); changed.entries[1].text = '删去原文';
  assert.throws(() => verifyShowcaseCues(changed), /Serialized subtitles/);
  const missing = fixture(); missing.entries.splice(1, 1);
  assert.throws(() => verifyShowcaseCues(missing), /Serialized subtitles/);
  const reordered = fixture(); reordered.entries.reverse();
  assert.throws(() => verifyShowcaseCues(reordered), /Overlapping/);
});

test('showcase gate rejects speech extending past its page and fabricated sentence durations', () => {
  const escaped = fixture(); escaped.timeline[0].audioDurationSec = 3;
  assert.throws(() => verifyShowcaseCues(escaped));
  const shortened = fixture(); shortened.timeline[0].narrationCues[1].endSec = 1.9;
  assert.throws(() => verifyShowcaseCues(shortened), /cover the actual speech/);
  const gap = fixture(); gap.timeline[1].startSec += 0.04;
  assert.throws(() => verifyShowcaseCues(gap), /Discontinuous/);
});

test('decoded speech comparison detects wrong placement and rejects silence as speech proof', () => {
  const source = Buffer.alloc(6000), decoded = Buffer.alloc(8000);
  let seed = 31;
  for (let i = 0; i < source.length / 2; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; source.writeInt16LE((seed % 20000) - 10000, i * 2); }
  source.copy(decoded, 400);
  assert.ok(comparePcmAtOffset(source, decoded, 200).correlation > 0.999999);
  assert.ok(Math.abs(comparePcmAtOffset(source, decoded, 100).correlation) < 0.1);
  assert.throws(() => comparePcmAtOffset(Buffer.alloc(6000), decoded, 200), /nonzero/);
  assert.throws(() => comparePcmAtOffset(source, decoded, 2000), /Insufficient/);
});
