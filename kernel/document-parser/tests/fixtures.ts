/** Minimal stored ZIP fixture; complete headers also exercise real OOXML archives. */
export function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function officeZip(files: Record<string, string | Buffer>, descriptor = false): Buffer {
  const locals: Buffer[] = [], directories: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name), content = Buffer.isBuffer(text) ? text : Buffer.from(text);
    const local = Buffer.alloc(30 + filename.length + content.length + (descriptor ? 16 : 0));
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 8 : 0, 6);
    local.writeUInt32LE(descriptor ? 0 : crc32(content), 14);
    local.writeUInt32LE(descriptor ? 0 : content.length, 18);
    local.writeUInt32LE(descriptor ? 0 : content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30); content.copy(local, 30 + filename.length);
    if (descriptor) {
      const start = 30 + filename.length + content.length;
      local.writeUInt32LE(0x08074b50, start); local.writeUInt32LE(crc32(content), start + 4);
      local.writeUInt32LE(content.length, start + 8); local.writeUInt32LE(content.length, start + 12);
    }
    const directory = Buffer.alloc(46 + filename.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(descriptor ? 8 : 0, 8);
    directory.writeUInt32LE(crc32(content), 16);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    filename.copy(directory, 46);
    locals.push(local); directories.push(directory); offset += local.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directories.length, 8); end.writeUInt16LE(directories.length, 10);
  end.writeUInt32LE(directories.reduce((n, b) => n + b.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directories, end]);
}
