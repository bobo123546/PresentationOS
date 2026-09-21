# -*- coding: utf-8 -*-
import io, sys

# 1) 编译部署指南：追加本轮真实命令
p = r'D:\PresentationOS\docs\编译部署指南.md'
s = io.open(p, encoding='utf-8').read()
addition = u'''

## PHASE 9-15 实测命令（2026-09-21）
- Mechanical QA: pnpm -C kernel/mechanical-qa test （7/7）
- C# Worker 构建/测试: 需 $env:DOTNET_ROOT='C:/Users/29903/AppData/Local/Microsoft/dotnet'; dotnet build workers/powerpoint-dotnet/PresentationOS.PowerPoint.sln -c Release; dotnet test
- C# Worker 运行: 管道喂 JSON（注意 PS 5.1 会加 BOM，Worker 已兼容）
- Template DNA: pnpm -C kernel/template-dna test; node tools/template-dna/extract-dna.mjs <pptx> <out.json>
- PPTX 编辑: pnpm -C kernel/pptx-editor test; node tools/pptx-editor/edit-demo.mjs <in> <out>
- Reference Reconstruction: node tools/reference-reconstruction/reconstruct.mjs <ref.pptx> <in.md> <out.pptx>
- Skill 编译/执行: node tools/skill-compiler/compile.mjs <skill-dir>; node <skill>/<name>.skill.mjs --markdownPath <md> --output <pptx> --reference <ref.pptx>
- 全部 PowerPoint Native QA: 通过 C# Worker capabilityId=powerpoint.qa 或 tools/vertical-slice/qa-powerpoint.ps1
'''
if 'PHASE 9-15' not in s:
    s += addition
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('编译部署指南 updated')

# 2) 训练数据：追加 Golden Case
p2 = r'D:\PresentationOS\docs\训练数据.md'
s2 = io.open(p2, encoding='utf-8').read()
case = u'''
## Golden Cases 2026-09-21
| case_id | input | expected | actual | model/workflow | QA |
|---|---|---|---|---|---|
| G-009 | 4页MD | 可编辑PPTX 4页 | slideCount=4 pdfSize=171693 | md-to-deck + PptxGenJS + PowerPoint COM | PASS |
| G-010 | 参考deck.pptx+新MD | 视觉继承参考(DNA) | accent=2563EB font=Segoe UI, 4页 | reconstruct.mjs + PowerPoint COM | PASS |
| G-011 | deck.pptx 第3页标题替换 | 仅第3页变化 | 4页, pdfSize 171693->175443 | pptx-editor + PowerPoint COM | PASS |
| G-012 | skill md-to-pptx 编译执行 | 自包含skill产出PPTX | ok=true, 4页 | skill-compiler + runtime + PowerPoint COM | PASS |
'''
if 'G-009' not in s2:
    s2 += case
io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('训练数据 updated')

# 3) 源码结构文档：追加新模块
p3 = r'D:\PresentationOS\docs\源码结构文档.md'
s3 = io.open(p3, encoding='utf-8').read()
mods = u'''
## 新增模块（PHASE 9-15）
- kernel/mechanical-qa：@pres/mechanical-qa —— runMechanicalQa（负尺寸/溢出/重叠/XML/空文本/图表一致性）
- kernel/template-dna：@pres/template-dna —— extractTemplateDna（colors/fonts/titlePositions/masters/layouts）
- kernel/pptx-editor：@pres/pptx-editor —— editPptx（OOXML 最小编辑，仅改目标页）
- kernel/pptx-engine renderer：RenderOptions.dna（accent/fontFamily 注入）
- kernel/skill-runtime：@pres/skill-runtime —— parseSkill/loadSkill/validateInputs/runSkill（capability deck.render）
- tools/skill-compiler/compile.mjs：skill.yaml+SKILL.md -> <name>.skill.mjs 自包含可执行
- tools/reference-reconstruction/reconstruct.mjs：参考PPTX -> DNA -> 渲染
- workers/powerpoint-dotnet/src/PresentationOS.PowerPoint/Program.cs + PowerPointNative.cs：stdio JSON Lines Worker，capability powerpoint.qa
- skills/md-to-pptx/：示例 Skill（skill.yaml + SKILL.md + 编译产物）
'''
if 'kernel/mechanical-qa' not in s3:
    s3 += mods
io.open(p3, 'w', encoding='utf-8', newline='').write(s3)
print('源码结构文档 updated')
