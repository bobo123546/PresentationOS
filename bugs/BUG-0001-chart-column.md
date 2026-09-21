# BUG-0001: PptxGenJS 'column' 图表类型生成 PowerPoint 打不开的 PPTX

- **状态**: FIXED
- **症状**: 含 `chartType: 'column'` 的 PPTX 用 PowerPoint COM 打开报 `0x80070570 (The file or directory is corrupted and unreadable)`
- **版本**: pptx-engine 0.1.0 / pptxgenjs 3.12.0
- **环境**: Windows 11, Microsoft PowerPoint 16.0, Node 22.23.2
- **复现**: `renderDeck` 输出含 column 图表的 deck → `qa-powerpoint.ps1` 打开失败
- **Expected**: PowerPoint 正常打开
- **Actual**: 0x80070570
- **日志**: upstream/audits 相关 QA 输出；bisect 结果 `bisect-chart.pptx` FAIL
- **Root Cause**: PptxGenJS 的 ChartType 无 `column` 类型（有效：bar/line/pie/scatter 等）；传入无效类型导致 chart XML 非法
- **Fix**: renderer 中 `column`（垂直柱状）映射为 `bar`
- **修改文件**: `kernel/pptx-engine/src/renderer.ts`
- **Targeted Test**: bisect-all2.pptx（含 bar chart）→ PowerPoint QA ok=true
- **Regression Test**: pptx-engine 4/4、完整 Vertical Slice PASS
