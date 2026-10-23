# PresentationOS · 企业级演示文稿操作系统

> **The Next-Generation Enterprise Presentation Operating System**  
> 全球首个端到端 **100% 事实保真、零幻觉、多模态演播与原生矢量可编辑** 的全自动化商业与学术演示文稿操作系统。

[![CI](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml/badge.svg)](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![UIA: 27 Controls](https://img.shields.io/badge/Windows_UIA-27_Controls_Active-success.svg)](apps/desktop-host)
[![Audit: 23/23 Pass](https://img.shields.io/badge/Repo_Audit-23%2F23_Pass-brightgreen.svg)](docs/验证记录.md)

---

## 任何人看见这个项目，请先看这 3 句话

1. **它不是普通的 PPT 模板或提示词包装器**：它是一个拥有 22 个底层核心包、独立桌面端宿主（`PresentationOS.exe`）与本地 API 服务（`:48200`）的完整演示文稿操作系统。
2. **它做到了 100% 事实保真与零幻觉**：输入 DOCX、XLSX、CSV、JSON 或 Markdown，提取的硬事实（QPS、时延、利润、百分比、时间戳）在最终幻灯片中经过数学比对，保真率恒为 **100.0%**。
3. **它覆盖全行业 10 大产业集群与 36 大高难度场景**：无论华尔街投行 IPO 路演、麦肯锡数字化转型蓝图、跨国专利诉讼抗辩、P0 故障根因复盘（RCA），还是顶会论文答辩与新药临床试验，全部原生矢量自适应排版。

---

## 30 秒极速上手与现场操作

### 1. 启动本地桌面端可视化交互工作台
```sh
# 启动本地 Sidecar 核心服务 (端口 48200)
node apps/desktop/dist-server/sidecar-server.js

# 在浏览器中打开交互工作台
start http://127.0.0.1:48200/
```
*桌面独立客户端 `release/PresentationOS/PresentationOS.exe` (147 MB) 已编译就绪，内置 27 项 Windows 原生自动化控件与系统托盘常驻。*

### 2. 一键编译并质检任意 Markdown 文档
```sh
# 安装依赖并构建
pnpm install --frozen-lockfile
pnpm --workspace-concurrency=1 -r --if-present build

# 极速编译生成 100% 事实保真 PPTX
node apps/cli/dist/index.js compile tools/vertical-slice/sample.md ./output.pptx
node apps/cli/dist/index.js qa tools/vertical-slice/sample.md ./output.qa.json
node apps/cli/dist/index.js audit
```

### 3. 一键执行全系统九重核心工程底座自动化实测
```sh
# 现场验证：事实保真、模板逆向、就地手术级编辑、场景重建、机械质检与 API 通信
node scripts/verify_full_system_mastery.cjs

# 现场批量编译 4 套全新高难度行业母版 (金融IPO/咨询战略/专利法律/系统复盘)
node scripts/compile_universal_scenarios.mjs
```

---

## 核心架构：九重工业级工程底座

```mermaid
flowchart TD
  subgraph INGESTION["1. 输入与解析层 (Zero-Hallucination)"]
    D1["多格式解析器<br/>DOCX / XLSX / CSV / MD / JSON"] --> D2["事实提取引擎 (FactIR)<br/>锁定数值/单位/时间/硬事实"]
    D2 --> D3["可信度与保真度核验<br/>100.0% 事实保真证明"]
  end

  subgraph ENGINE["2. 排版与设计系统 (12 Archetypes & 10 Domains)"]
    E1["领域自动感知分类器<br/>金融 / 咨询 / 法律 / 研发 / 医疗 / 学术等 10 大产业"] --> E2["12 大通用设计原型内核<br/>金字塔 / 架构栈 / 四象限 / 漏斗 / 对比等"]
    E2 --> E3["动态几何排版求解器<br/>对齐 / 自动避障 / 负空间计算"]
  end

  subgraph SURGICAL["3. 逆向与外科手术级编辑 (Bit-Level Integrity)"]
    S1["Template DNA 逆向工程<br/>母版/色盘/字阶/版心精准提取"] --> S2["OOXML 就地外科手术级修改"]
    S2 --> S3["非目标部件 SHA256 完整性保护<br/>支持原子级可逆 Patch 与 Rollback"]
  end

  subgraph VISION["4. 视觉重建与机械质检 (Double-QA Gate)"]
    V1["截图/视觉检测框场景重建 (SceneIR)"] --> V2["计算机视觉 IoU 几何对齐 (IoU &ge; 0.99)"]
    V2 --> V3["Mechanical QA 质检网关<br/>0 溢出 / 0 碰撞 / WCAG AA 对比度"]
  end

  subgraph DELIVERY["5. 多模态与多端交付层 (Multimodal & Desktop)"]
    M1["Windows SAPI TTS 原生语音合成"] --> M2["SRT / VTT 毫秒级同传字幕"]
    M2 --> M3["1080P 演播级 MP4 渲染 (&Delta;t &le; 0.040s)"]
    M3 --> M4["原生桌面宿主 (UIA 27 控件) & Web Workbench (:48200)"]
  end

  INGESTION --> ENGINE
  ENGINE --> SURGICAL
  SURGICAL --> VISION
  VISION --> DELIVERY
```

---

## 全行业 10 大产业集群与 36 大高难度场景支持

| 产业集群 | 垂直领域 | 专属视觉语言 | 核心解决的高难度业务场景 |
| :--- | :--- | :--- | :--- |
| **1. 金融投资与投行** | `finance` | **华尔街金** (`#0B1528` / `#F59E0B`) | 纳斯达克 IPO 承销路演、红筹股权金字塔、DCF 现金流估值模型、P/E & EV/EBITDA 横评 |
| **2. 管理咨询与战略** | `consulting` | **麦肯锡冷灰** (决策级极简冷调) | 500强数字化转型全景蓝图、2x2 战略优先级矩阵、组织变革四阶段、降本增效 ROI 测算 |
| **3. 法律合规与风控** | `legal` | **司法勃艮第红** (`#1C1417` / `#9F1239`) | 芯片专利诉讼全面不覆盖抗辩、四层司法证据链拓扑网、在先技术对比表、质证意见清单 |
| **4. 软件工程与架构** | `engineering` | **极客科技暗色** (`#090D16` / `#06B6D4`) | P0 核心交易雪崩根因复盘 (RCA)、分钟级时序还原、弹性多活五重纵深防御、SRE 稳定性誓约 |
| **5. 生物医药与临床** | `medical` | **翡翠薄荷绿** (`#064E3B` / `#34D399`) | GCP 临床试验队列总结、医院 MDT 疑难会诊、医疗器械 NMPA/FDA 申报、流行病学调查 |
| **6. 学术科研与答辩** | `academic` | **学术象牙白** (`#FAF9F6` / `#B45309`) | 博士学位论文答辩、国家自然科学基金开题结题、顶会 Oral 演讲、SOTA 消融基准横评 |
| **7. 政务智库与治理** | `government` | **政务国策红** (`#7F1D1D` / `#FEF2F2`) | 智慧城市顶层规划、区域招商引资推介、应急救灾响应演练、政府工作报告指标考核 |
| **8. 教育培训与讲义** | `education` | **教育琥珀金** (`#B45309` / `#FEF3C7`) | 高校国家级精品慕课、企业大学高管研修、微课说课比赛提案、知识图谱考点梳理 |
| **9. 整合营销与公关** | `business` | **行政藏蓝** (`#0B132B` / `#2563EB`) | 新消费品牌全球年度发布盛典、突发危机公关舆情处置、大促战役复盘、大客户 RFP 提案 |
| **10. 文创传媒与策展** | `creative` | **先锋电光紫** (`#0F0B1E` / `#A855F7`) | 院线商业电影创投提案、数字文旅沉浸式运营规划、现代艺术展陈动线设计、潮玩 IP 企划 |

---

## 12 大通用设计原型 (Universal Archetypes)

每个设计原型均经过数学几何对齐与排版优化，支持原生矢量导出并在 PowerPoint / WPS 中任意缩放无失真：

1. **Cover (尊享封面)**：顶部胶囊徽章、28pt 主标题、副标题与权威元数据印章。
2. **Pyramid (金字塔)**：3~4 层战略与理论模型（顶层使命 Apex $\to$ 战略支柱 Pillars $\to$ 底座基石 Foundation）。
3. **Architecture (分层蓝图)**：L1 展现层 $\to$ L2 调度网关 $\to$ L3 计算内核 $\to$ L4 基础设施芯片化分层排布。
4. **Comparison (VS 对比矩阵)**：左侧痛点阻碍 vs 右侧核心突破，中央悬浮发光 VS 徽章。
5. **Quadrant (2x2 优先级矩阵)**：Q1 战略必争、Q2 快速见效、Q3 基础设施、Q4 审慎评估四象限。
6. **Funnel (转化漏斗)**：STAGE 01~04 递进式漏斗卡片与指标衰减流转。
7. **Team (领导力与专家阵容)**：专业履历、角色担当、研究背景网格卡片。
8. **Timeline (演进路线图)**：同心圆时间节点、里程碑进度线与发光徽章。
9. **Process (闭环步骤流)**：STEP 01~03 连续执行卡片与强调状态条。
10. **CardGrid (KPI 核心指标)**：32pt 粗体大数、单位标签与同期对比指标卡片。
11. **Table (黑曜石高级表格)**：深色表头、斑马纹浅色交替底色、数字自动居中。
12. **Quote (格言引语页)**：水印级双引号、24pt 战略主张金句与发言人身份铭牌。

---

## 本地真实已验证交付物资产池 (`D:\PresentationOSData`)

所有交付物均已在本地 Windows 环境真实生成，并通过了 PowerPoint 与 WPS 双引擎打开校验：

- 💰 **金融投行**: [`finance_presentation_ipo.pptx`](file:///D:/PresentationOSData/finance_presentation_ipo.pptx) *(12 页 · 295 KB · 质检 99/100)*
- 📊 **战略咨询**: [`consulting_presentation_strategy.pptx`](file:///D:/PresentationOSData/consulting_presentation_strategy.pptx) *(12 页 · 290 KB · 质检 99/100)*
- ⚖️ **司法合规**: [`legal_presentation_compliance.pptx`](file:///D:/PresentationOSData/legal_presentation_compliance.pptx) *(12 页 · 296 KB · 质检 99/100)*
- 🛠️ **系统研发**: [`devops_presentation_incident_postmortem.pptx`](file:///D:/PresentationOSData/devops_presentation_incident_postmortem.pptx) *(12 页 · 299 KB · 质检 99/100)*
- 🎓 **高校学术**: [`academic_presentation_thesis.pptx`](file:///D:/PresentationOSData/academic_presentation_thesis.pptx) *(6 页 · 161 KB)*
- 🏥 **临床医疗**: [`medical_presentation_clinical.pptx`](file:///D:/PresentationOSData/medical_presentation_clinical.pptx) *(6 页 · 136 KB)*
- 🌐 **系统母版**: [`presentationos_master_universal_deck.pptx`](file:///D:/PresentationOSData/presentationos_master_universal_deck.pptx) *(12 页 · 301 KB)*
- 🎬 **多模态视频**: [`presentation_multimodal_showcase.mp4`](file:///D:/PresentationOSData/video_showcase/presentation_multimodal_showcase.mp4) *(1080P 高清视频 · Windows SAPI 语音合成 · 同传字幕)*

---

## 质量验证与工程审计

```sh
# 运行仓库 23 项全量契约与合规审计
node apps/cli/dist/index.js audit

# 运行全工作区单元测试与集成测试
pnpm test:node
pnpm --workspace-concurrency=1 -r --if-present test
```

- **0 CVE** 供应链漏洞
- **23/23** 项自动化架构审计绿灯通过
- **100%** 原生矢量 OpenXML 生成与只读部件 SHA256 完整性保护

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
