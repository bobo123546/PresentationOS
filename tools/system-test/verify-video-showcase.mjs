// Run explicitly on Windows with installed SAPI/FFmpeg. Never replaces old evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fileEvidence = path => ({ path, bytes: statSync(path).size, sha256: sha256(readFileSync(path)) });
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

export function parseShowcaseSubtitles(content, format = 'srt') {
  let text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (format === 'vtt') {
    assert.match(text, /^WEBVTT\n/, 'Missing WebVTT header');
    text = text.replace(/^WEBVTT\s*\n/, '').trim();
  } else assert.equal(format, 'srt', 'Unknown subtitle format');
  const stamp = value => {
    const match = /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value);
    assert.ok(match, `Malformed subtitle timestamp: ${value}`);
    return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  };
  return text ? text.split(/\n\s*\n/).map((block, index) => {
    const lines = block.split('\n');
    assert.equal(Number(lines.shift()), index + 1, 'Subtitle indices must be consecutive');
    const timing = /^(.+) --> (.+)$/.exec(lines.shift() ?? '');
    assert.ok(timing, 'Missing subtitle timing');
    return { index: index + 1, startMs: stamp(timing[1]), endMs: stamp(timing[2]), text: lines.join('\n') };
  }) : [];
}

/** Compare serialized cues with the complete, measured sentence timeline. */
export function verifyShowcaseCues({ narrations, timeline, entries, totalDurationSec }) {
  assert.ok(Number.isFinite(totalDurationSec) && totalDurationSec > 0);
  assert.equal(narrations.length, timeline.length);
  assert.equal(new Set(timeline.map(page => page.slideId)).size, timeline.length);
  const expected = [];
  let previousEnd = 0;
  for (let i = 0; i < timeline.length; i++) {
    const page = timeline[i], narration = narrations[i];
    assert.equal(page.slideId, narration.slideId, 'Narration/page identity mismatch');
    assert.equal(page.slideIndex, narration.slideIndex);
    assert.ok(Math.abs(page.startSec - previousEnd) < 1e-6, 'Discontinuous page timeline');
    assert.ok(page.endSec > page.startSec && page.endSec <= totalDurationSec + 1e-6);
    assert.ok(page.audioDurationSec > 0 && page.audioDurationSec <= page.endSec - page.startSec + 1e-6);
    let audioEnd = 0;
    const cues = page.narrationCues ?? [];
    assert.equal(cues.map(cue => cue.text).join(''), narration.narrationScript, 'Subtitle text changed');
    for (const cue of cues) {
      assert.ok(Math.abs(cue.startSec - audioEnd) < 1e-6 && cue.endSec > cue.startSec, 'Invalid sentence boundary');
      assert.ok(cue.endSec <= page.audioDurationSec + 1e-6, 'Sentence exceeds measured speech');
      expected.push({ index: expected.length + 1, startMs: Math.round((page.startSec + cue.startSec) * 1000), endMs: Math.round((page.startSec + cue.endSec) * 1000), text: cue.text });
      audioEnd = cue.endSec;
    }
    assert.ok(Math.abs(audioEnd - page.audioDurationSec) < 1e-6, 'Sentences must cover the actual speech');
    previousEnd = page.endSec;
  }
  assert.ok(Math.abs(previousEnd - totalDurationSec) < 1e-6, 'Page timeline end mismatch');
  let lastEnd = 0;
  for (const entry of entries) {
    assert.ok(Number.isSafeInteger(entry.startMs) && Number.isSafeInteger(entry.endMs));
    assert.ok(entry.startMs >= lastEnd && entry.endMs > entry.startMs, 'Overlapping or empty subtitle');
    assert.ok(entry.endMs <= Math.round(totalDurationSec * 1000), 'Subtitle outside the video');
    lastEnd = entry.endMs;
  }
  assert.deepEqual(entries, expected, 'Serialized subtitles differ from measured sentence boundaries');
  return { cueCount: entries.length, lastCueEndSec: lastEnd / 1000, sentenceAudioBoundaries: 'PASS', textPreservation: 'PASS' };
}

