# PresentationOS 完整完善与升级总方案

## 【文档性质】
本方案是 `D:\PresentationOS` 的完整完善计划、功能清单、阶段路线、验收矩阵、错误识别机制、纠错机制和发布门禁。
本方案只描述后续如何完善项目，不代表本轮已经修改代码、安装依赖、运行构建、运行测试、启动 PowerPoint 或完成发布。
运行数据根目录统一为 `D:\PresentationOSData`。
所有后续新增源码、Schema、测试、工具、文档和 Evidence 文件必须位于 `D:\PresentationOS\098`。
所有运行时产物、日志、缓存、模型、临时文件、备份和 Evidence 数据必须按照项目策略写入 `D:\PresentationOSData`。

---

## 【一、项目目标重新定义】
PresentationOS 不应只被定义为“用 AI 生成 PPT 的工具”，而应定义为：
“一个以稳定 IR 协议为核心、支持多模型和多 Worker、能够生成可编辑演示文稿、能够进行真实质量验收、能够追溯输入来源和修订过程、支持本地化部署的 AI 演示文稿开发平台。”

项目最终要解决的不是“能不能生成一个 PPTX”，而是以下完整问题：
1. 用户提供 Markdown、PDF、DOCX、PPTX、图片、表格或自然语言目标后，系统能否准确理解输入。
2. 系统生成的内容能否保留原始事实、数字、单位、引用、条件和来源。
3. 页面布局能否在真实 PowerPoint 中保持可读、可编辑和可修改。
4. 系统能否自动发现文字溢出、元素重叠、字体替换、页面空洞、颜色对比不足和结构混乱。
5. 自动修订是否真的改善页面，而不是通过删除内容或改变评分字段来刷分。
6. 所有模型、Worker、插件、Workflow 和渲染器是否能被取消、恢复、重试和审计。
7. 失败后能否明确说明失败原因，重新处理受影响数据，并保留原始版本。
8. 用户是否能通过 CLI、Desktop、MCP 或 Skill 使用同一套核心能力。
9. 第三方依赖、模型、字体、素材、Office、Remotion 和上游代码是否具备合规的许可证和供应链记录。
10. 项目能否从开发原型升级为可安装、可升级、可回滚、可诊断的真实软件。

---

## 【二、当前真实状态判断】
1. 当前项目已经具备部分 Kernel、Schema、Worker、Artifact、Workflow、PPTX Engine、Mechanical QA、Visual QA、Revision Engine、Template DNA、PPTX Editor、Model Router、Plugin SDK、Telemetry 和历史 Evidence。
2. 当前已经存在一条 Markdown 到 DeckSpec 再到 PPTX 并进行 PowerPoint 历史验真的 Vertical Slice。
3. 历史 Evidence 可以证明某些功能曾经在某个时间点运行成功，但不能直接证明当前代码版本仍然完整通过。
4. 当前 `state/project_state.json`、`state/backlog.json`、`docs/交接文档.md`、`docs/源码结构文档.md` 和 `docs/编译部署指南.md` 存在版本、阶段和完成状态不一致。
5. 当前项目版本、提交版本、文档版本和 Evidence 版本需要重新绑定。
6. `apps/desktop` 和 `apps/api` 仍然没有形成完整实际产品入口。
7. `capabilities`、`providers`、`adapters` 和多个 kernel 目录存在骨架但没有与文档描述相匹配的完整实现。
8. `schemas` 下部分协议目录存在但缺少实际 Schema。
9. `tests` 下 `contract`、`integration`、`golden`、`gui`、`performance`、`powerpoint`、`security`、`visual` 和 `workflow` 目录尚未形成完整验收体系。
10. 当前 CLI 仍然主要是最小占位入口。
11. 当前真正可靠的输入链路主要是 Markdown，其他输入类型仍应视为待建设能力。
12. 当前真实模型推理仍受本地模型、云端 API 和显存条件限制，协议级 Mock 测试不能代替真实模型验收。
13. 当前 PowerPoint Native QA 主要是历史冒烟验证，不能直接等同于完整 PowerPoint 生产验收。
14. 当前 Revision Loop 的部分自动修订逻辑存在内容删除、页面身份漂移、代理几何与最终渲染不一致等风险。
15. 当前 Template DNA 更接近样式统计和启发式提取，不能直接描述为完整企业模板逆向复刻。

