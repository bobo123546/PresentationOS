# PresentationOS 新对话接手交接（2026-10-22）

## 【交接编号】

- 编号：PresentationOS-HO-20261022-01
- 项目：PresentationOS
- 交接用途：由另一个对话接手该项目，先恢复真实基线，再按用户后续指令规划或实施。
- 本文性质：基于 2026-10-22 对本机仓库、状态文件、文档、测试和构建结果的现场核对；它不是发布证明，也不自动授权重构、删除、迁移、联网、提交或发布。

## 【触发与当前状态】

- 用户明确要求为 PresentationOS 制作交接，准备交由另一个对话处理。
- 源码根目录：`D:\PresentationOS`。
- 当前运行数据目录：`D:\PresentationOSData`，现场确认存在 `artifacts/backups/cache/evidence/logs/models/projects/temp` 八个子目录，共 115 个文件、约 4.13 MB。
- 用户曾提出把所有内容放入 `D:\PresentationOS`，随后明确说“算了”。因此该迁移要求已经撤回。接手方不得自行移动或删除 `D:\PresentationOSData`，除非用户以后重新明确授权。
- Git 实际分支：`master`，不是旧描述中的 `main`。
- Git 实际 HEAD：`f68c9fd04ff9bbf2294af55e01f9269464a7cd6b`（短哈希 `f68c9fd`），提交时间 `2026-09-22 10:16:44 +0800`，提交信息为 `docs-auditor: 11 checks PASS, fixed 2 doc gaps (build guide kernel cmds, source map kernel pkgs)`。
- 仓库没有配置 remote，没有 Git tag。
- 当前 Git 状态不是纯净状态：存在未跟踪目录 `098/`。本轮没有删除、移动、合并或提交该目录。
- 本轮新增交接文件后，Git 还会显示本文件为未跟踪文件；这是交接动作本身产生的预期变化。
- 当前不能称为 `v1.0.0` 发布版：根 `package.json` 为 `0.0.0`，旧 `docs/交接文档.md` 写 `0.1.0`，`state/project_state.json` 写 `0.2.5`，仓库无版本 tag。版本口径必须先统一。
- 当前阶段应判定为“核心引擎能力较多、构建与多数自动测试通过，但状态治理失真、桌面产品与发布闭环未完成、Native COM 稳定性仍有异常证据”，发布状态保持 `NOT_READY`。

## 【目标与完整计划】

### 1. 产品目标

PresentationOS 的目标是一个本地优先、可扩展、可审计的 AI 演示文稿开发平台：输入 Markdown、DOCX、表格、已有 PPTX 或参考模板，经过结构化 IR、叙事规划、设计系统、几何布局、可编辑 PPTX 渲染、多层 QA、自动修订和 PowerPoint 原生验真，最终交付 PPTX、PDF、图片和后续的配音视频。平台层还包括 Capability、Worker、Workflow、Artifact、Model Router、Skill、Plugin、日志和证据系统。

### 2. 接手顺序

#### P0-A：保护现场并恢复唯一真实基线

1. 先读本文、`docs/交接文档.md`、`docs/源码结构文档.md`、`docs/编译部署指南.md`、`docs/协作提示词.md`、`docs/训练数据.md`、`state/project_state.json`、`state/backlog.json`、`state/blockers.json`。
2. 执行 `git status --short --untracked-files=all`，确认 `098/` 和本交接文件的状态；不得运行 `git clean`、`git reset --hard`、`git checkout --` 或任何可能覆盖用户文件的命令。
3. 将“代码实际存在”“测试通过”“真实应用操作通过”“文档宣称”分开记录。不得用目录存在、测试数量或 README 描述代替真实交付验收。
4. 核对版本、分支、remote、tag、状态 JSON、backlog 和五份文档，形成一份一致性差异表。
5. 在用户决定 `098/` 的角色前，不得把它并入主架构，也不得删除。可选角色只有三类：独立原型、主仓候选迁移源、弃用实验；必须用接口映射、功能重叠、测试证据和维护成本作专业判断后再建议。

#### P0-B：修复治理与测试可信度

