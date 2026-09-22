# -*- coding: utf-8 -*-
import io
p = r'D:\PresentationOS\kernel\revision-engine\src\apply.ts'
s = io.open(p, encoding='utf-8').read()
old = u"      const bg = slide.kind === 'content' || slide.kind === 'data' || slide.kind === 'summary' || slide.kind === 'quote' ? 'FFFFFF' : '111827';"
new = u"      const bg: string = slide.kind === 'content' || slide.kind === 'data' || slide.kind === 'summary' || slide.kind === 'quote' ? 'FFFFFF' : '111827';"
assert old in s, 'not found'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('fixed bg type')
