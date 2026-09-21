# md-to-pptx

从 Markdown 生成可编辑 PPTX，可选参考模板（自动提取配色与字体 DNA）。

## 用法

```bash
node md-to-pptx.skill.mjs --markdownPath deck.md --output out.pptx
node md-to-pptx.skill.mjs --markdownPath deck.md --reference template.pptx --output out.pptx
```

## 输入

| 参数 | 必填 | 说明 |
|---|---|---|
| markdownPath | 是 | Markdown 输入 |
| output | 否 | 输出 PPTX 路径 |
| reference | 否 | 参考模板 PPTX |
| title | 否 | Deck 标题 |

## 内部流程

1. Markdown → DeckSpec（标题/正文/列表/表格/引用）
2. Mechanical QA（负尺寸/溢出/重叠/XML/图表一致性）
3. 可选：参考模板 → Template DNA（accent 色/字体）
4. DNA 驱动渲染 → 可编辑 PPTX（PptxGenJS）

## 能力

- capability: deck.render
- 版本: 0.1.0