export function comparePcmAtOffset(source, decoded, startSample, marginSamples = 512) {
  assert.equal(source.length % 2, 0); assert.equal(decoded.length % 2, 0);
  assert.ok(Number.isSafeInteger(startSample) && startSample >= 0);
  const count = source.length / 2;
  assert.ok(count > marginSamples * 2 && (startSample + count) * 2 <= decoded.length, 'Insufficient decoded audio');
  let dot = 0, sourcePower = 0, decodedPower = 0, peak = 0;
  for (let i = marginSamples; i < count - marginSamples; i++) {
    const a = source.readInt16LE(i * 2), b = decoded.readInt16LE((startSample + i) * 2);
    dot += a * b; sourcePower += a * a; decodedPower += b * b; peak = Math.max(peak, Math.abs(b));
  }
  assert.ok(sourcePower > 0 && decodedPower > 0, 'Speech must contain nonzero samples');
  return { correlation: dot / Math.sqrt(sourcePower * decodedPower), decodedPeak: peak, startSample, sampleCount: count, marginSamples };
}

function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Evidence must not traverse symlinks: ${path}`);
    return entry.isDirectory() ? inventory(path) : entry.isFile() ? [fileEvidence(path)] : [];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function overlaps(a, b) {
  const contained = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
  return contained(a, b) || contained(b, a);
}

export async function runShowcaseVerification(outputArgument, imagesArgument, legacyArgument) {
  assert.equal(process.platform, 'win32', 'Real Windows SAPI is required');
  const out = resolve(outputArgument), images = resolve(imagesArgument), legacy = resolve(legacyArgument);
  assert.ok(!overlaps(out, images) && !overlaps(out, legacy) && !overlaps(out, repository), 'Output must be isolated from repository and original inputs');
  assert.ok(!existsSync(out), 'Refusing to replace an existing verification directory');
  const legacyScript = join(repository, 'tools/system-test/compile-video-showcase.mjs');
  const legacyBefore = inventory(legacy);
  const historicalScript = existsSync(legacyScript) ? fileEvidence(legacyScript) : null;
  mkdirSync(out);
  const commands = [], sapiCalls = [];
  let commandIndex = 0;
  const run = (executable, args, options = {}) => {
    const number = ++commandIndex, prefix = `command-${String(number).padStart(3, '0')}`;
    const command = { number, executable, arguments: args, cwd: options.cwd ?? repository, startedAt: new Date().toISOString() };
    commands.push(command);
    try {
      const stdout = execFileSync(executable, args, { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
      command.exitCode = 0;
      writeFileSync(join(out, `${prefix}.stdout.txt`), stdout ?? '', { flag: 'wx' });
      command.stdout = fileEvidence(join(out, `${prefix}.stdout.txt`));
      return stdout;
    } catch (error) {
      command.exitCode = error.status ?? null; command.error = error.message;
      for (const key of ['stdout', 'stderr']) if (error[key]) { const path = join(out, `${prefix}.${key}.txt`); writeFileSync(path, error[key], { flag: 'wx' }); command[key] = fileEvidence(path); }
      throw error;
    } finally { command.completedAt = new Date().toISOString(); json(join(out, `${prefix}.json`), command); }
  };
  try {
    const media = await import('../../kernel/media-pipeline/dist/index.js');
    const powershell = media.windowsPowerShellPath();
    const where = name => run('where.exe', [name]).trim().split(/\r?\n/)[0];
    const ffmpeg = where('ffmpeg'), ffprobe = where('ffprobe');
    const head = run('git', ['rev-parse', 'HEAD']).trim();
    const worktree = run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
    const diff = run('git', ['diff', '--binary', 'HEAD']);
    const sources = ['src/pipeline.ts', 'src/tts-provider.ts', 'src/ffmpeg-runner.ts', 'src/timeline.ts', 'src/subtitle.ts', 'src/normalizer.ts', 'dist/pipeline.js', 'dist/tts-provider.js', 'dist/ffmpeg-runner.js'].map(p => fileEvidence(join(repository, 'kernel/media-pipeline', p)));
    const requestedVoice = 'Microsoft Huihui Desktop';
    const voiceScript = `[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)\n$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName System.Speech\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\ntry { $s.SelectVoice($env:PRES_VERIFY_VOICE); [ordered]@{powerShellVersion=$PSVersionTable.PSVersion.ToString(); selectedVoice=[ordered]@{name=$s.Voice.Name; culture=$s.Voice.Culture.Name; gender=$s.Voice.Gender.ToString(); age=$s.Voice.Age.ToString()}; installedVoices=@($s.GetInstalledVoices() | ForEach-Object { [ordered]@{name=$_.VoiceInfo.Name; culture=$_.VoiceInfo.Culture.Name; enabled=$_.Enabled} })} | ConvertTo-Json -Depth 6 -Compress } finally { $s.Dispose() }`;
    const voice = JSON.parse(run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(voiceScript, 'utf16le').toString('base64')], { env: { ...process.env, PRES_VERIFY_VOICE: requestedVoice } }));
    assert.equal(voice.selectedVoice.name, requestedVoice);
    const runtime = { node: process.version, nodeExecutable: fileEvidence(process.execPath), ffmpeg: fileEvidence(ffmpeg), ffprobe: fileEvidence(ffprobe), powershell: fileEvidence(powershell), ffmpegVersion: run(ffmpeg, ['-version']).split(/\r?\n/)[0], ffprobeVersion: run(ffprobe, ['-version']).split(/\r?\n/)[0], voice };
    const historicalText = historicalScript ? readFileSync(legacyScript, 'utf8') : '';
    const historical = { originalDirectory: legacy, files: legacyBefore, generator: historicalScript, notes: [...historicalText.matchAll(/notes:\s*'([^']*)'/g)].map(match => match[1]), scope: 'Historical input and failing artifacts only; not evidence about the current source', srt: readFileSync(join(legacy, 'presentation_multimodal_showcase.srt'), 'utf8') };
    historical.probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(legacy, 'presentation_multimodal_showcase.mp4')]));
    json(join(out, 'historical-evidence.json'), historical);
    const notes = [
      '这是合成测试样片，画面来自历史演示页面，不代表当前完成情况。接下来检查真实语音、字幕与页面切换。',
      '这是历史示例中的战略分层页面，用于检查第二页画面对应关系。页面中的目标表述不作为已实现功能的证明。',
      '这是历史示例中的技术分层页面，用于检查第三页画面与片尾。本测试的示例数值为-12.5，10,000和5%，不是真实业绩。音画时间检查不代替事实审查或人工试听。',
    ];
    const slides = notes.map((text, index) => ({ id: `historical-preview-${index + 1}`, index, notes: text, imagePath: join(images, `slide_${index + 1}.png`) }));
    const narrations = slides.map(s => ({ slideId: s.id, slideIndex: s.index, notesRaw: s.notes, ...media.normalizeNarrationScript(s.notes, 'zh-CN') }));
    const inputs = slides.map(s => ({ ...s, image: fileEvidence(s.imagePath) }));
    const options = { fps: 25, transitionSec: 0, narrationLanguage: 'zh-CN', voice: requestedVoice, workDir: join(out, 'work'), cacheDir: join(out, 'fresh-speech-cache'), resolution: { width: 1920, height: 1080 } };
    const script = fileEvidence(fileURLToPath(import.meta.url));
    json(join(out, 'invocation.json'), { startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], repository, head, worktree, diffSha256: sha256(diff), script, sources, runtime, inputs, narrations, options, voiceEvidenceScope: 'Preflight selected installed voice; every real synthesis explicitly requests this same name and fails on SelectVoice error. No inferred default voice.' });
    const realProvider = new media.WindowsSapiTtsProvider();
    const provider = { name: realProvider.name, async synthesize(text, path, requested) {
      const call = { provider: realProvider.name, text, path, requested, startedAt: new Date().toISOString() }; sapiCalls.push(call);
      try { const value = await realProvider.synthesize(text, path, requested); call.exitCode = 0; call.wav = fileEvidence(path); call.wavInfo = media.readWavInfo(path); return value; }
      catch (error) { call.exitCode = null; call.error = error.message; throw error; }
      finally { call.completedAt = new Date().toISOString(); json(join(out, `sapi-call-${sapiCalls.length}.json`), call); }
    } };
    const pipelineInvocation = { method: 'MediaPipeline.processDeck', startedAt: new Date().toISOString(), provider: provider.name };
    const result = await new media.MediaPipeline(provider).processDeck(slides, join(out, 'presentation_multimodal_showcase.mp4'), options);
    pipelineInvocation.completedAt = new Date().toISOString(); pipelineInvocation.exitCode = result.ok ? 0 : 1;
    json(join(out, 'pipeline-result.json'), { invocation: pipelineInvocation, ...result });
    assert.equal(result.ok, true); assert.equal(result.qa.semanticAlignmentVerified, false);
    assert.ok(result.audioSegments.every(segment => !segment.cached), 'Fresh real speech is required');
    const srt = parseShowcaseSubtitles(readFileSync(result.srtPath, 'utf8'));
    const vtt = parseShowcaseSubtitles(readFileSync(result.vttPath, 'utf8'), 'vtt');
    assert.deepEqual(srt, vtt);
    const cues = verifyShowcaseCues({ narrations, timeline: result.timeline, entries: srt, totalDurationSec: result.totalDurationSec });
    const flatCues = result.timeline.flatMap(page => page.narrationCues.map(cue => ({ ...cue, slideId: page.slideId, absoluteStartSec: page.startSec + cue.startSec })));
    assert.equal(flatCues.length, sapiCalls.length);
    flatCues.forEach((cue, index) => { assert.equal(cue.text, sapiCalls[index].text); assert.ok(Math.abs(cue.endSec - cue.startSec - sapiCalls[index].wavInfo.durationSec) < 1e-6); });
    const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', result.mp4Path]));
    const video = probe.streams.find(stream => stream.codec_type === 'video'), audio = probe.streams.find(stream => stream.codec_type === 'audio');
    assert.equal(Number(video.nb_frames), Math.round(result.totalDurationSec * options.fps));
    assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) <= 0.040001);
    assert.ok(Math.abs(Number(video.start_time) - Number(audio.start_time)) <= 0.040001);
    const decodedPath = join(out, 'decoded-audio.pcm');
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', result.mp4Path, '-vn', '-ar', '48000', '-ac', '1', '-f', 's16le', decodedPath]);
    const decoded = readFileSync(decodedPath), audioChecks = [];
    for (let i = 0; i < sapiCalls.length; i++) {
      const path = join(out, `sentence-${i + 1}-48000.pcm`);
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', sapiCalls[i].path, '-ar', '48000', '-ac', '1', '-f', 's16le', path]);
      const check = comparePcmAtOffset(readFileSync(path), decoded, Math.round(flatCues[i].absoluteStartSec * 48000));
      assert.ok(check.correlation > 0.95, `Sentence audio is missing/drifted: ${i + 1} (${check.correlation})`);
      audioChecks.push({ sentence: i + 1, slideId: flatCues[i].slideId, ...check, expectedPcm: fileEvidence(path) });
    }
    const frameCount = Number(video.nb_frames), selectedFrames = new Set([0, frameCount - 1]);
    for (const page of result.timeline) {
      const first = Math.round(page.startSec * options.fps), last = Math.round(page.endSec * options.fps) - 1;
      [first, Math.min(first + 1, last), Math.floor((first + last) / 2), last].forEach(n => selectedFrames.add(n));
    }
    const frames = [...selectedFrames].sort((a, b) => a - b);
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', result.mp4Path, '-vf', `select='${frames.map(n => `eq(n,${n})`).join('+')}'`, '-fps_mode', 'vfr', '-update', '0', join(out, 'frame-%03d.png')]);
    const imageChecks = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], pageIndex = result.timeline.findIndex(page => frame >= Math.round(page.startSec * options.fps) && frame < Math.round(page.endSec * options.fps));
      assert.ok(pageIndex >= 0);
      const path = join(out, `frame-${String(i + 1).padStart(3, '0')}.png`), stats = join(out, `frame-${i + 1}-psnr.txt`);
      // A stats file avoids treating FFmpeg's successful exit as proof of image identity.
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', path, '-i', slides[pageIndex].imagePath, '-lavfi', `psnr=stats_file='${stats.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:')}'`, '-frames:v', '1', '-f', 'null', '-']);
      const match = /psnr_avg:([\d.]+|inf)/.exec(readFileSync(stats, 'utf8'));
      assert.ok(match, 'Missing PSNR measurement');
      const psnrDb = match[1] === 'inf' ? Infinity : Number(match[1]);
      assert.ok(psnrDb > 35, `Wrong/degraded image at frame ${frame}: ${psnrDb}dB`);
      imageChecks.push({ frame, timeSec: frame / options.fps, slideId: slides[pageIndex].id, psnrDb: Number.isFinite(psnrDb) ? psnrDb : 'Infinity', source: inputs[pageIndex].image, decodedFrame: fileEvidence(path), stats: fileEvidence(stats) });
    }
    assert.deepEqual(inventory(legacy), legacyBefore, 'Original video artifacts changed');
    if (historicalScript) assert.deepEqual(fileEvidence(legacyScript), historicalScript, 'User generator was modified');
    const acceptance = { status: 'PASS_SCOPED', completedAt: new Date().toISOString(), head, uncommittedSourceBoundByHashes: true, pipeline: result, probe, cues, sapiCalls, audioChecks, imageChecks, inputImagesUnchanged: inputs.every(input => fileEvidence(input.imagePath).sha256 === input.image.sha256), historicalArtifactsUnchanged: true, outputs: [result.mp4Path, result.srtPath, result.vttPath].map(fileEvidence), limitations: ['Historical preview text is retained as visual test input; claims printed in those images are not endorsed or validated.', 'Images checked at each page start, next frame, midpoint, page end, and final frame; not every decoded frame.', 'Audio correlation and measured sentence cues establish technical placement, not word-level alignment.', 'Perceptual listening and natural pronunciation: NOT_REVIEWED.', 'No claim of factual accuracy, product completeness, broadcast quality, hardware encoding, Native QA, packaged desktop QA, or clean-machine certification.'] };
    assert.equal(acceptance.inputImagesUnchanged, true);
    json(join(out, 'acceptance-result.json'), acceptance);
    json(join(out, 'commands.json'), commands);
    json(join(out, 'evidence-inventory.json'), inventory(out));
    console.log(JSON.stringify({ status: acceptance.status, out, head, durationSec: result.totalDurationSec, cues: cues.cueCount, realSapiCalls: sapiCalls.length, minimumSentenceCorrelation: Math.min(...audioChecks.map(check => check.correlation)), minimumSampledFramePsnrDb: Math.min(...imageChecks.map(check => Number(check.psnrDb))), outputs: acceptance.outputs }, null, 2));
    return acceptance;
  } catch (error) {
    json(join(out, 'failure.json'), { status: 'FAIL', message: error.message, stack: error.stack, at: new Date().toISOString(), commands, sapiCalls });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [out, images, legacy] = process.argv.slice(2);
  if (!out || !images || !legacy) { console.error('Usage: node tools/system-test/verify-video-showcase.mjs <new-output-directory> <existing-preview-directory> <existing-legacy-video-directory>'); process.exitCode = 2; }
  else runShowcaseVerification(out, images, legacy).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
