<!-- presentationos-current {"version":"0.1.2-alpha","phase":"PHASE_9_IN_PROGRESS","release_status":"NOT_READY","active_task":"TASK-0010"} -->
# PresentationOS

当前状态：0.1.2-alpha；PHASE_9_IN_PROGRESS；NOT_READY。当前任务 TASK-0010。

PresentationOS 是一个正在开发的演示文稿生成、编辑与验证平台。当前重点是从输入材料生成可编辑 PPTX，检查输出内容和布局，并把原生 PowerPoint 验证纳入交付流程。项目仍处于 alpha，使用前请核对各条验证记录的输入、范围与时间。

[![CI](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml/badge.svg)](https://github.com/bobo123546/PresentationOS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 现有实现与验证边界

| 模块 | 已有实现 | 当前边界 |
|---|---|---|
| CLI / Workflow | compile、qa、audit，Markdown 解析、排版与工件生成 | 内容与数值回归修复中；任意输入需要独立检查 |
| PPTX Engine | 文本、表格、图形与多个排版原型；领域配色与规则分类 | 领域模板是排版配置，不能代替专业内容审核；复杂内容应拆页 |
| 内容检查 | 从实际生成 PPTX 读取文本，与输入期望核对 | 文本存在检查不能证明事实本身真实，也不能代替视觉与原生验收 |
| Template DNA / OOXML 编辑 | 提取样式、目标文本 Run 编辑与未修改部件哈希比较 | 复杂母版、图表、动画与任意 PPT 的编辑保真尚未完成矩阵验收 |
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

桌面工作台应由新构建的宿主启动。宿主为每次运行分配本地端口和随机会话密钥，并把授权交给 UI 与 sidecar；只访问未授权的本地 URL 无法操作接口。不要把会话密钥复制到日志或公开材料。

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

## License

项目代码采用 [MIT License](LICENSE)。第三方运行时、字体、素材及分发二进制适用各自许可，需在具体发行范围内核查。
