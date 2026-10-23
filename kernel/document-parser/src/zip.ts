// Zero-dependency PKZIP reader using node:zlib
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  filename: string;
  data: Buffer;
  uncompressedSize: number;
}

export function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      // Local file header
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);
      const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

      if (dataOffset + compressedSize <= buffer.length) {
        const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
        let decompressedData: Buffer;

        if (compressionMethod === 0) {
          // Stored (no compression)
          decompressedData = Buffer.from(compressedData);
        } else if (compressionMethod === 8) {
          // Deflated
          try {
            decompressedData = inflateRawSync(compressedData);
          } catch {
            decompressedData = Buffer.alloc(0);
          }
        } else {
          decompressedData = Buffer.alloc(0);
        }

        if (uncompressedSize === 0 || decompressedData.length > 0) {
          entries.set(fileName, decompressedData);
        }
      }

      offset = dataOffset + compressedSize;
    } else if (signature === 0x02014b50 || signature === 0x06054b50) {
      // Central directory or End of Central Directory
      break;
    } else {
      offset += 1;
    }
  }

  return entries;
}
