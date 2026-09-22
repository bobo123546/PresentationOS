// safe 插件示例：文本工具（受限运行时，仅 filesystem.read）
// 约定：定义顶层 async function run(input)，无需 export（vm 脚本模式）
async function run(input) {
  const text =
    typeof input?.text === 'string'
      ? input.text
      : input?.file
        ? fs.readText(input.file)
        : '';
  const lines = text.split(/\r?\n/);
  const headings = lines
    .map((l) => l.trim())
    .filter((l) => /^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^#{1,6}\s*/, ''));
  const words = text.split(/\s+/).filter(Boolean).length;
  return { headings, wordCount: words, lineCount: lines.length };
}
