# -*- coding: utf-8 -*-
import io
p = r'D:\PresentationOS\kernel\revision-engine\src\apply.ts'
s = io.open(p, encoding='utf-8').read()
old = u"""      if (c < 3) {
        b.color = luminance(b.color) > 0.5 ? '111111' : 'FFFFFF';
        n++;
      }"""
new = u"""      if (c < 3) {
        // 背景亮 -> 深色字；背景暗 -> 白字
        const bgDark = bg === '111827' || bg === '1F2937';
        b.color = bgDark ? 'FFFFFF' : '111111';
        n++;
      }"""
assert old in s, 'not found'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('fixed contrast logic')
