# -*- coding: utf-8 -*-
import io

p = r'D:\PresentationOS\docs\交接文档.md'
s = io.open(p, encoding='utf-8').read()
marker = 'PHASE 15：Skill DSL/Runtime'
i = s.find(marker)
assert i >= 0, 'marker not found'
line_end = s.find('\n', i)
addition = u'''
- 2026-09-21 PHASE 16：Plugin System（kernel/plugin-sdk 20/20）——Safe Plugin（node:vm 受限沙箱 + 权限门：未声明权限不可用、路径逃逸拒绝）+ Privileged Plugin（独立 Worker，stdio JSON Lines 与 worker-protocol 一致）+ Permission Manifest（8 权限显式声明校验）。示例：plain-text-tools（safe）、echo-worker（privileged）。修复：vm 不支持 export（约定顶层 async run）、vm realm 数组原型致 deepStrictEqual 误判（改 JSON 比较）。'''
s = s[:line_end] + addition + s[line_end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('交接文档 updated')

# 总方案进度（容错定位）
p5 = r'C:\Users\29903\Downloads\PresentationOS_从零到最终交付_工程实施与持续自治总方案.md'
s5 = io.open(p5, encoding='utf-8').read()
m5 = '- 下一任务：PHASE 16 Plugin SDK / PHASE 14 Model Router / PHASE 9 Visual QA+Revision。'
if m5 not in s5:
    m5 = s5[s5.find('下一任务：PHASE 16'):]
    m5 = m5[:m5.find('\n') + 1]
add5 = u'''\n- 2026-09-21 追加：PHASE 16 Plugin System 完成（plugin-sdk 20/20：Safe vm 沙箱+权限门+路径逃逸拒绝 / Privileged 独立 Worker stdio 协议 / Permission Manifest 8 权限校验；示例 plain-text-tools + echo-worker）。project_version 0.2.1，current_phase PHASE_16。证据：evidence/plugin-sdk。
- 下一任务：PHASE 14 Model Router / PHASE 9 Visual QA+Revision。'''
if 'PHASE 16 Plugin System 完成' not in s5:
    s5 = s5.replace(m5, m5 + add5, 1) if m5 in s5 else s5 + add5
io.open(p5, 'w', encoding='utf-8', newline='').write(s5)
print('总方案 updated')
