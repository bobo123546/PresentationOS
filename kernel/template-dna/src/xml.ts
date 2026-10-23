/** Non-expanding XML reader for OOXML metadata; never resolves URLs or entities. */
export interface XmlElement { name: string; local: string; attrs: Record<string, string>; children: XmlElement[] }
function decode(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity.startsWith('#')) {
      const cp = parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10);
      if (cp < 1 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('Invalid XML character reference');
      return String.fromCodePoint(cp);
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity];
  });
}
export function parseXml(xml: string, part: string): XmlElement {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw new Error(`DTD/entities are not supported in template part: ${part}`);
  const stack: XmlElement[] = []; let root: XmlElement | undefined; let end = 0; let count = 0;
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>/g;
  for (const match of xml.matchAll(tokens)) {
    const between = xml.slice(end, match.index);
    if (between.includes('<') || (!stack.length && between.trim())) throw new Error(`Malformed template XML: ${part}`);
    end = match.index! + match[0].length;
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<![')) continue;
    if (token.startsWith('</')) {
      if (stack.pop()?.name !== token.slice(2, -1).trim()) throw new Error(`Mismatched template XML: ${part}`);
      continue;
    }
    const start = /^<([\w:.-]+)([\s\S]*?)\/?\s*>$/.exec(token);
    if (!start) throw new Error(`Invalid template XML tag: ${part}`);
    const attrs: Record<string, string> = {}; let rest = start[2];
    while (rest.trim()) {
      const attribute = /^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!attribute || Object.hasOwn(attrs, attribute[1])) throw new Error(`Invalid template XML attributes: ${part}`);
      attrs[attribute[1]] = decode(attribute[2] ?? attribute[3]); rest = rest.slice(attribute[0].length);
    }
    const node: XmlElement = { name: start[1], local: start[1].split(':').at(-1)!, attrs, children: [] };
    if (++count > 200000 || stack.length > 128) throw new Error(`Template XML exceeds metadata limit: ${part}`);
    if (stack.length) stack.at(-1)!.children.push(node); else if (root) throw new Error(`Multiple template XML roots: ${part}`); else root = node;
    if (!/\/\s*>$/.test(token)) stack.push(node);
  }
  if (!root || stack.length || xml.slice(end).trim()) throw new Error(`Incomplete template XML: ${part}`);
  return root;
}
export function child(node: XmlElement | undefined, local: string): XmlElement | undefined { return node?.children.find(n => n.local === local); }
export function children(node: XmlElement | undefined, local: string): XmlElement[] { return node?.children.filter(n => n.local === local) ?? []; }
export function descendants(node: XmlElement | undefined, local: string): XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (n: XmlElement) => { for (const c of n.children) { if (c.local === local) found.push(c); visit(c); } };
  if (node) visit(node); return found;
}
