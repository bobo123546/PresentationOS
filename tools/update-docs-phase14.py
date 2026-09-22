# -*- coding: utf-8 -*-
import io

p = r'D:\PresentationOS\docs\交接文档.md'
s = io.open(p, encoding='utf-8').read()
marker = 'PHASE 16：Plugin System'
i = s.find(marker)
assert i >= 0, 'marker not found'
line_end = s.find('\n', i)
addition = u'''
- 2026-09-21 PHASE 14：Model Router（kernel/model-router 15/15）——models.yaml 配置（provider/baseUrl/apiKeyRef env 引用/capabilities/local）+ routes 优先级 + OpenAI 兼容协议调用 + 超时 + 回退链。协议级集成用本地 mock OpenAI server 真实 HTTP 验证（主/回退/401/超时/Bearer 注入）。真实模型推理 BLOCKED-MODEL-001（无本地模型/无 API key，不伪造）。'''
s = s[:line_end] + addition + s[line_end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('交接文档 updated')

p3 = r'D:\PresentationOS\docs\源码结构文档.md'
s3 = io.open(p3, encoding='utf-8').read()
if 'kernel/model-router' not in s3:
    s3 += u'''
- kernel/model-router：@pres/model-router —— config.ts（models.yaml/routes 校验、apiKeyRef env 解析）/ providers.ts（OpenAI 兼容 chat completions，超时+错误分类）/ router.ts（ModelRouter：capability 候选+回退+decision）；examples/models.yaml
'''
    io.open(p3, 'w', encoding='utf-8', newline='').write(s3)
print('源码结构 updated')

p4 = r'D:\PresentationOS\docs\编译部署指南.md'
s4 = io.open(p4, encoding='utf-8').read()
if 'Model Router' not in s4:
    s4 += u'''
- Model Router: pnpm -C kernel/model-router install; pnpm -C kernel/model-router test （15/15）; pnpm -C kernel/model-router build。真实推理需在 kernel/model-router/examples/models.yaml 填 apiKeyRef（env:XXX）或装本地 Ollama 模型。
'''
    io.open(p4, 'w', encoding='utf-8', newline='').write(s4)
print('编译部署 updated')

p2 = r'D:\PresentationOS\docs\训练数据.md'
s2 = io.open(p2, encoding='utf-8').read()
if 'G-015' not in s2:
    s2 += u'''
| G-015 | mock OpenAI server 双模型 | 主失败自动回退备选 | final=m2 answer, fallbackUsed=true | model-router 回退链 | PASS |
| G-016 | mock 401 | 未授权识别不泄漏 key | errorType=UNAUTHORIZED | model-router | PASS |
'''
    io.open(p2, 'w', encoding='utf-8', newline='').write(s2)
print('训练数据 updated')

p5 = r'C:\Users\29903\Downloads\PresentationOS_从零到最终交付_工程实施与持续自治总方案.md'
s5 = io.open(p5, encoding='utf-8').read()
m5 = '- 下一任务：PHASE 14 Model Router / PHASE 9 Visual QA+Revision。'
if m5 not in s5:
    i5 = s5.find('下一任务：PHASE 14')
    m5 = s5[i5:s5.find('\n', i5) + 1]
add5 = u'''\n- 2026-09-21 追加：PHASE 14 Model Router 完成（model-router 15/15：配置校验+能力路由+OpenAI 兼容协议+超时+回退链；协议级集成本地 mock server 真实 HTTP 验证）。真实模型推理 BLOCKED-MODEL-001（无本地模型/无 API key）。project_version 0.2.2。证据：evidence/model-router。
- 下一任务：PHASE 9 Visual QA + Revision Loop。'''
if 'PHASE 14 Model Router 完成' not in s5:
    s5 = s5.replace(m5, m5 + add5, 1) if m5 in s5 else s5 + add5
io.open(p5, 'w', encoding='utf-8', newline='').write(s5)
print('总方案 updated')
