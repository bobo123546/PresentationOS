# 系统集成记录：2026-10-24

产品版本保持 0.1.2-alpha，发布状态保持 NOT_READY。本记录区分组件实现、实测范围和完整发布验收。

## 实际接通的链路

1. `CLI compile` / `TaskService.compileDocumentFile`：原始 DOCX、XLSX、CSV、TSV → DocumentIR → 共享保全文本与表格分页 → 修订 → 实际渲染命令质检 → PPTX → 内容回读 → 独占发布。Markdown/文本保留兼容入口。原始输入 SHA256 与导入范围写入报告。
2. `--template reference.pptx` / `referencePptxPath`：模板关系、theme、master/layout 显式样式 → 有出处的角色颜色与字体 → 规范 DesignTokens → 同一渲染及质检场景。没有普通页的有效模板也可提取主题。多主题选择、缺失角色默认值和不支持的透明度/复杂变换会记录；不宣称复制母版结构、布局或素材。
3. `skill deck.render` 复用 TaskService，接受相同参考主题与最终内容回读、质检、输出保护，返回报告路径。
4. 旧稿编辑按真实放映顺序定位，支持同段跨 Run literal 替换与明确 occurrence/all。保留相同前后缀的原样式，编辑后回读；patch 保存精确目标 XML 与前后哈希，撤销拒绝并发更改。历史无快照 patch、跨段 literal、文本 field/break/tab 等尚不支持的操作明确失败。
5. 原生字体检查读取注册字体实际 SFNT/TTC name 表的本地化 family 名并记录文件哈希。修复 registry 只有 SimSun 而请求宋体时的误报；不使用硬编码中文别名或前缀宽松通过。

## 修复的保真与失败边界

- DOCX 表格段落不再重复或挪到文末；XLSX 保留稀疏列位和工作表顺序。读取缓存值，不计算公式或重现数字格式；无缓存公式明确拒绝。
- CSV 保留引用字段中的换行、空格、引号和显式空记录；错误引号、错列拒绝。UTF-8、OOXML XML 与 ZIP 边界/CRC/解压限制有负向回归。
- 负数、完整单位、千位分隔符不再被重叠子串替代；出现次数校验只证明字面数量保留，不证明原始事实真实。
- 分页保留 grapheme、数量/单位、单词和 URL 边界；过长不可分内容拒绝，不能通过裁字获得成功。白底白字等实际正文/表格单元格对比度不足会阻断输出。
- PDF/PPTX 不再转成伪纯文本成功。DOCX 中尚无导入适配器的图片、嵌入对象和公式明确拒绝，不能静默丢弃。

## 执行证据与范围

本机原始命令、输入、退出码、日志、SHA256 和工件位于 `D:/099/presentationos-integration-20261024`。未覆盖旧失败记录。

| 实测 | 证据 | 范围 |
|---|---|---|
| 8 个 ArcDeck 真实模板 | template-dna-arcdeck-probe.json | 每份 0 普通页/26 layouts/1 master/2 themes；只读输入 SHA 不变 |
| 模板生成三页 | native-template-arcdeck-font-catalog-fixed/result.json | PowerPoint 打开、另存、关闭、重开、编辑回退、PDF、3 PNG、字体、对话框轮询、自有进程退出；已检查 PNG |
| 富文本原稿/编辑稿/撤销稿 | pptx-editor-style-preserved/result.json 与三个 native-*/result.json | 每份 2 页原生操作通过；撤销后全部 24 个部件内容哈希恢复；已检查原生 PNG |
| 4 份真实 DOCX/XLSX | document-parser-real-fixtures.json | 正文/缓存单元格与独立 XML 解析文本哈希对照；不是源文档版面复刻 |
| DOCX/XLSX 实际 CLI 导入 | native-import-docx/result.json、native-import-xlsx/result.json | 生成 4 页/1 页；原生操作通过；不代表支持任意 Office 文档 |
| 回归与审计 | validation-result.json、validation-*.log | 构建、根级、workspace、Worker E2E、治理、C#、Python、npm advisory；以各命令实际退出码为准 |

原生通过仅限记录中的输入和检查项目，阶段对话框轮询不等于连续监测所有对话框。字体名存在不等于所有字形/字体效果完全保真。最终 EXE 的完整 UIA、GUI 取消恢复、跨版本安装升级、真正干净机器、安全/分发许可仍是独立门禁。

## 上游采用记录

106 项逐项登记在 `upstream/integration-matrix-20261024.json`。当前 99 项为待源码深审，4 项完成限定源码审查，3 项有限定能力采用或兼容验证；任一状态都不代表完整吸收该项目。

本轮独立实现借鉴 PPT Master 的主题/结构分离、来源合同与 ArcDeck 有效模板边界；PptxGenJS 继续作为已有生成依赖。未整体搬入重型模型框架。guizang-ppt-skill 为 AGPL，科研 pptx 技能包存在限制性许可与打包方 MIT 冲突，均未直接复制到 MIT 产品。字体、图片、样例和分发二进制仍需逐项授权核查。

后续顺序：来源与叙事合同、设计偏好持久化和桌面主题入口 → 真实模板槽位与已有 PPT 精确编辑的工作流入口 → 最终 EXE 完整交互/取消/任务隔离 → 安装升级/恢复、干净机与安全发行。模型推理不能用 mock 或上游质量分数冒充通过。
