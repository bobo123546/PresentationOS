# -*- coding: utf-8 -*-
import io
p = r'D:\PresentationOS\kernel\revision-engine\src\apply.ts'
s = io.open(p, encoding='utf-8').read()
a = u"changes.push({ slide: idx + 1, action: 'split', detail: '跳过：该页仅有 1 个块，无法拆页' });"
b = u"changes.push({ slide: String(idx + 1), action: 'split', detail: '跳过：该页仅有 1 个块，无法拆页' });"
assert a in s, 'A not found'
s = s.replace(a, b)
c = u"changes.push({ slide: idx + 1, action: 'split', detail: `拆为 ${mid} + ${secondHalf.length} 块` });"
d = u"changes.push({ slide: String(idx + 1), action: 'split', detail: `拆为 ${mid} + ${secondHalf.length} 块` });"
assert c in s, 'C not found'
s = s.replace(c, d)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('fixed2 ok')
