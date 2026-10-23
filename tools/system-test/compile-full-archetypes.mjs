// PresentationOS Full Archetype Showcase Compiler
import { createTaskService } from '../../kernel/workflow/dist/index.js';
import { unlinkSync, existsSync, statSync } from 'node:fs';

const markdown = `# PresentationOS 2026 商业演示系统

新一代端到端智能化商业演示软件与企业级落地实践

## 传统演示 vs PresentationOS
- 传统模式痛点：排版耗时长、视觉风格全凭人工猜测、格式紊乱易重叠、事实数据易被改写或丢失。
- PresentationOS 核心突破：端到端 100% 事实保真、语义自适应全套版式图库、纯原生矢量对象与双引擎 QA。

## 战略发展与演进路线
- 2024年：核心架构奠基，研发 IR 多层中间表示与 Durable 异步工作流。
- 2025年：发布桌面端工作台，打通原生 PowerPoint 双向编辑与音视频媒体管线。
- 2026年：交付企业级全版式设计系统，实现 100% 事实保真与自动化质检验收。
- 2027年：拓展全球多模态演示生态，支持跨平台协同与实时智能演讲伴侣。

## 自动化编译与质检闭环
- 步骤一：文档解析与事实提取，锁定所有数值、单位与时态事实。
- 步骤二：语义分类与版式自适应，自动匹配时间轴、对比矩阵或卡片网格。
- 步骤三：双引擎机械与视觉质检，生成原生可编辑 PPTX 并完成 Native 认证。

## 关键财务与经营指标
- 年化净利润达到 5000万元，超额完成全年经营预算 128%。
- 交付各类算力设备 120台，服务超过 500家大模型客户。
- 核心系统可用性 SLA 达到 99.99%，平均响应时间低于 15ms。

## 各季度达成情况明细
| 季度 | 目标金额 | 实际金额 | 达成率 |
| Q1 | 1200万 | 1350万 | 112% |
| Q2 | 1500万 | 1620万 | 108% |
| Q3 | 1800万 | 2030万 | 112% |
| Q4 | 2200万 | 2580万 | 117% |

## 战略愿景与核心宣言
> 让每一位专业人士都能在数秒内交付高水准、可编辑、100% 事实保真的商业级演示文稿。
`;

const outPptx = 'D:\\PresentationOSData\\presentationos_showcase_master.pptx';
if (existsSync(outPptx)) {
  try {
    unlinkSync(outPptx);
  } catch (err) {
    console.warn('Could not unlink old file:', err.message);
  }
}

const taskService = createTaskService();
console.log('Compiling full multi-archetype presentation...');
const res = await taskService.compileMarkdown({
  projectId: 'showcase-master',
  title: 'PresentationOS 2026 商业演示系统',
  markdown,
  outPptxPath: outPptx,
});

if (!res.ok) {
  console.error('Compilation failed:', res.error);
  process.exit(1);
}

console.log('Compilation succeeded! Slides:', res.slidesCount, 'Score:', res.overallScore);
console.log('Output file:', outPptx, 'Size:', statSync(outPptx).size, 'bytes');