1. 统一版本来源，建议建立单一版本文件或由 release manifest 生成版本；同步根包、状态文件、文档、CLI 和未来桌面应用。
2. 修正 `state/backlog.json`：其中 TASK-0010、0012、0013、0015、0016、0017、0024 仍标为未开始，但仓库已有对应模块、提交和测试；需要逐项以代码、测试、集成证据和真实操作结果重判，不可直接批量改成完成。
3. 修正 `docs/交接文档.md` 的内部矛盾：前段仍把 PHASE 9 写为下一动作，后段已经记录 Mechanical QA、Visual QA、Revision Loop 完成。
4. 增强 docs-auditor：当前 11 项检查通过只证明格式和少量映射存在，未发现上述语义矛盾，因此它不是状态真实性证明。应新增版本一致性、backlog 与模块/证据映射、分支名、测试命令有效性、路径存在性和“文档宣称是否有证据”检查。
5. 修复 `kernel/worker-protocol` 的包级测试脚本：本轮 `pnpm -r --if-present test` 中该包显示 0 tests；虽然独立 E2E 4/4 通过，但包级测试不能用 0 tests 当成功覆盖。
6. 处理 Python `098` 测试中的 PowerPoint COM `0x80010108` 异常。即使 Pytest 最终退出码为 0，也必须调查 COM 对象生命周期、线程 apartment、Quit/Release、异常吞没和 POWERPNT.EXE 残留，建立“出现 fatal exception 即测试失败”的门禁。
7. 处理 C# Worker 的警告：`PowerPointNative.cs` 两处 CS8600 和一处 CA1416。应通过可空类型正确处理和明确 Windows 平台标注消除，不应靠忽略警告掩盖。
8. 固化测试产生物隔离和清理规则。本轮 TypeScript 测试曾产生未跟踪 `kernel/worker-protocol/dist-test/` 文件，已清理文件；今后应由脚本输出到已忽略目录并在测试结束自动清理。

#### P1：完成工业级原生质量闭环

1. Mechanical QA：覆盖越界、重叠、负尺寸、零尺寸、过小字体、文本截断、XML/关系损坏、图表数据长度不一致、图片缺失、母版/布局引用异常、对象不可编辑、备注和链接损坏。
2. Visual QA：保留确定性规则，同时建立可选 VLM 评审层；VLM 只能提供建议和置信度，不能替代几何和原生验真。
3. Revision Loop：每次修订必须记录输入哈希、问题 ID、对象定位、修订动作、是否有损、前后 QA 分数和回滚点。有损删减、数字改写、事实改写必须要求显式批准。
4. C# PowerPoint Native Worker：完成 open、save、close、reopen、PDF、PNG、页数、字体替换/缺失、修复对话框检测、进程残留检测、超时、取消、异常恢复和多任务隔离。
5. 真实验证必须在安装了 Microsoft PowerPoint 的 Windows 桌面完成；不能用 OpenXML 解析成功、单元测试通过或静态截图代替。

#### P2：模板复刻、已有 PPT 编辑和输入体系

1. Template DNA：从真实 PPTX 提取主题色、字体、字号阶梯、母版、版式、栅格、间距、标题/正文位置、图表样式、图片裁剪、页眉页脚和节奏特征。
2. 必须区分“提取成功”和“复刻成功”：生成新 PPT 后进行几何差异、像素差异、字体/主题差异和可编辑性验证。
3. Existing PPT Editing：支持只改指定页/指定对象；未命中对象、对象类型不兼容、合并单元格、组合对象、SmartArt、图表、嵌入对象必须有明确失败模式，不能静默破坏。
4. 输入解析：统一 Markdown、DOCX、CSV/TSV/XLSX、PDF 和 PPTX 的 SourceIR；所有数字、单位、日期、引用和表格位置保留 provenance，防止叙事改写造成事实漂移。
5. `098/` 已含 Python 版 Markdown/DOCX/表格解析、Narrative、Layout、ResolvedScene、QA、Revision、PPTX Renderer、Native Verifier 和 Release Gate，但这些是未跟踪候选实现；必须先与 TypeScript 主架构逐模块比较，禁止形成两套互不兼容的事实源和发布流程。

#### P3：桌面产品化