---

## 【三、必须先解决的基础问题】
- **P0-01**：统一项目真实状态。
- **P0-02**：统一代码、Schema、文档、Evidence 和发布版本。
- **P0-03**：建立 Evidence Manifest。
- **P0-04**：补齐输入来源、内容溯源和 Artifact 关联。
- **P0-05**：补齐正式 Schema 和协议边界。
- **P0-06**：建立 ResolvedScene 作为 Layout、Renderer、Mechanical QA 和 Visual QA 的共同事实源。
- **P0-07**：修正 Revision Loop 的内容损失、身份漂移和无效放行问题。
- **P0-08**：建立真实渲染和 PowerPoint 分层验收。
- **P0-09**：修正 Worker、Workflow、Plugin、Telemetry 和 Artifact 的可靠性问题。
- **P0-10**：建立安全、隐私、许可证、SBOM 和发布门禁。
在上述 P0 项目完成前，不建议正式宣称“工业级生产平台”或“完整开源演示文稿操作系统”。

---

## 【四、目标架构】
PresentationOS 最终采用六层结构。
1. **第一层：Input and Source Layer**。负责 Markdown、PDF、DOCX、PPTX、图片、表格、网页截图、自然语言指令、品牌规范和 Speaker Notes 的导入。
2. **第二层：IR and Contract Layer**。负责 SourceIR、DocumentIR、NarrativeIR、DesignTokenIR、TemplateDNA、DeckSpec、LayoutIR、ResolvedScene、RenderIR、QAReport、RevisionRecord、ArtifactIR、WorkflowIR 和 WorkerIR。
3. **第三层：Capability and Execution Layer**。负责 Research、Narrative、Design、Layout、Render、PPTX、Template、QA、Speech、Video、Reconstruction、Edit 和 Import 等能力。
4. **第四层：Worker and Provider Layer**。负责 Node、Python、C#、Rust、FFmpeg、PowerPoint、模型 Provider、渲染 Provider、模板 Provider 和 QA Provider。
5. **第五层：Quality and Evidence Layer**。负责 Schema 验证、Mechanical QA、Visual QA、Content QA、Native QA、Evidence、Telemetry、Provenance、回滚和缺陷追踪。
6. **第六层：Product Surface Layer**。负责 CLI、Tauri Desktop、MCP、Skill、Plugin 和未来 API。

**数据流固定为**：
`Input → SourceIR → NarrativeIR → DesignTokenIR → DeckSpec → LayoutIR → ResolvedScene → RenderIR → PPTX/PDF/PNG/MP4 → QA → Evidence → Release Artifact`。
任何 UI、CLI、Skill、MCP 和 API 都只能调用 Capability、Workflow 和 Artifact 接口，不能重复实现一套业务逻辑。

---

## 【五、完整功能清单（A - S）】
- **A. 项目与状态管理**：A01-A08
- **B. 输入与解析**：B01-B13
- **C. SourceIR 和内容溯源**：C01-C10
- **D. Narrative 和内容规划**：D01-D13
- **E. DesignToken 和 Template**：E01-E18
- **F. Layout 和 ResolvedScene**：F01-F16
- **G. Renderer**：G01-G12
- **H. Mechanical QA**：H01-H18
- **I. Visual QA**：I01-I15
- **J. Content QA**：J01-J11
- **K. Revision Engine**：K01-K21
- **L. Template DNA 和 PPTX 编辑**：L01-L18
- **M. PowerPoint Native QA**：M01-M20
- **N. Worker 和 Workflow**：N01-N20
- **O. Plugin 和安全**：O01-O17
- **P. Model Router**：P01-P19
- **Q. Tauri Desktop**：Q01-Q24
- **R. 数据、日志和 Evidence**：R01-R20
- **S. 媒体和视频**：S01-S14

