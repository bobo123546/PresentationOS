# -*- coding: utf-8 -*-
import io

p = r'D:\PresentationOS\docs\交接文档.md'
s = io.open(p, encoding='utf-8').read()
marker = 'PHASE 9（续）：Visual QA 确定性规则版'
i = s.find(marker)
assert i >= 0, 'marker not found'
line_end = s.find('\n', i)
addition = u'''
- 2026-09-21 PHASE 9（续）：Revision Loop 闭环完成（kernel/revision-engine 10/10）——split/reduce_text/increase_font/fix_contrast/increase_margin/add_visual 规则修订；pptx-engine 支持 block.fontScale/color。集成 tools/revision-loop/loop-deck.mjs：坏 deck 89 分（密度+节奏问题）→ 自动修订 → 100 分 0 issues；渲染 Mechanical QA PASS + PowerPoint Native QA PASS（4 页 pdfSize 168127）。至此核心垂直链路 md → DeckSpec → QA → 自动修订 → 渲染 → Native QA 全通。'''
s = s[:line_end] + addition + s[line_end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('交接文档 updated')

p3 = r'D:\PresentationOS\docs\源码结构文档.md'
s3 = io.open(p3, encoding='utf-8').read()
if 'kernel/revision-engine' not in s3:
    s3 += u'''
- kernel/revision-engine：@pres/revision-engine —— apply.ts（规则修订：split/reduce_text/increase_font/fix_contrast/increase_margin/add_visual，含去重/越界防护）
- tools/revision-loop/loop-deck.mjs：md → Visual QA → applyRevisions 迭代（≤3 轮）→ 渲染 → Mechanical QA → 报告
- pptx-engine renderer：SlideBlock 新增 fontScale/color（Revision 输出可真实渲染）
'''
    io.open(p3, 'w', encoding='utf-8', newline='').write(s3)
print('源码结构 updated')

p4 = r'D:\PresentationOS\docs\编译部署指南.md'
s4 = io.open(p4, encoding='utf-8').read()
if 'Revision Loop' not in s4:
    s4 += u'''
- Revision Loop: pnpm -C kernel/revision-engine test （10/10）; node tools/revision-loop/loop-deck.mjs <in.md> <out.pptx> [report.json]
'''
    io.open(p4, 'w', encoding='utf-8', newline='').write(s4)
print('编译部署 updated')

p2 = r'D:\PresentationOS\docs\训练数据.md'
s2 = io.open(p2, encoding='utf-8').read()
if 'G-019' not in s2:
    s2 += u'''
| G-019 | 坏 deck（720字符+3连content） | 自动修订至无问题 | 89 -> 100, reduce_text+add_visual, 4页 | revision-engine loop | PASS |
| G-020 | loop-out.pptx | PowerPoint 原生打开导出 | slideCount=4 pdfSize=168127 | revision-loop + COM | PASS |
'''
    io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('训练数据 updated')

p5 = r'C:\Users\29903\Downloads\PresentationOS_从零到最终交付_工程实施与持续自治总方案.md'
s5 = io.open(p5, encoding='utf-8').read()
m5 = '- 下一任务：PHASE 9 Revision Loop 自动修订器 / PHASE 13 完整重建 / PHASE 17 Desktop GUI。'
if m5 not in s5:
    i5 = s5.find('下一任务：PHASE 9 Revision Loop')
    m5 = s5[i5:s5.find('\n', i5) + 1]
add5 = u'''\n- 2026-09-21 追加：PHASE 9 Revision Loop 完成（revision-engine 10/10 + loop-deck.mjs 闭环：坏 deck 89->100、Mechanical + PowerPoint Native QA PASS）。核心垂直链路 md->DeckSpec->QA->自动修订->渲染->Native QA 全通。project_version 0.2.4。证据：evidence/revision-loop。
- 下一任务：PHASE 17 Desktop GUI（Tauri 2 + React）/ PHASE 13 完整重建（需模型）。'''
if 'PHASE 9 Revision Loop 完成' not in s5:
    s5 = s5.replace(m5, m5 + add5, 1) if m5 in s5 else s5 + add5
io.open(p5, 'w', encoding='utf-8', newline='').write(s5)
print('总方案 updated')