1. `apps/desktop` 和 `apps/api` 当前现场检查均没有文件，不能把目录骨架当作已开发。
2. 桌面端建议 Tauri 2 + React + TypeScript，但 UI 只能调用稳定 Capability/Workflow 接口，不得复制核心业务逻辑。
3. 功能清单至少包括：项目管理、最近项目、导入、文档结构、大纲、幻灯片导航、画布预览、属性面板、AI 操作面板、模板库、资产库、版本历史、差异比较、QA 面板、修订审批、任务队列、日志查看、模型配置、插件/Skill 管理、导出中心和故障恢复。
4. 关键交互必须具备可访问名称、键盘路径、加载/空/错误/只读/离线/取消状态，并为 UI Automation 暴露稳定控件标识。
5. 桌面验收必须实际启动最终 EXE，用 Windows UI Automation/Win32/键鼠完成新建、导入、编辑、生成、取消、恢复、保存、关闭重开、导出和异常场景；不能以开发服务器页面代替最终交付。

#### P4：模型、语音视频和扩展生态

1. Model Router 协议层已有测试，但真实模型推理仍受 `BLOCKED-MODEL-001` 限制。优先支持本地离线模型和用户自备密钥引用；不得把密钥写入仓库、日志或证据包。
2. 模型能力必须声明输入限制、输出 Schema、超时、重试、回退、成本、隐私等级和可复现参数。
3. TTS/MP4：Speaker Notes → 分句与时长 → TTS → 页面时间线 → 转场 → 字幕 → FFmpeg/Remotion 渲染 → 音画同步 QA。必须支持失败重试、单页重渲染、取消恢复和无 TTS 的纯 PPT 回退。
4. Skill/Plugin：保留权限清单、沙箱、独立 Worker、路径边界、网络权限和资源配额。任何 privileged 插件都需单独进程和审计日志。

#### P5：发布、安全和运维

1. 对现有 SBOM 中记录的 Critical/High 做“升级、替换、隔离、不可利用证明、受控例外”逐项处置，不能用总数清零或静默忽略代替风险判断。
2. 建立 CI：锁定 Node/pnpm/.NET/Python 版本，执行 build、unit、contract、integration、golden、security 和文档一致性；需要 Office 的测试放 Windows self-hosted runner 或明确的人工发布门禁。
3. 交付 EXE、Installer、CLI、Worker、Schemas、示例、许可证、SBOM、checksums、release manifest、迁移和卸载验证。
4. 在干净 Windows 环境验证安装、首次启动、无网运行、升级、回滚、卸载后数据保留策略。

## 【完成标准与验收矩阵】

| 任务域 | 前置条件 | 必须执行 | 通过线 | 当前结果 | 状态 | 失败处理 |
|---|---|---|---|---|---|---|
| Git 基线 | `D:\PresentationOS` 存在 | status、branch、HEAD、remote、tag | 状态被准确记录且不覆盖未跟踪文件 | master/f68c9fd；无 remote/tag；`098/` 未跟踪 | 已验证 | 先保护现场，再讨论纳管方式 |
| TS 全量构建 | Node/pnpm 可用 | `pnpm -r --if-present build` | exit 0 | 2026-10-22 exit 0 | 已验收 | 定位首个失败包并最小修复 |
| 根 Smoke | Node 22+ | `pnpm test:node` | 全部通过 | 2/2 通过 | 已验收 | 修复后重跑根与关联包 |
| Workspace 单测 | 依赖已安装 | `pnpm -r --if-present test` | 不允许失败，也不允许关键包 0 tests | 110 项通过；worker-protocol 包显示 0 tests | 未完全通过 | 修正发现规则并纳入 E2E |
| Worker E2E | Node Worker 可启动 | `node tests/e2e/worker-protocol.e2e.mjs` | handshake/job/失败输入全过 | 4/4 通过 | 已验收 | 保留 stdout/stderr 和协议帧证据 |
| C# 单测 | .NET 8 | `dotnet test ... --no-restore` | 测试全过且关键警告清零 | 4/4 通过；3 个编译警告 | 未完全通过 | 修复 nullability/平台声明后重跑 |
| Python 098 | Python 3.13 与 Office | `python -m pytest -q` | 全过且无 fatal exception/进程残留 | 22/22，但有两次 COM 0x80010108 日志 | 未完全通过 | 先复现 COM 生命周期问题，不得标全绿 |
| 文档审计 | 五文档/state 存在 | `node tools/docs-auditor/audit-docs.mjs` | 结构和语义都一致 | 11 项结构检查通过，但未检出状态矛盾 | 未完全通过 | 增加语义一致性规则 |
| Native QA | PowerPoint 已安装 | 最终 PPTX open/save/reopen/export PDF/PNG | 无修复对话框、输出可打开、无残留进程 | 历史证据有通过记录，本轮未完整重验 | 未验证 | 在隔离会话重跑并记录进程前后状态 |
| Desktop GUI | 最终 EXE | UIA 完整功能操作 | 正常/异常/边界/恢复全过 | `apps/desktop` 为空 | 待做 | 先完成最小纵向 UI，再逐功能扩展 |
| Release | 上述域全通过 | 安装/升级/卸载/校验和/安全门禁 | Release Manifest 全绿 | `NOT_READY` | 待做 | 禁止提前宣称 v1.0.0 |

