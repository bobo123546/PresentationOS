<!-- presentationos-current {"version":"0.1.2-alpha","phase":"PHASE_9_IN_PROGRESS","release_status":"NOT_READY","active_task":"TASK-0010"} -->
# PresentationOS

当前状态：0.1.2-alpha；PHASE_9_IN_PROGRESS；NOT_READY。当前任务 TASK-0010。

PresentationOS 是一个正在开发的演示文稿生成、编辑与验证平台。当前重点是从输入材料生成可编辑 PPTX，检查输出内容和布局，并把原生 PowerPoint 验证纳入交付流程。项目仍处于 alpha，使用前请核对各条验证记录的输入、范围与时间。

[![CI](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml/badge.svg)](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 现有实现与验证边界

| 模块 | 已有实现 | 当前边界 |
|---|---|---|
| CLI / Workflow | compile、qa、audit；Markdown/文本与 DOCX/XLSX/CSV/TSV 支持范围内的正文、缓存单元格导入 | 文档原有排版、图片、公式计算不复刻；不支持的格式与正文对象明确拒绝 |
| PPTX Engine | 文本、表格、图形与多个排版原型；领域配色与规则分类 | 领域模板是排版配置，不能代替专业内容审核；复杂内容应拆页 |
| 内容检查 | 从实际生成 PPTX 读取文本，与输入期望核对 | 文本存在检查不能证明事实本身真实，也不能代替视觉与原生验收 |
| 来源追踪 | 原始输入哈希、块与单元格账本、UTF-16 数量出现位置、最终页与对象引用及读回 | 确定性保留来源顺序；不允许自由改写，不证明原始陈述真实 |
| Template DNA / OOXML 编辑 | 主题角色及中西文字体进入生成与质检；跨 Run 局部替换、精确快照撤销与部件哈希比较 | 主题应用不复制母版布局和素材；复杂图表、动画与任意 PPT 的编辑保真尚未完成矩阵验收 |
| 媒体 | Windows SAPI TTS、字幕、时间线与 FFmpeg 渲染 | 时间线/字幕/尾部同步修复需以新生成成品验证；依赖本机环境 |
| 桌面 | .NET 8 WinForms + WebView2 宿主、React/TypeScript UI、本地 Node sidecar | 最终安装包与真实 UIA、任务隔离和干净机生命周期未完成验收 |
| 模型路由 | 协议、fallback 与 mock 集成 | 真实模型推理尚未验收；需要合法配置模型服务 |
| 安全 | npm advisory 查询、安装生产依赖清单、文本密钥模式检查 | NuGet、最终 runtime/FFmpeg 二进制、插件隔离与发行威胁评审仍待完成 |

Tauri 2 是早期规划；当前桌面工程为 apps/desktop-host 中的 WinForms/WebView2 实现。H:/ppt 的 106 个上游项目属于调研来源池，下载、清单或历史扫描不代表全部已集成到产品。098 目录保留为独立实验原型。

## 开发运行

需要项目支持的 Node.js、pnpm，以及 Windows 原生测试所需的 .NET 8 和 Microsoft PowerPoint。媒体功能另外需要 FFmpeg 与相应语音引擎。完整环境和历史命令见 [编译部署指南](docs/编译部署指南.md)。

```powershell
pnpm install --frozen-lockfile
pnpm --workspace-concurrency=1 -r --if-present build
node apps/cli/dist/index.js compile tools/vertical-slice/sample.md ./output.pptx
node apps/cli/dist/index.js qa tools/vertical-slice/sample.md ./output.qa.json
node apps/cli/dist/index.js audit
```

输出使用新文件路径，保留已有成品。CLI 的 qa 是规则检查；PowerPoint 原生验收单独执行。

导入表格文档和应用参考主题：

```powershell
node apps/cli/dist/index.js compile ./report.docx ./report.pptx
node apps/cli/dist/index.js compile ./metrics.xlsx ./metrics.pptx
node apps/cli/dist/index.js compile ./outline.md ./branded.pptx --template ./reference.pptx
```

参考模板可以只有母版与版式、没有普通幻灯片。报告记录源文件 SHA256、主题选择、实际颜色/字体及回退警告。正文和表格的不可读对比度会阻断发布。PDF 与已有 PPTX 的全文导入尚未接通；旧稿文本编辑使用独立的受限编辑接口。详见 [本轮集成范围与证据](docs/integration-2026-10-24.md) 和 [上游追踪矩阵](upstream/integration-matrix-20261024.json)。

桌面工作台应由新构建的宿主启动。宿主为每次运行分配本地端口和随机会话密钥，并把授权交给 UI 与 sidecar；只访问未授权的本地 URL 无法操作接口。不要把会话密钥复制到日志或公开材料。

桌面左侧提供文档与参考 PPTX 文件选择器。文档支持 Markdown、TXT、DOCX、CSV、TSV、XLSX，每份最多 16 MiB；无法无损转换到编辑器的正文或表格会明确拒绝。原文件存为数据目录内的内容寻址副本，未编辑时直接编译该副本；编辑正文或章节标题后改用当前 Markdown。参考 PPTX 只应用主题配色和字体，正文、模板、偏好改变后必须重新生成。项目格式 1.1.0 保存导入文件摘要和绑定，仍可读取旧 1.0.0 项目。大纲每组显示 40 个章节，可翻组或按编号跳转。

生成报告的 `sourceLedger` 与 `compiledPageMap` 是独立版本化工件，记录来源到最终分页及 OOXML 对象的对应关系。数量按出现位置区分，表格保留行列上下文；引用遗漏、顺序变化或读回不符会阻断发布。行尾在 OOXML 段落编码中的规范化单独记录，不作源文件字节级版面保真承诺。接口、失败边界和项目格式见 [来源追踪与桌面导入](docs/source-tracing-and-imports.md)。

```powershell
# 先完成上方工作区构建，再使用尚不存在的目标目录
node tools/packager/pack-desktop.mjs --skip-build --out ./release/PresentationOS-local-candidate
.\release\PresentationOS-local-candidate\PresentationOS.exe
```

打包需要可用的 .NET、Node、FFmpeg/FFprobe，并会收集对应运行依赖与许可材料。WebView2、PowerPoint 与语音引擎的外部要求仍需核对；生成包本身不等于安装或干净机验收通过。

## 可复现检查

```powershell
pnpm test:node
pnpm --workspace-concurrency=1 -r --if-present test
node --test tools/docs-auditor/*.test.mjs tools/packager/generate-sbom.test.mjs
node tools/docs-auditor/audit-docs.mjs
node tools/packager/generate-sbom.mjs --output-dir ./evidence/security-new-run
```

安全命令要求目标目录尚不存在，保留原始命令、输出、退出码、锁文件哈希与清单。PASS_SCOPED 仅表示记录中的 npm/文本检查范围通过，不是最终发行认证。查询出错、出现告警、未知许可或密钥模式命中会失败。未安装的跨平台可选包、开发依赖许可证、NuGet、运行时和分发二进制不在 npm 许可认证范围内。

## 状态与验收

版本以根 package.json 为唯一产品版本来源，状态以 [project_state](state/project_state.json)、[backlog](state/backlog.json)、[blockers](state/blockers.json) 和 [交接文档](docs/交接文档.md) 记录。历史证据保留供追溯；旧成品、模拟测试、控件字符串或规则分数不能直接提升为完整功能验收。

进入正式发布前，还需要源码与二进制绑定的原生打开/保存/关闭/重开/PDF与PNG导出、字体/修复对话框/进程残留检查、最终 EXE 的真实 UIA、安装升级卸载与干净机、安全许可处置。当前不作正式发布认证。

旁白可显式指定中文或英文的数量读法；默认只对含汉字的备注使用中文规则，其它备注保留原语言数值，不自动选择或安装语音。实际语音依赖已安装的 Windows voice，技术同步通过不代表听感和语义审核通过，见 [媒体接口与边界](kernel/media-pipeline/README.md)。

## License

项目代码采用 [MIT License](LICENSE)。第三方运行时、字体、素材及分发二进制适用各自许可，需在具体发行范围内核查。
