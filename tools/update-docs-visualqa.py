# -*- coding: utf-8 -*-
import io

p = r'D:\PresentationOS\docs\交接文档.md'
s = io.open(p, encoding='utf-8').read()
marker = 'PHASE 14：Model Router'
i = s.find(marker)
assert i >= 0, 'marker not found'
line_end = s.find('\n', i)
addition = u'''
- 2026-09-21 PHASE 9（续）：Visual QA 确定性规则版（kernel/visual-qa 11/11）——密度/字号层级/对比度(WCAG)/重叠(>20%)/留白(>85%)/节奏(连续3页同版式) + 0-100 评分 + Revision 建议（split/reduce_text/increase_font/fix_contrast/increase_margin/add_visual）。集成 tools/visual-qa/qa-deck.mjs：真实 deck overall=96、识别 2-4 页版式单一。VLM 审美评审待模型接入后叠加。'''
s = s[:line_end] + addition + s[line_end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('交接文档 updated')

p3 = r'D:\PresentationOS\docs\源码结构文档.md'
s3 = io.open(p3, encoding='utf-8').read()
if 'kernel/visual-qa' not in s3:
    s3 += u'''
- kernel/visual-qa：@pres/visual-qa —— rules.ts（确定性审美规则）/ score.ts（0-100 评分+revision 建议）；tools/visual-qa/qa-deck.mjs（DeckSpec->QaSlide->报告）
'''
    io.open(p3, 'w', encoding='utf-8', newline='').write(s3)
print('源码结构 updated')

p4 = r'D:\PresentationOS\docs\编译部署指南.md'
s4 = io.open(p4, encoding='utf-8').read()
if 'Visual QA' not in s4:
    s4 += u'''
- Visual QA: pnpm -C kernel/visual-qa test （11/11）; node tools/visual-qa/qa-deck.mjs <deck.md> <out.json>
'''
    io.open(p4, 'w', encoding='utf-8', newline='').write(s4)
print('编译部署 updated')

p2 = r'D:\PresentationOS\docs\训练数据.md'
s2 = io.open(p2, encoding='utf-8').read()
if 'G-017' not in s2:
    s2 += u'''
| G-017 | 真实 deck（AI 内容工厂 4页） | Visual QA 评分+建议 | overall=96, rhythm 建议 add_visual | visual-qa 规则版 | PASS |
| G-018 | 构造坏 deck（1400字/低对比/重叠） | 低分+可执行修订 | overall<60, split/increase_font/fix_contrast | visual-qa | PASS |
'''
    io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('训练数据 updated')

p5 = r'C:\Users\29903\Downloads\PresentationOS_从零到最终交付_工程实施与持续自治总方案.md'
s5 = io.open(p5, encoding='utf-8').read()
m5 = '- 下一任务：PHASE 9 Visual QA + Revision Loop。'
if m5 not in s5:
    i5 = s5.find('下一任务：PHASE 9')
    m5 = s5[i5:s5.find('\n', i5) + 1]
add5 = u'''\n- 2026-09-21 追加：PHASE 9 Visual QA 完成（visual-qa 11/11 确定性规则版：密度/字号/对比度/重叠/留白/节奏评分 + revision 建议；真实 deck overall=96）。VLM 审美评审待模型接入。project_version 0.2.3。证据：evidence/visual-qa。
- 下一任务：PHASE 9 Revision Loop 自动修订器 / PHASE 13 完整重建 / PHASE 17 Desktop GUI。'''
if 'PHASE 9 Visual QA 完成' not in s5:
    s5 = s5.replace(m5, m5 + add5, 1) if m5 in s5 else s5 + add5
io.open(p5, 'w', encoding='utf-8', newline='').write(s5)
print('总方案 updated')
