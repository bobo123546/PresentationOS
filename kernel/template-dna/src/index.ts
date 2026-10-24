import { extractZipEntries } from '@pres/document-parser';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import { parseXml, child, children, descendants, type XmlElement } from './xml.js';

export interface ColorUsage { hex: string; count: number; }
export interface FontUsage { name: string; count: number; }
export interface TitlePosition { x: number; y: number; w: number; h: number; count: number; }
export interface DnaTheme {
  part: string; name?: string; colors: Record<string, string>;
  fonts: { majorLatin?: string; minorLatin?: string; majorEastAsia?: string; minorEastAsia?: string; majorScripts: Record<string, string>; minorScripts: Record<string, string> };
}
export interface DnaColorValue { hex: string; kind: 'srgb' | 'scheme' | 'system'; sourcePart: string; role?: string; themePart?: string; }
export interface DnaStyleSource {
  part: string; kind: 'slide' | 'layout' | 'master'; themePart?: string; masterPart?: string; role: string;
  placeholder?: { type: string; idx?: string };
  geometry?: { x: number; y: number; w: number; h: number };
  colors: { fill?: DnaColorValue; line?: DnaColorValue; text?: DnaColorValue };
  fonts: { latin?: string; eastAsia?: string }; fontSizePt?: number;
}
export interface DesignTokens {
  schema: 'design-token'; version: '1';
  colors: { primary: string; secondary: string; background: string; text: string; accent?: string; surface?: string; muted?: string;
    series1?: string; series2?: string; series3?: string; series4?: string; series5?: string; series6?: string };
  fonts: { heading: string; body: string; mono?: string };
}
export interface TemplateDna {
  schema: 'template-dna'; version: '1'; source: string; slideCount: number;
  masters: string[]; layouts: string[]; colors: ColorUsage[]; fonts: FontUsage[]; titlePositions: TitlePosition[];
  shapeStyle: { fills: ColorUsage[]; lineColors: ColorUsage[]; lineWidths: Array<{ width: number; count: number }> };
  extractedAt: string;
  /** Additive fields: legacy callers may continue using the usage statistics. */
  sourceSha256?: string; themes?: DnaTheme[];
  themeSelection?: { part?: string; masterPart?: string; reason: 'master-relationship' | 'package-theme-fallback' | 'none' };
  styleSources?: DnaStyleSource[];
  relationships?: Array<{ part: string; type: string; target: string }>;
  warnings?: string[]; scope?: 'theme-and-explicit-styles';
}

const EMU_PER_INCH = 914400;
const ROLES: Record<string, string> = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body', obj: 'object', pic: 'picture', chart: 'chart', tbl: 'table', dt: 'date', ftr: 'footer', sldNum: 'slide-number' };
const HEX = /^[\da-f]{6}$/i;
interface Relationship { type: string; target: string }

