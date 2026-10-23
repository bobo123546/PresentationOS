/** Non-resolving OOXML reader. DTDs and external entities are disabled. */
export interface XmlElement { name: string; attributes: Record<string, string>; children: Array<XmlElement | string>; }
export const localName = (name: string): string => name.split(':').at(-1)!;
export function elements(node: XmlElement, name?: string): XmlElement[] {
  return node.children.filter((c): c is XmlElement => typeof c !== 'string' && (!name || localName(c.name) === name));
}
export function descendants(node: XmlElement, name: string): XmlElement[] {
  return elements(node).flatMap(c => [...(localName(c.name) === name ? [c] : []), ...descendants(c, name)]);
}
export function attribute(node: XmlElement, name: string): string | undefined {
  return node.attributes[name] ?? Object.entries(node.attributes).find(([key]) => localName(key) === name)?.[1];
}
export function textContent(node: XmlElement): string { return node.children.map(c => typeof c === 'string' ? c : textContent(c)).join(''); }
function decode(text: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) throw new Error('Invalid XML entity reference');
  return text.replace(/&([^;\s]+);/g, (_all, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    const point = /^#x[0-9a-f]+$/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : /^#\d+$/.test(entity) ? Number.parseInt(entity.slice(1), 10) : NaN;
    const validPoint = point === 9 || point === 10 || point === 13 || (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff);
    if (!Number.isInteger(point) || !validPoint) throw new Error(`Invalid XML entity: &${entity};`);
    return String.fromCodePoint(point);
  });
}
export function parseXml(xml: string): XmlElement {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml)) throw new Error('Invalid XML control character');
  const document: XmlElement = { name: '#document', attributes: {}, children: [] };
  const stack = [document]; let position = 0, count = 0;
  while (position < xml.length) {
    const open = xml.indexOf('<', position);
    if (open < 0) { stack.at(-1)!.children.push(decode(xml.slice(position))); break; }
    if (open > position) stack.at(-1)!.children.push(decode(xml.slice(position, open)));
    if (xml.startsWith('<!--', open) || xml.startsWith('<?', open) || xml.startsWith('<![CDATA[', open)) {
      const cdata = xml.startsWith('<![CDATA[', open), comment = xml.startsWith('<!--', open);
      const start = open + (cdata ? 9 : comment ? 4 : 2), terminator = cdata ? ']]>' : comment ? '-->' : '?>';
      const end = xml.indexOf(terminator, start);
      if (end < 0) throw new Error('Invalid XML: unterminated declaration/comment');
      if (cdata) stack.at(-1)!.children.push(xml.slice(start, end));
      position = end + terminator.length; continue;
    }
    if (xml.startsWith('<!', open)) throw new Error('Unsupported XML declaration: DTD/entity declarations are disabled');
    let end = open + 1, quote = '';
    for (; end < xml.length; end++) {
      const c = xml[end];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end >= xml.length) throw new Error('Invalid XML: unterminated tag');
    const tag = xml.slice(open + 1, end).trim(); position = end + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (stack.length === 1 || stack.at(-1)!.name !== name) throw new Error(`Invalid XML: mismatched closing tag ${name}`);
      stack.pop(); continue;
    }
    const selfClosing = tag.endsWith('/'), body = selfClosing ? tag.slice(0, -1).trimEnd() : tag;
    const name = /^[A-Za-z_][\w:.-]*/.exec(body)?.[0];
    if (!name) throw new Error('Invalid XML element name');
    const attributes: Record<string, string> = Object.create(null); let rest = body.slice(name.length);
    while (rest.trim()) {
      const match = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!match || Object.hasOwn(attributes, match[1])) throw new Error(`Invalid XML attributes in ${name}`);
      attributes[match[1]] = decode(match[2] ?? match[3]); rest = rest.slice(match[0].length);
    }
    const node: XmlElement = { name, attributes, children: [] }; stack.at(-1)!.children.push(node);
    if (++count > 1_000_000 || stack.length > 128) throw new Error('XML document exceeds ingestion limits');
    if (!selfClosing) stack.push(node);
  }
  const roots = elements(document);
  if (stack.length !== 1 || roots.length !== 1 || document.children.some(c => typeof c === 'string' && c.trim())) throw new Error('Invalid XML: incomplete or multiple document roots');
  return roots[0];
}

export function readXml(bytes: Buffer): XmlElement {
  const little = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0;
  const big = bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c;
  const encoding = little ? 'utf-16le' : big ? 'utf-16be' : 'utf-8';
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error(`Invalid XML ${encoding} encoding; refusing replacement characters`); }
  const declared = /^\s*<\?xml\s[^?]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(text)?.[1].toLowerCase();
  if (declared && declared !== encoding && !(declared === 'utf-16' && (little || big))) throw new Error(`Unsupported or mismatched XML encoding: ${declared}`);
  return parseXml(text);
}
