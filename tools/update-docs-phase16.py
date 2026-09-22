# -*- coding: utf-8 -*-
import io

# 1) 交接文档：追加阶段日志
p = r'D:\PresentationOS\docs\交接文档.md'
s = io.open(p, encoding='utf-8').read()
old = '- 2026-09-21 PHASE 15：Skill DSL/Runtime（7/7）+ Skill Compiler（-> 自包含 .skill.mjs）+ 示例 skill md-to-pptx -> 编译执行 -> PowerPoint Native QA PASS（修复 REPO_ROOT 定位：按 package.json name 上溯）。'
new = old + u'''
- 2026-09-21 PHASE 16：Plugin System（kernel/plugin-sdk 20/20）——Safe Plugin（node:vm 受限沙箱 + 权限门：未声明权限不可用、路径逃逸拒绝）+ Privileged Plugin（独立 Worker，stdio JSON Lines 与 worker-protocol 一致）+ Permission Manifest（8 权限显式声明校验）。示例：plain-text-tools（safe）、echo-worker（privileged）。修复：vm 不支持 export（约定顶层 async run）、vm realm 数组原型致 deepStrictEqual 误判（改 JSON 比较）。'''
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('交接文档 updated')

# 2) 源码结构文档
p3 = r'D:\PresentationOS\docs\源码结构文档.md'
s3 = io.open(p3, encoding='utf-8').read()
mods = u'''
- kernel/plugin-sdk：@pres/plugin-sdk —— manifest.ts（plugin.yaml 校验，Permission Manifest 8 权限）/ safe-runtime.ts（vm 受限沙箱，权限门+路径逃逸防护）/ privileged.ts（独立 Worker，stdio JSON Lines）/ registry.ts（PluginRegistry 注册与调用）；examples/{plain-text-tools,echo-worker}
'''
if 'kernel/plugin-sdk' not in s3:
    s3 += mods
io.open(p3, 'w', encoding='utf-8', newline='').write(s3)
print('源码结构文档 updated')

# 3) 编译部署指南
p4 = r'D:\PresentationOS\docs\编译部署指南.md'
s4 = io.open(p4, encoding='utf-8').read()
add = u'''
- Plugin SDK: pnpm -C kernel/plugin-sdk install; pnpm -C kernel/plugin-sdk test （20/20）; pnpm -C kernel/plugin-sdk build
'''
if 'Plugin SDK' not in s4:
    s4 += add
io.open(p4, 'w', encoding='utf-8', newline='').write(s4)
print('编译部署指南 updated')

# 4) 训练数据
p2 = r'D:\PresentationOS\docs\训练数据.md'
s2 = io.open(p2, encoding='utf-8').read()
case = u'''
| G-013 | safe 插件 plain-text-tools（filesystem.read） | 提取标题/词数 | headings=[标题一,标题二] wordCount=6 | plugin-sdk vm 沙箱 | PASS |
| G-014 | privileged 插件 echo-worker | stdio 协议回显 | echo=你好 capabilityId=plugin.demo.echo | plugin-sdk + worker-protocol | PASS |
'''
if 'G-013' not in s2:
    s2 += case
io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('训练数据 updated')

# 5) 总方案进度
p5 = r'C:\Users\29903\Downloads\PresentationOS_从零到最终交付_工程实施与持续自治总方案.md'
s5 = io.open(p5, encoding='utf-8').read()
old5 = '- 下一任务：PHASE 16 Plugin SDK / PHASE 14 Model Router / PHASE 9 Visual QA+Revision。'
new5 = old5 + u'''
- 2026-09-21 追加：PHASE 16 Plugin System 完成（plugin-sdk 20/20：Safe vm 沙箱+权限门+路径逃逸拒绝 / Privileged 独立 Worker stdio 协议 / Permission Manifest 8 权限校验；示例 plain-text-tools + echo-worker）。project_version 0.2.1，current_phase PHASE_16。证据：evidence/plugin-sdk。
- 下一任务：PHASE 14 Model Router / PHASE 9 Visual QA+Revision。'''
assert old5 in s5
s5 = s5.replace(old5, new5)
io.open(p5, 'w', encoding='utf-8', newline='').write(s5)
print('总方案 updated')
