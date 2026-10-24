import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MediaPipeline, normalizeNarrationScript, writeSilenceWav, windowsPowerShellPath } from '../src/index.js';

test('SAPI resolves the Windows inbox PowerShell executable independently of PATH helper names', () => {
  assert.equal(windowsPowerShellPath('C:\\Windows'), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(windowsPowerShellPath('D:/Windows'), 'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  for (const invalid of ['', 'Windows', 'C:Windows']) assert.throws(() => windowsPowerShellPath(invalid), /absolute/);
});

test('explicit English speaks unary negatives and percentages without injecting Chinese or changing numeric values', () => {
  const result = normalizeNarrationScript('Net change is -12.5, audience 10,000, ratio 5%, error −0.25%.', 'en-US').narrationScript;
  assert.equal(result, 'Net change is minus 12.5, audience 10,000, ratio 5 percent, error minus 0.25 percent.');
  assert.equal(/\p{Script=Han}/u.test(result), false);
});

test('English normalization retains subtraction, ranges, exponent notation, identifiers and malformed numeric tokens', () => {
  const input = 'Ranges 5-10 and 5−10; subtraction 15-3; id-12 a_b C#; scale 1e-5; token_5% model-5%; invalid 1,23%.';
  assert.equal(normalizeNarrationScript(input, 'en-US').narrationScript, input);
  assert.equal(normalizeNarrationScript('Grouped 10,000.25% and 0.05%.', 'en-US').narrationScript, 'Grouped 10,000.25 percent and 0.05 percent.');
});

test('legacy direct normalization stays Chinese while verbatim preserves other languages and numeric punctuation', () => {
  const chinese = normalizeNarrationScript('净额-12.5万元，服务10,000家，比例5%。').narrationScript;
  assert.equal(chinese, '净额负12.5万元，服务10000家，比例百分之五。');
  const french = 'Bilan -12.5; audience 10,000; taux 5%.';
  assert.equal(normalizeNarrationScript(french, 'verbatim').narrationScript, french);
  assert.equal(normalizeNarrationScript('**Bilan** `id_5`', 'verbatim').narrationScript, 'Bilan id_5');
});

test('unknown explicit language is rejected before provider calls, image access or output creation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-language-invalid-'));
  let calls = 0;
  try {
    const pipeline = new MediaPipeline({ name: 'must-not-run', async synthesize() { calls++; throw Error('unexpected synthesis'); } });
    await assert.rejects(pipeline.processDeck([{ id: 's', index: 0, notes: 'hello' }], join(dir, 'out.mp4'), { narrationLanguage: 'fr-FR' as any }), /narrationLanguage/);
    assert.equal(calls, 0); assert.equal(existsSync(join(dir, 'out.mp4')), false);
    assert.throws(() => normalizeNarrationScript('hello', 'fr-FR' as any), /Unsupported/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pipeline defaults preserve non-Han notes and records language routing without changing the chosen voice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-language-routing-'));
  try {
    const image = join(dir, 'slide.png');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180', '-frames:v', '1', '-update', '1', image], { stdio: 'pipe', windowsHide: true });
    const calls: Array<{ text: string; voice?: string }> = [];
    // A deterministic provider isolates routing/text assertions. Actual SAPI
    // acceptance is run independently with installed Chinese and English voices.
    const provider = { name: 'deterministic-language-routing-test', async synthesize(text: string, path: string, options?: { voice?: string }) {
      calls.push({ text, voice: options?.voice }); return { durationSec: writeSilenceWav(path, 0.3) };
    } };
    const english = 'Net -12.5, audience 10,000, ratio 5%.';
    const result = await new MediaPipeline(provider).processDeck([
      { id: 'en', index: 0, notes: english, imagePath: image }, { id: 'zh', index: 1, notes: '净额-12.5万元，比例5%。', imagePath: image },
    ], join(dir, 'default.mp4'), { voice: 'unchanged-requested-voice', workDir: join(dir, 'default-work'), resolution: { width: 320, height: 180 } });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map(call => call.text), [english, '净额负12.5万元，比例百分之五。']);
    assert.ok(calls.every(call => call.voice === 'unchanged-requested-voice'));
    assert.equal(result.narrationProfile?.automaticVoiceSelection, false);
    assert.deepEqual(result.narrationProfile?.slides, [{ slideId: 'en', language: 'verbatim', selection: 'verbatim-fallback' }, { slideId: 'zh', language: 'zh-CN', selection: 'han-detection' }]);
    assert.ok(readFileSync(result.srtPath, 'utf8').includes(english));
    const explicit = await new MediaPipeline(provider).processDeck([{ id: 'explicit-en', index: 0, notes: english, imagePath: image }], join(dir, 'explicit.mp4'), {
      voice: 'unchanged-requested-voice', narrationLanguage: 'en-US', workDir: join(dir, 'explicit-work'), resolution: { width: 320, height: 180 },
    });
    assert.equal(calls.at(-1)?.text, 'Net minus 12.5, audience 10,000, ratio 5 percent.');
    assert.deepEqual(explicit.narrationProfile?.slides, [{ slideId: 'explicit-en', language: 'en-US', selection: 'explicit' }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
