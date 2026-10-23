// TTS Provider Interface & Implementations (Windows SAPI & Standard PCM Fallback)
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';

export interface TtsOptions {
  voice?: string;
  speed?: number; // -10 to +10 in SAPI
}

export interface ITtsProvider {
  name: string;
  synthesize(text: string, outWavPath: string, options?: TtsOptions): Promise<{ durationSec: number }>;
}

/** Reads duration in seconds from standard 44-byte RIFF WAV header */
export function readWavDuration(filePath: string): number {
  const fd = openSync(filePath, 'r');
  const header = Buffer.alloc(44);
  readSync(fd, header, 0, 44, 0);
  closeSync(fd);

  const riff = header.toString('ascii', 0, 4);
  const wave = header.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Invalid WAV file header in ${filePath}`);
  }

  const sampleRate = header.readUInt32LE(24);
  const byteRate = header.readUInt32LE(28);
  const dataSize = header.readUInt32LE(40);

  if (byteRate <= 0) return 0;
  return Math.round((dataSize / byteRate) * 1000) / 1000;
}

/** Generates a standard 16-bit mono 22050Hz PCM WAV file of silent audio */
export function writeSilenceWav(outPath: string, durationSec: number): number {
  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = Math.floor(sampleRate * durationSec) * blockAlign;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const pcmData = Buffer.alloc(dataSize, 0);
  writeFileSync(outPath, Buffer.concat([header, pcmData]));
  return durationSec;
}

/**
 * Windows SAPI Native TTS Provider using PowerShell System.Speech.
 * Zero external download, zero network cost, runs completely offline on Windows.
 */
export class WindowsSapiTtsProvider implements ITtsProvider {
  name = 'windows-sapi';

  async synthesize(text: string, outWavPath: string, options: TtsOptions = {}): Promise<{ durationSec: number }> {
    if (!text || !text.trim()) {
      const dur = writeSilenceWav(outWavPath, 2.0);
      return { durationSec: dur };
    }

    const voice = options.voice || 'Microsoft Huihui Desktop';
    const rate = Math.max(-10, Math.min(10, options.speed ?? 0));

    // Escape text for PowerShell script string
    const sanitizedText = text.replace(/'/g, "''").replace(/[\r\n]+/g, ' ');
    const sanitizedPath = outWavPath.replace(/'/g, "''");

    const psScript = `
Add-Type -AssemblyName System.Speech;
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
try {
  $synth.SelectVoice('${voice}');
} catch {
  # Fallback to default voice if specific voice unavailable
}
$synth.Rate = ${rate};
$synth.SetOutputToWaveFile('${sanitizedPath}');
$synth.Speak('${sanitizedText}');
$synth.Dispose();
`;

    try {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        encoding: 'utf8',
        timeout: 15000,
      });

      if (!existsSync(outWavPath)) {
        throw new Error('TTS synthesis failed to generate audio output');
      }

      const durationSec = readWavDuration(outWavPath);
      return { durationSec };
    } catch (err) {
      // Fallback to silence WAV if SAPI fails
      const fallbackDuration = Math.max(2.0, Math.round((text.length / 5) * 10) / 10);
      writeSilenceWav(outWavPath, fallbackDuration);
      return { durationSec: fallbackDuration };
    }
  }
}
