import { renderDeck } from '../kernel/pptx-engine/dist/renderer.js';
import { resolveSlideRects } from '../kernel/pptx-engine/dist/layout-solver.js';

const deck = {
  title: '2026年企业战略发布会',
  subtitle: '新一代智能化商业战略规划与核心业务成果落地实践',
  author: 'PresentationOS AI',
  slides: [
    {
      kind: 'cover',
      title: '2026年企业战略发布会',
      blocks: [
        {
          type: 'text',
          text: '新一代智能化商业战略规划与核心业务成果落地实践',
          style: 'body',
        },
      ],
      notes: '尊敬的各位股东、合作伙伴与团队成员，欢迎来到2026年企业战略发布会。',
    },
    {
      kind: 'content',
      title: '财务与业务成果',
      blocks: [
        {
          type: 'text',
          text: '年化净利润达到 5000万元，超额完成全年经营预算 128%。',
          style: 'body',
        },
        {
          type: 'text',
          text: '交付各类算力设备 120台，服务超过80家大模型客户。',
          style: 'body',
        },
        {
          type: 'text',
          text: '核心系统可用性 SLA 达到 99.99%，平均响应时间低于 15ms。',
          style: 'body',
        },
      ],
      notes: '在财务表现方面，我们年化净利润达到五千万元，算力设备交付一百二十台，系统稳定性高达百分之九十九点九九。',
    },
    {
      kind: 'content',
      title: '季度达成情况',
      blocks: [
        {
          type: 'table',
          headers: ['季度', '目标金额', '实际金额', '达成率'],
          rows: [
            ['Q1', '1200万', '1350万', '112%'],
            ['Q2', '1500万', '1620万', '108%'],
            ['Q3', '1800万', '2030万', '112%'],
          ],
        },
      ],
      notes: '这是各季度的具体完成指标，连续三个季度超额实现既定目标。',
    },
  ],
};

const outPath = 'D:\\PresentationOSData\\strategy_presentation_executive.pptx';
const res = await renderDeck(deck, {
  outPath,
  resolveRects: resolveSlideRects,
  forceOverwrite: true,
});

console.log('Rendered executive presentation successfully:', res);
