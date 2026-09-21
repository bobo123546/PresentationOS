# BUG-0002: Layout Engine 负尺寸导致 PowerPoint 打不开

- **状态**: FIXED
- **症状**: 内容页（5+ blocks 流式布局）生成的 PPTX 用 PowerPoint COM 打开报 `0x80070570`
- **版本**: pptx-engine 0.1.0
- **环境**: Windows 11, Microsoft PowerPoint 16.0
- **复现**: 5 个 text block，`height=0.2*innerH`，最后一块超出可用空间 → slide XML 中 `<a:ext cy="-109728"/>`（负高度）
- **Expected**: 所有 shape 尺寸为正
- **Actual**: 最后一块 `cy=-109728`（负高度）
- **日志**: 逐页二分 page-3.pptx 损坏、page-1/2/4 正常；解包 slide1.xml 见 `cy="-109728"`
- **Root Cause**: `resolveLayout` column 分支 `Math.min(size.h, available)` 在 available<0 时产生负高度；PptxGenJS 原样写入 EMU 负值，PowerPoint 判定文件损坏
- **Fix**: 流式排布（含子节点递归）尺寸 clamp 到 `>=0.05` 英寸
- **修改文件**: `kernel/pptx-engine/src/layout-engine.ts`
- **Targeted Test**: 完整 deck（4 页，含 5-block 页）→ PowerPoint QA ok=true, slideCount=4, pdfSize=171693
- **Regression Test**: pptx-engine 4/4 PASS；Vertical Slice E2E PASS
