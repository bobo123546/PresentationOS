// PresentationOS Universal Presentation Compiler (10 Universal Archetypes)
import { createTaskService } from '../../kernel/workflow/dist/index.js';
import { unlinkSync, existsSync, statSync } from 'node:fs';

const markdown = `# PresentationOS 全场景演示系统

面向全行业商业场景的端到端自动化高质量演示系统

## 传统演示 vs PresentationOS
- 传统模式痛点：排版耗时长达数小时、视觉风格依靠人工调试、内容缺乏层次结构、事实数据易发生笔误或遗漏。
- PresentationOS 核心突破：100% 事实保真提取、全套 10 大场景自适应版式图库、纯原生矢量对象与双引擎自动化质检。

## 战略优先级四象限矩阵
- Q2 快速见效：优先落地多格式导入与模板复用能力，降低用户上手门槛。
- Q1 核心要务：攻坚自动化 Native 校验与真实 Office 运行时闭环，构建核心壁垒。
- Q3 常规跟进：持续补充细分行业专业图标库与本地化中文字体包。
- Q4 审慎评估：对非主流旧版本文件格式转换保持审慎，避免引入冗余复杂度。

## 全链路营销与转化漏斗
- STAGE 01 曝光触达：全网技术白皮书与开源社区发布，月度曝光量突破 1000万次。
- STAGE 02 深度体验：提供桌面便携免安装试用版，下载试用转化率达到 38%。
- STAGE 03 企业签约：面向金融、咨询与政企客户交付定制版，签约率达到 65%。
- STAGE 04 长期留存：建立客户成功与持续升级通道，年度客户净留存率高达 128%。

## 核心领军与研发团队
- 李博士 · 首席科学家：前顶级实验室系统架构负责人，专注于程序分析与形式化验证。
- 王工 · 首席架构师：拥有 12 年跨平台桌面应用架构经验，主导核心中间表示与渲染管线。
- 陈总 · 产品体验合伙人：前知名咨询机构设计合伙人，制定企业级商务演示设计系统规范。

## 战略发展与演进路线
- 2024年：核心架构奠基，研发多层 IR 中间表示与 Durable 异步工作流。
- 2025年：发布桌面端工作台，打通原生 PowerPoint 双向编辑与音视频媒体管线。
- 2026年：交付企业级全版式设计系统，实现 100% 事实保真与自动化质检验收。
- 2027年：拓展全球多模态演示生态，支持跨平台协同与实时智能演讲伴侣。

## 自动化编译与质检闭环
- 步骤一：文档解析与事实提取，锁定所有数值、单位与时态事实。
- 步骤二：语义分类与版式自适应，自动匹配四象限、漏斗、时间轴或对比矩阵。
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

const outPptx = 'D:\\PresentationOSData\\presentationos_universal_all_scenarios.pptx';
if (existsSync(outPptx)) {
  try {
    unlinkSync(outPptx);
  } catch (err) {
    console.warn('Could not unlink old file:', err.message);
  }
}

const taskService = createTaskService();
console.log('Compiling 10-slide Universal Presentation...');
const res = await taskService.compileMarkdown({
  projectId: 'universal-all-scenarios',
  title: 'PresentationOS 全场景演示系统',
  markdown,
  outPptxPath: outPptx,
});

if (!res.ok) {
  console.error('Compilation failed:', res.error);
  process.exit(1);
}

console.log('Compilation succeeded! Slides:', res.slidesCount, 'Score:', res.overallScore);
console.log('Output file:', outPptx, 'Size:', statSync(outPptx).size, 'bytes');