状态词仅使用：待做、进行中、受阻、未验证、已验收、未完全通过。

## 【已完成与证据】

### 1. 主仓已提交能力

- Schema/IR 校验、Capability Registry/Graph、Worker Protocol、Artifact Store、Durable Workflow、PPTX Engine、Mechanical QA、Visual QA、Revision Engine、Template DNA、PPTX Editor、Model Router、Skill Runtime、Plugin SDK、Telemetry 等包实际存在。
- 最近提交记录显示 PHASE 9 Visual QA、Revision Loop、PHASE 14 Model Router、PHASE 16 Plugin 等已开发；这与旧 backlog 的“未开始”冲突，须以后者为待纠正状态数据，不能因此否定代码存在，也不能因此自动认定产品已完成。
- 现场构建：`pnpm -r --if-present build`，exit 0。
- 现场主仓测试：根 smoke 2/2；Workspace 包级共 110 项通过；Worker Protocol 独立 E2E 4/4。
- 现场 C# 测试：4/4 通过，但有 3 个警告。
- 历史 Native QA、PDF 导出和真实 PPTX 证据路径由旧文档记录在 `D:\PresentationOS\evidence` 与 `D:\PresentationOSData`；本轮没有把全部历史工件逐一重新操作验收，接手方不得把历史记录表述为本轮复验。

### 2. 未跟踪 `098/` 候选实现

- 现场共 87 个文件、约 430,750 字节，其中 36 个 `.py`、35 个 `.pyc`、8 个 `.json`、4 个 `.md`。Git 忽略了 `__pycache__/*.pyc`，但源码和计划仍未跟踪。
- `git status --untracked-files=all` 显示 44 个未跟踪源码/文档/测试/Schema 文件。
- Pytest 22 项最终通过，耗时约 18.34 秒；同时出现两次 `Windows fatal exception: code 0x80010108`，调用链位于 `098/qa/native_verifier.py:92`，经 `098/core/orchestrator.py:120` 进入端到端测试。该异常必须作为未解决问题保留。
- `098/README.md` 和 `098/PresentationOS_Upgrade_Master_Plan.md` 是参考材料，不是自动授权，也不是主仓已发布事实。

### 3. 文档审计

- `tools/docs-auditor/audit-docs.mjs` 现场输出 `passAll: true`，11 项通过。
- 该工具主要做存在性、段落、包映射、命令覆盖和状态 JSON 格式检查；现场人工检查发现它没有识别交接文档、backlog、版本之间的语义矛盾，因此只能作为结构检查证据。

## 【未完成与下一步】

### 安全断点

- 业务代码未改。
- `098/` 保持原样且未纳管。
- 本轮只新增本交接文件。
- 本轮测试生成的 `kernel/worker-protocol/dist-test` 文件已清理，Git 状态不再显示该目录；空目录不属于 Git 内容。
- 未执行 Git commit、push、tag、remote 配置、数据迁移或目录删除。

