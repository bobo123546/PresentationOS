import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, openSync, readSync, closeSync, fstatSync, rmSync } from 'node:fs';
import { win32 } from 'node:path';

export interface TtsOptions { voice?: string; speed?: number; }
export interface ITtsProvider {
  name: string;
  synthesize(text: string, outWavPath: string, options?: TtsOptions): Promise<{ durationSec: number }>;
}
export interface WavInfo {
  audioFormat: number; channels: number; sampleRate: number; byteRate: number;
  blockAlign: number; bitsPerSample: number; dataOffset: number; dataSize: number; durationSec: number;
}

/** Windows PowerShell 5.1 supplies System.Speech; never resolve a PATH helper. */
export function windowsPowerShellPath(systemRoot = process.env.SystemRoot): string {
  if (!systemRoot || !win32.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot must be an absolute path for SAPI synthesis');
  return win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Walk RIFF chunks, including WAVEFORMATEX (SAPI), metadata and odd-byte padding. */
export function readWavInfo(filePath: string): WavInfo {
  const fd = openSync(filePath, 'r');
  try {
    const size = fstatSync(fd).size;
    const head = Buffer.alloc(12);
    if (readSync(fd, head, 0, 12, 0) !== 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Invalid RIFF/WAVE header: ${filePath}`);
    const end = head.readUInt32LE(4) + 8;
    if (end > size || end < 12) throw new Error('Truncated or invalid RIFF size');
    let fmt: Omit<WavInfo, 'dataOffset' | 'dataSize' | 'durationSec'> | undefined;
    let data: { dataOffset: number; dataSize: number } | undefined;
    let offset = 12;
    while (offset < end) {
      const chunk = Buffer.alloc(8);
      if (offset + 8 > end || readSync(fd, chunk, 0, 8, offset) !== 8) throw new Error('Truncated RIFF chunk header');
      const id = chunk.toString('ascii', 0, 4), length = chunk.readUInt32LE(4), payload = offset + 8;
      const next = payload + length + (length % 2);
      if (next > end) throw new Error(`Truncated RIFF ${id} chunk`);
      if (id === 'fmt ') {
        if (fmt || length < 16) throw new Error('Duplicate or undersized WAV format chunk');
        const bytes = Buffer.alloc(16);
        if (readSync(fd, bytes, 0, 16, payload) !== 16) throw new Error('Truncated WAV format');
        fmt = { audioFormat: bytes.readUInt16LE(0), channels: bytes.readUInt16LE(2), sampleRate: bytes.readUInt32LE(4), byteRate: bytes.readUInt32LE(8), blockAlign: bytes.readUInt16LE(12), bitsPerSample: bytes.readUInt16LE(14) };
      } else if (id === 'data') {
        if (data) throw new Error('Multiple WAV data chunks are not supported');
        data = { dataOffset: payload, dataSize: length };
      }
      offset = next;
    }
    if (!fmt || !data || data.dataSize === 0) throw new Error('WAV requires a nonempty format/data chunk');
    if (![1, 3].includes(fmt.audioFormat)) throw new Error(`Unsupported WAV encoding ${fmt.audioFormat}; PCM/IEEE float required`);
    if (fmt.channels < 1 || fmt.sampleRate < 1 || fmt.bitsPerSample < 8 || fmt.bitsPerSample % 8 !== 0 || fmt.blockAlign !== fmt.channels * fmt.bitsPerSample / 8 || fmt.byteRate !== fmt.sampleRate * fmt.blockAlign || data.dataSize % fmt.blockAlign !== 0) throw new Error('Inconsistent WAV sample format or truncated sample data');
    return { ...fmt, ...data, durationSec: data.dataSize / fmt.byteRate };
  } finally { closeSync(fd); }
}
export function readWavDuration(filePath: string): number { return readWavInfo(filePath).durationSec; }

/** Silence is intentional only for an empty-note slide, never a failed TTS request. */
export function writeSilenceWav(outPath: string, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 3600) throw new Error('Invalid silence duration');
  const sampleRate = 22050, dataSize = Math.round(sampleRate * durationSec) * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataSize, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(dataSize, 40);
  writeFileSync(outPath, Buffer.concat([header, Buffer.alloc(dataSize)]), { flag: 'wx' });
  return dataSize / (sampleRate * 2);
}

export class WindowsSapiTtsProvider implements ITtsProvider {
  name = 'windows-sapi';
  async synthesize(text: string, outWavPath: string, options: TtsOptions = {}): Promise<{ durationSec: number }> {
    if (existsSync(outWavPath)) throw new Error(`Refusing to overwrite TTS output: ${outWavPath}`);
    if (!text.trim()) return { durationSec: writeSilenceWav(outWavPath, 2) };
    if (process.platform !== 'win32') throw new Error('Windows SAPI is available only on Windows');
    const rate = options.speed ?? 0;
    if (!Number.isInteger(rate) || rate < -10 || rate > 10) throw new Error('SAPI speed must be an integer from -10 to 10');
    // Values travel as child environment data, never as PowerShell source.
    const script = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($env:PRES_TTS_VOICE) { $synth.SelectVoice($env:PRES_TTS_VOICE) }
  $synth.Rate=[int]$env:PRES_TTS_RATE
  $synth.SetOutputToWaveFile($env:PRES_TTS_OUTPUT)
  $synth.Speak($env:PRES_TTS_TEXT)
} finally { $synth.Dispose() }
`;
    try {
      execFileSync(windowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        encoding: 'utf8', timeout: 120000, windowsHide: true,
        env: { ...process.env, PRES_TTS_TEXT: text, PRES_TTS_OUTPUT: outWavPath, PRES_TTS_VOICE: options.voice ?? '', PRES_TTS_RATE: String(rate) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { durationSec: readWavDuration(outWavPath) };
    } catch {
      if (existsSync(outWavPath)) rmSync(outWavPath);
      throw new Error('Windows SAPI synthesis failed; no speech output was accepted. Check the installed voice and speech runtime.');
    }
  }
}
