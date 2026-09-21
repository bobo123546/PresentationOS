// 集成：编辑真实 deck.pptx 第 3 页标题 → 输出新 PPTX
import { readFileSync, writeFileSync } from 'node:fs';
import { editPptx } from '../../kernel/pptx-editor/dist/index.js';

const input = process.argv[2];
const output = process.argv[3];
const buf = readFileSync(input);
const { buffer, result } = await editPptx(buf, [{ slide: 3, target: 'title', text: 'EDITED: 目标与挑战（已编辑）' }]);
if (!result.ok) {
  console.error('EDIT_FAILED', result.error);
  process.exit(1);
}
writeFileSync(output, buffer);
console.log(JSON.stringify({ ok: true, changed: result.changed, output }, null, 2));