---

## 【六、阶段计划】
- **PHASE 0**：状态、版本和证据治理
- **PHASE 1**：输入、SourceIR 和正式 Schema
- **PHASE 2**：输入解析和内容质量
- **PHASE 3**：ResolvedScene、Renderer 和基础 QA
- **PHASE 4**：Revision Loop 安全化
- **PHASE 5**：Template DNA、PPTX 编辑和页面复刻
- **PHASE 6**：PowerPoint Native QA 和 Windows Worker
- **PHASE 7**：Worker、Workflow、Plugin、Artifact 和 Telemetry
- **PHASE 8**：CLI、Desktop 和统一用户体验
- **PHASE 9**：Model Router 和 AI 辅助
- **PHASE 10**：TTS、字幕和 MP4
- **PHASE 11**：性能、资源和可恢复性
- **PHASE 12**：隐私、数据生命周期和删除
- **PHASE 13**：供应链、许可证和安全发布
- **PHASE 14**：开源、安装、升级和回滚

---

## 【七、错误识别总机制】
涵盖 20 类错误定义：CONTRACT, PARSE, CONTENT, LAYOUT, RENDER, MECHANICAL, VISUAL, REVISION, POWERPOINT, WORKER, WORKFLOW, MODEL, PLUGIN, STORAGE, SECURITY, PRIVACY, LICENSE, GUI, PERFORMANCE, DOCUMENTATION。

---

## 【八、错误纠正固定流程】
固定 12 步循环：
`CAPTURE → CLASSIFY → REPRODUCE → ISOLATE → ROOT_CAUSE → PATCH → TARGETED_TEST → INTEGRATION_TEST → REGRESSION_TEST → DATA_REPAIR → DOCUMENT → RELEASE_DECISION`。

---

## 【九、缺陷严重度（S0 - S3）】
- **S0**：数据损毁/越界删除/敏感信息泄露/跨项目串染/发布错误产物 -> 立即阻断。
- **S1**：静默丢字段/视频页面错配/模板改错页/无法恢复 -> 阻断发布排查全量。
- **S2**：局部边界/视觉/偶发失败 -> 限制范围并迭代修复。
- **S3**：轻微展示/便利性/非关键日志缺失 -> 排入后续迭代。

---

## 【十、验收矩阵】
16 维严格判定：Contract, Implementation, Build, Unit Test, Contract Test, Integration Test, Negative Test, E2E, Artifact Validation, Native Validation, Logging, Evidence, Regression, Documentation, Provenance, Release State。

---

## 【十一、Golden 与持续测试集】
- 开发回归集
- 冻结验收集
- 持续抽检集
- 25 种核心 Golden Case 场景覆盖

---

## 【十二、20 点发布门禁】
任何一项不通过，严禁标记 `RELEASE_READY`。

---

## 【十三、推荐实际执行顺序】
12 个执行步进，由内核与协议打底，逐层上升至产品化。

---

## 【十四、暂不提前扩大的方向】
1. 无真实模型前不放大 VLM 审美承诺。
2. 无真实需求前不做 3D/复杂空间。
3. 无单机瓶颈前不做 S3/MinIO 分布式。
4. 无桌面骨架前不堆砌花哨动画。
5. 保证事实前不做激进摘要删文。
6. 无许可证前不外发 106 个上游能力。
7. 未确认商业许可前不捆绑 Remotion 默认能力。

---

## 【十五、最终产品完成定义】
完成 22 项全链路真实用户闭环流程。

---

## 【十六、最终判断】
核心底座：输入可信、内容可追溯、协议统一、布局可验证、输出可编辑、修改可撤销、失败可恢复、模型可替换、插件可隔离、日志不泄露、数据可删除、许可证可核查、安装可复现、版本可升级、问题可定位、结果可独立验收。