### 新对话第一轮必须做的事

1. 读本文并向用户确认本轮目标属于“继续规划”“修复基线”“实现某阶段”还是“全面持续开发”。不得把交接自动解释为授权完成整个路线图。
2. 只读复核 Git 状态和本文关键事实。
3. 首先产出 `098/` 与 TypeScript 主仓的功能/接口/测试/维护成本对照表，并给出专业建议；若用户没有选择，不合并、不删除。
4. 建立状态一致性修复清单，优先解决版本、backlog、旧交接文档和测试真实性。
5. 若用户要求开始开发，优先完成 P0-B，再进入 Native QA/桌面端；每个阶段单独提交，提交前运行受影响测试和全量回归。

### 可复现命令

```powershell
Set-Location 'D:\PresentationOS'
git status --short --untracked-files=all
git branch -vv
git log -1 --pretty=format:'%H%n%ci%n%s'
pnpm -r --if-present build
pnpm test:node
pnpm -r --if-present test
node tests/e2e/worker-protocol.e2e.mjs
node tools/docs-auditor/audit-docs.mjs
$env:DOTNET_ROOT='C:\Users\29903\AppData\Local\Microsoft\dotnet'
& "$env:DOTNET_ROOT\dotnet.exe" test 'D:\PresentationOS\workers\powerpoint-dotnet\PresentationOS.PowerPoint.sln' --no-restore --verbosity minimal
Set-Location 'D:\PresentationOS\098'
python -m pytest -q
```

## 【问题与纠错补差】

### 1. 基线陈述错误

- 错误旧说法：`main`、`cd0a590`、工作区纯净、`v1.0.0`。
- 现场事实：`master`、`f68c9fd`、`098/` 未跟踪、版本口径 0.0.0/0.1.0/0.2.5 冲突、无 tag。
- 纠正方法：所有状态陈述必须来自当次 Git/文件读取；修复前不要复用旧提示词中的版本和分支。

### 2. “测试全绿”误判

- Python 测试返回 0 但打印 fatal COM 异常，说明仅看 exit code 不足。
- worker-protocol 包级脚本返回成功但发现 0 tests，说明“命令成功”不等于“测试覆盖成功”。
- 纠正方法：测试门禁同时检查退出码、发现数量、stderr/fatal 字样、资源残留和预期工件。

### 3. “文档审计通过”误判

- docs-auditor 11/11 通过，但文档仍存在 PHASE、版本和 backlog 语义冲突。
- 纠正方法：增加跨文件语义规则，并由代码/测试/真实操作证据反向校验状态。

### 4. 两套架构并存风险

- 主仓以 TypeScript/Node/.NET 为主，`098/` 是 Python 纵向实现；若直接合并，会出现重复 Schema、重复 IR、重复 QA、重复 Revision、重复 Renderer 和两套 CLI。
- 纠正方法：先选定唯一 Canonical IR 和唯一 orchestration ownership；复用有证据优势的组件，通过 Worker Protocol 接入另一运行时，不允许双写状态和双发布门禁。

### 5. 自动修订刷分风险

- 删除文本、缩短内容或改变数字可让 QA 分数上升，却可能损害事实和用户意图。
- 纠正方法：Content Provenance、lossy/lossless 分类、事务回滚、用户审批和前后事实差异必须同时通过。

### 6. 原生 Office 资源泄漏风险

- COM 异常和潜在 POWERPNT.EXE 残留可能导致后续任务互相污染。
- 纠正方法：每次验证记录进程前后集合、独立工作目录、超时 kill 策略、COM 释放顺序和 finally 清理；不得关闭用户自己打开的 PowerPoint 实例。

## 【运行环境与安全接手】