/** Inspect metadata; this does not reproduce masters or certify visual fidelity. */
export async function extractTemplateDna(pptxBuffer: Buffer, source = 'unknown.pptx'): Promise<TemplateDna> {
  // The reader bounds allocation/inflation and verifies central/local headers,
  // sizes and CRC before any XML decoding. JSZip.async('string') would allocate
  // the full output before a post-decompression inspection limit could run.
  const zip = extractZipEntries(pptxBuffer, { maxEntryBytes: 8 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 });
  const names = [...zip.keys()];
  const slides = names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(partOrder);
  const layouts = names.filter(n => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).sort(partOrder);
  const masters = names.filter(n => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n)).sort(partOrder);
  const themeParts = names.filter(n => /^ppt\/theme\/theme\d+\.xml$/.test(n)).sort(partOrder);
  if (!slides.length && !layouts.length && !masters.length && !themeParts.length) throw new Error('Template contains no presentation design parts');
  const documents = new Map<string, XmlElement>(); const rels = new Map<string, Relationship[]>(); const warnings: string[] = [];
  let xmlBytes = 0;
  const read = async (part: string): Promise<XmlElement> => {
    const cached = documents.get(part); if (cached) return cached;
    const entry = zip.get(part); if (!entry) throw new Error(`Missing template part: ${part}`);
    xmlBytes += entry.length;
    if (entry.length > 8 * 1024 * 1024 || xmlBytes > 64 * 1024 * 1024) throw new Error('Template XML exceeds inspection limit');
    let xml: string;
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(entry); }
    catch { throw new Error(`Template XML must be valid UTF-8: ${part}`); }
    const root = parseXml(xml, part); documents.set(part, root); return root;
  };
  for (const part of [...slides, ...layouts, ...masters]) {
    await read(part);
    const relPart = posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
    const entries: Relationship[] = [];
    if (zip.has(relPart)) for (const rel of children(await read(relPart), 'Relationship')) {
      const type = rel.attrs.Type?.split('/').at(-1) ?? '';
      if (!['slideLayout', 'slideMaster', 'theme'].includes(type)) continue;
      if (rel.attrs.TargetMode === 'External') throw new Error(`External template design relationship rejected: ${part}`);
      const raw = rel.attrs.Target;
      if (!raw || raw.includes('\\') || raw.includes('%') || /[?#\x00-\x1f]/.test(raw)) throw new Error(`Invalid template relationship: ${part}`);
      const target = raw.startsWith('/') ? raw.slice(1) : posix.normalize(posix.join(posix.dirname(part), raw));
      if (!target.startsWith('ppt/') || !zip.has(target)) throw new Error(`Missing or unsafe template relationship: ${part} -> ${target}`);
      entries.push({ type, target });
    }
    rels.set(part, entries);
  }
  const themes: DnaTheme[] = [];
  for (const part of themeParts) themes.push(parseTheme(await read(part), part, warnings));
  const themeMap = new Map(themes.map(t => [t.part, t]));
  const directTheme = (part: string) => rels.get(part)?.find(r => r.type === 'theme')?.target;
  // Masters also reference their child layouts; that backlink is not inheritance.
  const parent = (part: string) => {
    const type = part.startsWith('ppt/slides/') ? 'slideLayout' : part.startsWith('ppt/slideLayouts/') ? 'slideMaster' : undefined;
    return type ? rels.get(part)?.find(r => r.type === type)?.target : undefined;
  };
  const findTheme = (part: string, visited = new Set<string>()): string | undefined => {
    if (visited.has(part)) throw new Error(`Cyclic template inheritance: ${part}`); visited.add(part);
    const target = directTheme(part);
    if (target) { if (!themeMap.has(target)) throw new Error(`Unsupported template theme part: ${target}`); return target; }
    const inherited = parent(part); return inherited ? findTheme(inherited, visited) : undefined;
  };
  const primaryMaster = masters.find(m => directTheme(m));
  const selectedPart = primaryMaster ? findTheme(primaryMaster) : themeParts[0];
  const themeSelection: NonNullable<TemplateDna['themeSelection']> = { part: selectedPart, masterPart: primaryMaster, reason: primaryMaster ? 'master-relationship' : selectedPart ? 'package-theme-fallback' : 'none' };
  if (!selectedPart) warnings.push('No theme found; normalized tokens use explicit role styles or documented defaults');
  if (themes.length > 1) warnings.push('Multiple themes found; normalized tokens use the recorded theme selection');
  const colorCount = new Map<string, number>(); const fontCount = new Map<string, number>();
  const fills = new Map<string, number>(); const lines = new Map<string, number>(); const widths = new Map<number, number>();
  const styleSources: DnaStyleSource[] = []; const titlePositions: TitlePosition[] = [];
  const count = <T>(map: Map<T, number>, key: T) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const theme of themes) {
    Object.values(theme.colors).forEach(c => count(colorCount, c));
    for (const value of [theme.fonts.majorLatin, theme.fonts.minorLatin, theme.fonts.majorEastAsia, theme.fonts.minorEastAsia, ...Object.values(theme.fonts.majorScripts), ...Object.values(theme.fonts.minorScripts)]) if (value) count(fontCount, value);
  }
  for (const part of [...masters, ...layouts, ...slides]) {
    const root = documents.get(part)!;
    const themePart = findTheme(part) ?? (themes.length === 1 ? themeParts[0] : undefined);
    const theme = themePart ? themeMap.get(themePart) : undefined;
    const mappings: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const chain: string[] = []; let current: string | undefined = part;
    while (current) { if (chain.includes(current)) throw new Error(`Cyclic template inheritance: ${part}`); chain.push(current); current = parent(current); }
    for (const inherited of chain.reverse()) {
      const element = documents.get(inherited)!;
      const map = child(element, 'clrMap') ?? child(child(element, 'clrMapOvr'), 'overrideClrMapping');
      if (map) Object.assign(mappings, map.attrs);
    }
    const masterPart = chain.find(p => p.startsWith('ppt/slideMasters/'));
    const resolveColor = (node: XmlElement | undefined) => colorValue(node, part, theme, mappings, warnings);
    for (const color of [...descendants(root, 'srgbClr'), ...descendants(root, 'schemeClr'), ...descendants(root, 'sysClr')]) { const value = resolveColor(color); if (value) count(colorCount, value.hex); }
    for (const fill of descendants(root, 'solidFill')) { const value = resolveColor(fill.children[0]); if (value) count(fills, value.hex); }
    for (const line of descendants(root, 'ln')) {
      const value = resolveColor(child(line, 'solidFill')?.children[0]); if (value) count(lines, value.hex);
      const width = Number(line.attrs.w); if (line.attrs.w && Number.isFinite(width) && width >= 0) count(widths, width / 12700);
    }
    for (const node of [...descendants(root, 'latin'), ...descendants(root, 'ea')]) { const face = resolveFont(node.attrs.typeface, theme); if (face) count(fontCount, face); }
    const kind: DnaStyleSource['kind'] = masters.includes(part) ? 'master' : layouts.includes(part) ? 'layout' : 'slide';
    const bg = child(child(root, 'cSld'), 'bg');
    if (bg) styleSources.push({ part, kind, themePart, masterPart, role: 'background', colors: { fill: resolveColor(child(child(bg, 'bgPr'), 'solidFill')?.children[0]) }, fonts: {} });
    for (const shape of descendants(root, 'sp')) {
      const ph = child(child(child(shape, 'nvSpPr'), 'nvPr'), 'ph');
      const role = ph ? ROLES[ph.attrs.type ?? 'obj'] ?? 'other' : 'other';
      const properties = child(shape, 'spPr'); const body = child(shape, 'txBody');
      const rpr = descendants(body, 'rPr')[0] ?? descendants(body, 'defRPr')[0] ?? descendants(body, 'endParaRPr')[0];
      const geometry = readGeometry(child(properties, 'xfrm'));
      const fontSizePt = rpr?.attrs.sz ? Number(rpr.attrs.sz) / 100 : undefined;
      const entry: DnaStyleSource = { part, kind, themePart, masterPart, role,
        placeholder: ph ? { type: ph.attrs.type ?? 'obj', idx: ph.attrs.idx } : undefined,
        geometry, colors: { fill: resolveColor(child(properties, 'solidFill')?.children[0]), line: resolveColor(child(child(properties, 'ln'), 'solidFill')?.children[0]), text: resolveColor(child(rpr, 'solidFill')?.children[0]) },
        fonts: { latin: resolveFont(child(rpr, 'latin')?.attrs.typeface, theme), eastAsia: resolveFont(child(rpr, 'ea')?.attrs.typeface, theme) },
        fontSizePt: fontSizePt !== undefined && Number.isFinite(fontSizePt) && fontSizePt > 0 ? fontSizePt : undefined };
      styleSources.push(entry);
      if (geometry && (role === 'title' || (kind === 'slide' && (entry.fontSizePt ?? 0) >= 24))) titlePositions.push({ ...geometry, count: 1 });
    }
  }
  const usage = <K, V extends { count: number }>(map: Map<K, number>, make: (key: K, count: number) => V): V[] => [...map].map(([key, n]) => make(key, n)).sort((a, b) => b.count - a.count);
  const dna: TemplateDna = { schema: 'template-dna', version: '1', source, sourceSha256: createHash('sha256').update(pptxBuffer).digest('hex'), slideCount: slides.length,
    masters: masters.map(p => child(documents.get(p), 'cSld')?.attrs.name ?? p), layouts: layouts.map(p => child(documents.get(p), 'cSld')?.attrs.name ?? p),
    colors: usage(colorCount, (hex, count) => ({ hex, count })), fonts: usage(fontCount, (name, count) => ({ name, count })), titlePositions,
    shapeStyle: { fills: usage(fills, (hex, count) => ({ hex, count })), lineColors: usage(lines, (hex, count) => ({ hex, count })), lineWidths: usage(widths, (width, count) => ({ width, count })) },
    extractedAt: new Date().toISOString(), themes, themeSelection, styleSources,
    relationships: [...rels].flatMap(([part, entries]) => entries.map(r => ({ part, ...r }))), warnings: [...new Set(warnings)], scope: 'theme-and-explicit-styles' };
  dna.warnings = [...new Set([...warnings, ...normalizeDesign(dna).defaults])];
  return dna;
}

