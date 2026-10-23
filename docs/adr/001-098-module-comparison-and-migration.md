# ADR 001: 098 实验原型模块比对与生产迁移决策

## 1. 背景与目标
`098/` 是 PresentationOS 早期以 Python 构建的实验性探索原型，涵盖了 Markdown/DOCX/表格解析、场景叙事规划、布局几何求解、来源事实提取、python-pptx 渲染、自动化修订、Python COM Native 验证等能力。

依据总实施计划 P02 要求及实施指令：
1. 禁止整目录整体合并 `098`，避免两套同名不同义 IR（如 SourceIR vs DocumentIR、毫米 vs 英寸单位）污染生产内核；
2. 按 8 大能力模块逐一对比功能、接口、Schema、单位、测试及维护成本；
3. 确定“保留独立原型”、“迁移纯逻辑至 TypeScript”或“标准 Worker 接入”的单一权威处置。

---

## 2. 逐模块对比与决策矩阵

| 模块序号 | 功能领域 | 098 原型实现 | 生产体系实现 (@pres/*) | 关键差异与单位 | 处置决策 | 迁移与落地路径 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M-01** | **文档解析 (Parsers)** | `098/parsers/` (Markdown, DOCX, Tabular) | `@pres/workflow` (仅基础 mdToDeck) | 098 产出 chunk 列表与事实偏置；生产需规范 DocumentIR AST | **迁移纯逻辑** | 将 DOCX、CSV、TSV、XLSX 及增强型 Markdown 提取器迁移为 TS 纯逻辑包 `@pres/document-parser` |
| **M-02** | **叙事与大纲规划 (Narrative)** | `098/narrative/scene_planner.py` | `@pres/pptx-engine` & `@pres/workflow` (`layoutFor`) | 098 采用 5 类场景模板规划；生产已具备启发式版式推断 | **吸收纯逻辑** | 将 098 场景启发式规则融入 `@pres/workflow/deck-pipeline` |
| **M-03** | **布局几何 (Layout Engine)** | `098/layout/geometry_solver.py` | `@pres/pptx-engine` (`resolveLayout`) | **单位冲突**：098 为毫米/点；生产内核统一为**英寸 (inches)**（匹配 OpenXML 1 in = 914400 EMUs） | **保持生产权威** | 生产 Schema 唯一标准为英寸；任何外部输入经适配器换算，098 原型保持独立 |
| **M-04** | **来源事实追踪 (Provenance)** | `098/parsers/markdown_parser.py` (`facts`) | `@pres/workflow` (`contentSnapshot` + literal compare) | 098 提取数值/货币/百分比/实体；生产实行修订前后字符级 100% 保真门禁 | **统一融合** | 在生产 `DocumentIR` 中增加 `extractedFacts` 结构，继承 098 正则实体与数值提取能力 |
| **M-05** | **文稿渲染 (Renderer)** | `098/renderers/python_pptx_renderer.py` (python-pptx) | `@pres/pptx-engine` (PptxGenJS + XML helpers) | 098 强依赖 Python 环境；生产为零依赖便携式 TypeScript | **生产主用，Worker 备用** | 生产主干统一使用 `@pres/pptx-engine`；python-pptx 仅作为标准 Worker Provider 备选 |
| **M-06** | **修订引擎 (Revision)** | `098/qa/auto_fixer.py` | `@pres/revision-engine` (`applyRevisions`) | 098 改动较粗放；生产支持 `split`、`increase_font`、`fix_contrast` 且受 100% 事实保真约束 | **保留生产内核** | 以生产 `@pres/revision-engine` 为唯一标准，098 规则不直接合并 |
| **M-07** | **Native 验证 (PowerPoint)** | `098/qa/native_verifier.py` (pywin32 COM) | `workers/powerpoint-dotnet` (.NET 8 C# COM) | 098 Python COM 释放代理时偶发 `0x80010108` 异常；.NET 8 内存与 COM 生命周期受控 | **废弃 098，使用 .NET** | 生产 Native QA 完全由 C# .NET 8 Worker 承担，098 Native 脚本仅做历史归档 |
| **M-08** | **质量与发布门禁 (Gates)** | pytest 局部断言 | `tools/docs-auditor/` + 双引擎 QA + 事实保真门禁 | 098 为样例测试；生产为全平台跨工具链强一致性治理门禁 | **保持生产权威** | 统一由根目录 `audit-docs.mjs` 与自动化测试把关 |

---

## 3. 落地实施规范
1. **Schema 权威唯一**：生产唯一权威 Schema 位于 `schemas/`（基于 JSON Schema 2020-12）。不得在生产工作流中直接反序列化 `098/schemas/source_ir.schema.json`。
2. **单位规范**：
   - 生产布局坐标单位统一为**英寸 (inches)**，精度保留至小数点后 4 位。
   - 字体大小统一为**磅值 (pt)**。
   - 颜色格式统一为标准 6 位十六进制（如 `#2563eb`）。
3. **098 目录保护**：保留 `098/` 完整文件用于算法回溯与 pytest 回归，不作删除或原地混编。
