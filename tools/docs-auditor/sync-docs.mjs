// Synchronize presentationos-current headers in docs/*.md with state/project_state.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve('D:/PresentationOS');
const state = JSON.parse(readFileSync(join(root, 'state/project_state.json'), 'utf8'));

const currentHeader = JSON.stringify({
  version: state.project_version,
  phase: state.current_phase,
  release_status: state.release_status,
  active_task: state.active_task,
});

const docs = [
  '交接文档.md',
  '源码结构文档.md',
  '编译部署指南.md',
  '协作提示词.md',
  '训练数据.md',
];

for (const name of docs) {
  const filePath = join(root, 'docs', name);
  let text = readFileSync(filePath, 'utf8');
  text = text.replace(/<!-- presentationos-current \{[^\n]+\} -->/, `<!-- presentationos-current ${currentHeader} -->`);
  writeFileSync(filePath, text, 'utf8');
  console.log(`Synced ${name} -> ${currentHeader}`);
}