/** Semantic role mapping. Shape-paint frequency never determines background. */
export function designTokensFromDna(dna: TemplateDna): DesignTokens {
  return normalizeDesign(dna).tokens;
}
function normalizeDesign(dna: TemplateDna): { tokens: DesignTokens; defaults: string[] } {
  const defaults: string[] = [];
  const theme = dna.themes?.find(t => t.part === dna.themeSelection?.part) ?? (dna.themes?.length === 1 ? dna.themes[0] : undefined);
  const styles = (dna.styleSources ?? []).filter(s => s.kind !== 'slide' && (!theme || s.themePart === theme.part) && (!dna.themeSelection?.masterPart || s.masterPart === dna.themeSelection.masterPart));
  const roleStyle = (role: string) => styles.find(s => s.role === role);
  const valid = (hex?: string) => hex && HEX.test(hex) ? `#${hex.toUpperCase()}` : undefined;
  const color = (role: string, fallback: string, tokenRole: string) => {
    const value = valid(theme?.colors[role]);
    if (value) return value;
    defaults.push(`Default design role colors.${tokenRole}: ${fallback}; missing supported theme ${role}`);
    return fallback;
  };
  const font = (role: string, mode: 'major' | 'minor') => {
    const style = roleStyle(role)?.fonts;
    const value = style?.eastAsia || theme?.fonts[`${mode}EastAsia`] || theme?.fonts[`${mode}Scripts`]?.Hans || theme?.fonts[`${mode}Scripts`]?.Hant || style?.latin || theme?.fonts[`${mode}Latin`];
    if (value) return value;
    defaults.push(`Default design role fonts.${mode === 'major' ? 'heading' : 'body'}: Microsoft YaHei; no supported explicit or theme font`);
    return 'Microsoft YaHei';
  };
  const primary = color('accent1', '#2563EB', 'primary');
  if (!valid(theme?.colors.accent1)) defaults.push('Default design role colors.accent: #2563EB; missing supported theme accent1');
  const series: Record<string, string> = {};
  for (let i = 1; i <= 6; i++) { const value = valid(theme?.colors[`accent${i}`]); if (value) series[`series${i}`] = value; }
  return { tokens: { schema: 'design-token', version: '1', colors: {
    primary, secondary: color('accent2', '#64748B', 'secondary'), background: valid(roleStyle('background')?.colors.fill?.hex) ?? color('lt1', '#FFFFFF', 'background'),
    text: valid(roleStyle('body')?.colors.text?.hex) ?? color('dk1', '#111827', 'text'),
    accent: primary, surface: color('lt2', '#F8FAFC', 'surface'), muted: color('dk2', '#64748B', 'muted'), ...series,
  }, fonts: { heading: font('title', 'major'), body: font('body', 'minor') } }, defaults };
}

