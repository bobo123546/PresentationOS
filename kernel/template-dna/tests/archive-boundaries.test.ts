import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractTemplateDna } from '../src/index.js';

const part = 'ppt/theme/theme1.xml';
const minimal = '<a:theme xmlns:a="urn:drawing"><a:themeElements/></a:theme>';
async function archive(content: string | Buffer) {
  const zip = new JSZip(); zip.file(part, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
function central(bytes: Buffer): number {
  const offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(offset >= 0);
  // JSZip inserts folder records; select the actual theme member.
  for (let next = offset; next >= 0; next = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), next + 4)) {
    const length = bytes.readUInt16LE(next + 28);
    if (bytes.subarray(next + 46, next + 46 + length).toString() === part) return next;
  }
  throw Error('Theme central entry missing');
}

test('template inspection rejects an oversized declared XML member before inflation', async () => {
  const bytes = await archive(minimal);
  bytes.writeUInt32LE(8 * 1024 * 1024 + 1, central(bytes) + 24);
  await assert.rejects(extractTemplateDna(bytes), /ZIP decompression limit exceeded/);
});

test('an understated ZIP size cannot bypass the inflater output bound', async () => {
  const bytes = await archive('<a:theme>' + 'x'.repeat(128 * 1024) + '</a:theme>');
  bytes.writeUInt32LE(32, central(bytes) + 24);
  await assert.rejects(extractTemplateDna(bytes), /Invalid ZIP compressed data/);
});

test('template inspection verifies CRC and refuses invalid UTF-8 XML', async () => {
  const corrupt = await archive(minimal), at = central(corrupt);
  corrupt.writeUInt32LE((corrupt.readUInt32LE(at + 16) ^ 1) >>> 0, at + 16);
  await assert.rejects(extractTemplateDna(corrupt), /size or CRC/);
  await assert.rejects(extractTemplateDna(await archive(Buffer.from([0x3c, 0xff, 0x3e]))), /valid UTF-8/);
});
