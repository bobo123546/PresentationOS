// Preserve untouched XML bytes. DTDs/external entities are not supported.
export interface XmlNode {
  name: string; local: string; namespace: string;
  start: number; openEnd: number; closeStart: number; end: number;
  attributes: Map<string, string>; children: XmlNode[]; parent?: XmlNode;
}
export const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

export function assertXmlText(text: string): void {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (!(code === 9 || code === 10 || code === 13 || code >= 0x20 && code <= 0xD7FF ||
      code >= 0xE000 && code <= 0xFFFD || code >= 0x10000 && code <= 0x10FFFF)) throw new Error('Invalid XML character');
  }
}
export function decodeXml(text: string): string {
  const decoded = text.replace(/&([^;\s<&]+);|&/g, (_entity, name: string | undefined) => {
    const standard: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (name && Object.hasOwn(standard, name)) return standard[name];
    if (name && (/^#x[\da-f]+$/i.test(name) || /^#\d+$/.test(name))) {
      const value = Number.parseInt(name.slice(/^#x/i.test(name) ? 2 : 1), /^#x/i.test(name) ? 16 : 10);
      if (value > 0x10FFFF) throw new Error('Invalid XML character reference');
      const character = String.fromCodePoint(value); assertXmlText(character); return character;
    }
    throw new Error('Malformed or unsupported XML entity');
  });
  assertXmlText(decoded); return decoded;
}
export function escapeXml(text: string): string {
  assertXmlText(text);
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}
export function parseXml(xml: string): XmlNode[] {
  const roots: XmlNode[] = [], stack: Array<{ node: XmlNode; ns: Map<string, string> }> = [];
  let offset = 0;
  while (offset < xml.length) {
    const start = xml.indexOf('<', offset);
    const plain = xml.slice(offset, start < 0 ? xml.length : start);
    if (!stack.length && plain.replace(/^\uFEFF/, '').trim()) throw new Error('Text outside XML document element');
    if (stack.length) decodeXml(plain);
    if (start < 0) break;
    if (xml.startsWith('<!--', start) || xml.startsWith('<?', start) || xml.startsWith('<![CDATA[', start)) {
      if (!stack.length && xml.startsWith('<![CDATA[', start)) throw new Error('CDATA outside XML document element');
      const marker = xml.startsWith('<!--', start) ? '-->' : xml.startsWith('<?', start) ? '?>' : ']]>';
      const end = xml.indexOf(marker, start + 2); if (end < 0) throw new Error('Unterminated XML markup');
      offset = end + marker.length; continue;
    }
    if (xml.startsWith('<!', start)) throw new Error('DTD/declarations are unsupported');
    let end = start + 1, quote = '';
    for (; end < xml.length; end++) {
      const character = xml[end];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === xml.length) throw new Error('Unterminated XML tag');
    const tag = xml.slice(start, end + 1), closing = /^<\/([^\s>]+)\s*>$/.exec(tag);
    if (closing) {
      const open = stack.pop(); if (!open || open.node.name !== closing[1]) throw new Error('Mismatched XML closing tag');
      open.node.closeStart = start; open.node.end = end + 1;
    } else {
      const opening = /^<([^\s/>]+)([\s\S]*?)(\/?)>$/.exec(tag); if (!opening) throw new Error('Malformed XML tag');
      const attributes = new Map<string, string>(); let rest = opening[2];
      while (rest.trim()) {
        const attr = /^\s+([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/.exec(rest);
        if (!attr || attributes.has(attr[1])) throw new Error('Malformed or duplicate XML attribute');
        attributes.set(attr[1], decodeXml(attr[2].slice(1, -1))); rest = rest.slice(attr[0].length);
      }
      const ns = new Map(stack.at(-1)?.ns);
      for (const [name, value] of attributes) {
        if (name === 'xmlns') ns.set('', value); else if (name.startsWith('xmlns:')) ns.set(name.slice(6), value);
      }
      const name = opening[1], colon = name.indexOf(':'), prefix = colon < 0 ? '' : name.slice(0, colon);
      // Compatibility with historical minimal fixtures; explicit bindings win.
      const namespace = ns.get(prefix) ?? (prefix === 'a' ? DRAWING_NS : prefix === 'p' ? PRESENTATION_NS : '');
      const node: XmlNode = { name, local: colon < 0 ? name : name.slice(colon + 1), namespace,
        start, openEnd: end + 1, closeStart: end + 1, end: end + 1, attributes, children: [], parent: stack.at(-1)?.node };
      if (node.parent) node.parent.children.push(node); else roots.push(node);
      if (!opening[3]) stack.push({ node, ns });
    }
    offset = end + 1;
  }
  if (stack.length) throw new Error('Unclosed XML element');
  if (roots.length !== 1) throw new Error('XML must contain one document element');
  return roots;
}
export function descendants(nodes: XmlNode[]): XmlNode[] { return nodes.flatMap(node => [node, ...descendants(node.children)]); }
export function isDrawing(node: XmlNode, local: string): boolean { return node.namespace === DRAWING_NS && node.local === local; }
export function nodeText(xml: string, node: XmlNode): string {
  if (node.children.length) throw new Error('Unexpected element inside DrawingML text');
  const raw = xml.slice(node.openEnd, node.closeStart).replace(/\r\n?/g, '\n');
  if (raw.startsWith('<![CDATA[') && raw.endsWith(']]>')) { const content = raw.slice(9, -3); assertXmlText(content); return content; }
  if (raw.includes('<')) throw new Error('Unsupported markup inside DrawingML text'); return decodeXml(raw);
}
export interface XmlReplacement { start: number; end: number; text: string; }
export function spliceXml(xml: string, replacements: XmlReplacement[]): string {
  let cursor = xml.length, result = xml;
  for (const edit of replacements.slice().sort((a, b) => b.start - a.start)) {
    if (edit.end > cursor) throw new Error('Overlapping XML edits');
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end); cursor = edit.start;
  }
  return result;
}
export function textElement(xml: string, node: XmlNode, text: string): string {
  let open = xml.slice(node.start, node.openEnd).replace(/\/\s*>$/, '>');
  if (/^\s|\s$/.test(text)) {
    if (node.attributes.has('xml:space')) open = open.replace(/xml:space\s*=\s*("[^"]*"|'[^']*')/, 'xml:space="preserve"');
    else open = open.replace(/>$/, ' xml:space="preserve">');
  }
  return open + escapeXml(text) + `</${node.name}>`;
}
