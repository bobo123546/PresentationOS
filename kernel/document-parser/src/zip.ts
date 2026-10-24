// Bounded, in-memory PKZIP reader. Central sizes support streamed data descriptors.
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry { filename: string; data: Buffer; uncompressedSize: number; }
const MAX_ENTRY_BYTES = 64 * 1024 * 1024, MAX_TOTAL_BYTES = 256 * 1024 * 1024, MAX_ENTRIES = 10_000;
export interface ZipExtractionLimits { maxEntryBytes?: number; maxTotalBytes?: number; maxEntries?: number; }
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function requireRange(buffer: Buffer, offset: number, size: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > buffer.length) throw new Error('Invalid ZIP: truncated archive');
}
function filename(bytes: Buffer): string {
  let name: string;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Unsupported ZIP filename encoding; UTF-8 is required'); }
  if (!name || name.includes('\u0000') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid ZIP entry path');
  return name;
}
export function extractZipEntries(buffer: Buffer, limits: ZipExtractionLimits = {}): Map<string, Buffer> {
  // Consumers may tighten the shared bounds, never disable them. Check before
  // allocating or inflating: a declared size and a lying deflate stream both fail.
  const bounded = (value: number | undefined, maximum: number) => {
    if (value === undefined) return maximum;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('Invalid ZIP extraction limit');
    return value;
  };
  const maxEntry = bounded(limits.maxEntryBytes, MAX_ENTRY_BYTES);
  const maxTotal = bounded(limits.maxTotalBytes, MAX_TOTAL_BYTES);
  const maxEntries = bounded(limits.maxEntries, MAX_ENTRIES);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Invalid ZIP: end of central directory not found');
  const count = buffer.readUInt16LE(end + 10), directorySize = buffer.readUInt32LE(end + 12), directoryOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count) throw new Error('Unsupported ZIP: split archives are disabled');
  if (count === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) throw new Error('Unsupported ZIP64 archive');
  if (count > maxEntries || directoryOffset + directorySize > end) throw new Error('Invalid ZIP directory bounds or entry limit');
  requireRange(buffer, directoryOffset, directorySize);
  const entries = new Map<string, Buffer>(); let offset = directoryOffset, total = 0;
  for (let index = 0; index < count; index++) {
    requireRange(buffer, offset, 46);
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry');
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10), crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24), nameLength = buffer.readUInt16LE(offset + 28);
    const recordSize = 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    requireRange(buffer, offset, recordSize);
    if (offset + recordSize > directoryOffset + directorySize) throw new Error('Invalid ZIP central directory length');
    const name = filename(buffer.subarray(offset + 46, offset + 46 + nameLength)); offset += recordSize;
    if (entries.has(name)) throw new Error(`Invalid ZIP duplicate entry: ${name}`);
    if (flags & 1) throw new Error('Unsupported encrypted ZIP entry');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}`);
    if (size === 0xffffffff || compressedSize === 0xffffffff || local === 0xffffffff || size > maxEntry || (total += size) > maxTotal) throw new Error('ZIP decompression limit exceeded');
    requireRange(buffer, local, 30);
    if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 8) !== method || buffer.readUInt16LE(local + 6) !== flags) throw new Error('Invalid ZIP local header');
    const localNameLength = buffer.readUInt16LE(local + 26), start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    requireRange(buffer, local + 30, localNameLength);
    if (filename(buffer.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error('Invalid ZIP local entry name');
    requireRange(buffer, start, compressedSize);
    if (start + compressedSize > directoryOffset) throw new Error('Invalid ZIP entry overlaps directory');
    const compressed = buffer.subarray(start, start + compressedSize);
    let data: Buffer;
    try { data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.max(1, Math.min(size, maxEntry)) }); }
    catch { throw new Error(`Invalid ZIP compressed data: ${name}`); }
    if (data.length !== size || crc32(data) !== crc) throw new Error(`Invalid ZIP entry size or CRC: ${name}`);
    entries.set(name, data);
  }
  if (offset !== directoryOffset + directorySize) throw new Error('Invalid ZIP central directory size');
  return entries;
}