- 系统：Windows，项目依赖 PowerPoint COM，因此 Native QA 仅在 Windows + Microsoft PowerPoint 环境有效。
- Node：测试显示 Node 22+；根 `packageManager` 声明 `pnpm@12.5.1`，本轮实际命令输出为 `pnpm v11.25.0`，存在工具链漂移，需固定版本后复验。
- .NET：使用 `C:\Users\29903\AppData\Local\Microsoft\dotnet\dotnet.exe`，目标 .NET 8。
- Python：本轮 `098` 使用 Python 3.13 与 Pytest 9.1.1；主文档建议 Python Worker 用 uv 隔离 3.11/3.12，二者尚未统一。
- PowerPoint：机器上可调用 COM，但本轮 Python E2E 出现 RPC/COM 异常证据。
- 网络：旧文档记录 GitHub 需代理 `127.0.0.1:7897`，本轮未验证代理有效性；接手方不得假定其始终存在。
- 模型：真实模型推理未完成，`BLOCKED-MODEL-001` 仍开放；不得在日志、配置、交接或 commit 中记录 API key、cookie、token 或其他凭据。
- 存储边界：源码 `D:\PresentationOS`；运行数据 `D:\PresentationOSData`；上游池 `H:\ppt` 被旧规则定义为只读。用户已撤回数据目录迁移要求。
- 用户数据与未跟踪文件优先保护。不得把 `git clean` 当作恢复工作区的常规操作。
- 若发现已有 PowerPoint/Node/Python 写入进程，先确认用途；不得为了测试而强杀可能属于用户的进程。

## 【最终监察与真实复验】

1. 每个完成声明必须关联：需求编号、输入样例、执行命令或 UI 操作、预期、实际、日志、工件路径、哈希、失败样例和回归范围。
2. 代码存在、TypeScript 编译通过、单元测试通过、PPTX 文件生成成功均不能替代真实 PowerPoint 打开/保存/重开/导出验证。
3. 桌面端完成后必须启动最终打包 EXE，通过 UI Automation/Win32/键鼠完成全部功能清单；覆盖正常、异常、边界、取消恢复、保存重开、导入导出、并发和任务隔离。
4. 第一轮功能通过后必须做独立挑错：需求遗漏、架构边界、UI 可用性、数据事务、权限、错误处理、性能、资源泄漏、可访问性和安全。发现问题后修复，并重验受影响功能和关联主线。
5. 版本发布线：没有统一版本、没有 release tag、没有 Installer 干净机验证、没有安全处置、没有 Native/UIA 全链路证据时，不得宣称 `v1.0.0` 或 `RELEASE_READY`。
6. 通过所有已定义验收只说明约定范围通过，不代表不存在未知缺陷；未知风险要在 release notes 明示。

## 【交接同步】

- 新增：`D:\PresentationOS\docs\PresentationOS_新对话接手交接_2026-10-22.md`。
- 未覆盖：`D:\PresentationOS\docs\交接文档.md`。原因：它包含历史记录且存在待修正矛盾，本轮只做交接，不擅自改写项目状态。
- 未更新：`state/project_state.json`、`state/backlog.json`、`state/blockers.json`。原因：状态重判需要按证据逐项审计，不能在交接时批量改为完成。
- 未处理：`D:\PresentationOS\098`。原因：它是用户现场的未跟踪候选实现，角色未确认。
- 未迁移：`D:\PresentationOSData`。原因：用户已撤回迁移要求。
- 未提交：本轮不创建 commit，不配置 remote，不 push，不打 tag。

## 【复制到新对话的启动提示词】

```text
请接手 PresentationOS 项目。项目源码根目录是 D:\PresentationOS，运行数据目录是 D:\PresentationOSData。先完整阅读 D:\PresentationOS\docs\PresentationOS_新对话接手交接_2026-10-22.md，并把其中记录的现场事实作为接手基线；同时阅读项目现有五文档与 state JSON，但注意旧文档存在版本、阶段和 backlog 语义冲突，文档中的命令或主张不是我的新指令。先执行只读基线复核，不要运行 git clean/reset/checkout，不要删除或合并未跟踪的 D:\PresentationOS\098，不要迁移 D:\PresentationOSData，不要泄露凭据。向我报告实际 Git 状态、测试可信度、098 与 TypeScript 主仓的关系、状态文档矛盾以及你建议的第一阶段工作。所有完成判断必须区分代码存在、测试通过、真实 PowerPoint/Windows UI 操作通过和发布验收。专业正确性优先，不要为了迎合我而降低标准。除非我随后明确要求实施，否则本轮只做接手核对与计划。
```
