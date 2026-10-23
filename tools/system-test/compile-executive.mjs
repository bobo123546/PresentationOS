import { createTaskService } from '../../kernel/workflow/dist/index.js';
import { unlinkSync, existsSync, statSync } from 'node:fs';

const markdown = `# 2026年企业战略发布会

新一代智能化商业战略规划与核心业务成果落地实践

## 财务表现
- 年化净利润达到 5000万元，超额完成全年经营预算 128%。
- 交付各类算力设备 120台，服务超过 500家大模型客户。
- 核心系统可用性 SLA 达到 99.99%，平均响应时间低于 15ms。

## 季度达成情况
| 季度 | 目标金额 | 实际金额 | 达成率 |
| Q1 | 1200万 | 1350万 | 112% |
| Q2 | 1500万 | 1620万 | 108% |
| Q3 | 1800万 | 2030万 | 112% |
`;

const outPptx = 'D:\\PresentationOSData\\strategy_presentation_executive.pptx';
if (existsSync(outPptx)) {
  try {
    unlinkSync(outPptx);
  } catch (err) {
    console.warn('Could not unlink old file, will attempt compilation:', err.message);
  }
}

const taskService = createTaskService();
console.log('Compiling markdown to executive presentation...');
const res = await taskService.compileMarkdown({
  projectId: 'executive-deck',
  title: '2026年企业战略发布会',
  markdown,
  outPptxPath: outPptx,
});

if (!res.ok) {
  console.error('Compilation failed:', res.error);
  process.exit(1);
}

console.log('Compilation succeeded! Slides:', res.slidesCount, 'Score:', res.overallScore);
console.log('File size:', statSync(outPptx).size, 'bytes');