function parseTheme(root: XmlElement, part: string, warnings: string[]): DnaTheme {
  const elements = child(root, 'themeElements'); const colors: Record<string, string> = {};
  for (const role of child(elements, 'clrScheme')?.children ?? []) {
    const resolved = colorValue(role.children[0], part, undefined, {}, warnings);
    if (resolved) colors[role.local] = resolved.hex;
  }
  const scheme = child(elements, 'fontScheme'); const major = child(scheme, 'majorFont'); const minor = child(scheme, 'minorFont');
  const scripts = (node: XmlElement | undefined) => Object.fromEntries(children(node, 'font').filter(n => n.attrs.script && n.attrs.typeface?.trim()).map(n => [n.attrs.script, n.attrs.typeface.trim()]));
  const face = (node: XmlElement | undefined, type: string) => child(node, type)?.attrs.typeface?.trim() || undefined;
  return { part, name: root.attrs.name, colors, fonts: { majorLatin: face(major, 'latin'), minorLatin: face(minor, 'latin'), majorEastAsia: face(major, 'ea'), minorEastAsia: face(minor, 'ea'), majorScripts: scripts(major), minorScripts: scripts(minor) } };
}
function resolveFont(face: string | undefined, theme: DnaTheme | undefined): string | undefined {
  if (!face?.trim()) return undefined; if (!face.startsWith('+')) return face.trim();
  const mode = face.startsWith('+mj-') ? 'major' : face.startsWith('+mn-') ? 'minor' : undefined;
  if (!mode || !theme) return undefined;
  if (face.endsWith('-lt')) return theme.fonts[`${mode}Latin`];
  if (face.endsWith('-ea')) return theme.fonts[`${mode}EastAsia`] || theme.fonts[`${mode}Scripts`].Hans || theme.fonts[`${mode}Scripts`].Hant;
  return undefined;
}
function colorValue(node: XmlElement | undefined, sourcePart: string, theme: DnaTheme | undefined, mapping: Record<string, string>, warnings: string[]): DnaColorValue | undefined {
  if (!node) return undefined;
  const kind = node.local === 'srgbClr' ? 'srgb' : node.local === 'sysClr' ? 'system' : node.local === 'schemeClr' ? 'scheme' : undefined;
  if (!kind) return undefined;
  const role = kind === 'scheme' ? mapping[node.attrs.val] ?? node.attrs.val : undefined;
  let value = kind === 'scheme' ? theme?.colors[role!] : kind === 'system' ? node.attrs.lastClr : node.attrs.val;
  if (!value || !HEX.test(value)) { warnings.push(`Unresolved color ${node.attrs.val ?? node.local} in ${sourcePart}`); return undefined; }
  let channels = [0, 2, 4].map(i => parseInt(value!.slice(i, i + 2), 16));
  for (const transform of node.children) {
    const ratio = Number(transform.attrs.val) / 100000;
    if (!Number.isFinite(ratio) || !['tint', 'shade', 'alpha'].includes(transform.local) || ratio < 0 || ratio > 1) { warnings.push(`Unsupported color transform ${transform.local} in ${sourcePart}`); return undefined; }
    if (transform.local === 'alpha' && ratio !== 1) { warnings.push(`Unsupported color transparency in ${sourcePart}; no opaque token inferred`); return undefined; }
    if (transform.local === 'tint') channels = channels.map(c => c + (255 - c) * ratio);
    if (transform.local === 'shade') channels = channels.map(c => c * ratio);
  }
  value = channels.map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex: value, kind, sourcePart, role, themePart: kind === 'scheme' ? theme?.part : undefined };
}
function readGeometry(node: XmlElement | undefined): DnaStyleSource['geometry'] {
  const off = child(node, 'off'); const ext = child(node, 'ext'); if (!off || !ext) return undefined;
  const values = [off.attrs.x, off.attrs.y, ext.attrs.cx, ext.attrs.cy]; if (values.some(v => v === undefined || !/^-?\d+$/.test(v))) return undefined;
  const [x, y, w, h] = values.map(v => Number(v) / EMU_PER_INCH);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : undefined;
}
function partOrder(a: string, b: string): number { return Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0); }
