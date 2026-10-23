import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { assertXmlText, descendants, isDrawing, nodeText, parseXml, PRESENTATION_NS,
  spliceXml, textElement, type XmlNode, type XmlReplacement } from './xml.js';

export interface EditOp {
  /** 1-based slideshow order, following presentation relationships when present. */
  slide: number;
  /** 0-based text-shape index, or first large-font text shape for 'title'. */
  target: number | 'title';
  text: string;
  /** Decoded complete shape text; paragraphs are separated by newlines. */
  expectedOldText?: string;
  /** Optional literal substring within paragraphs, including across runs. */
  matchText?: string;
  /** Required for ambiguous matches: 0-based occurrence or 'all'. */
  occurrence?: number | 'all';
}

export interface ReversiblePatch {
  slide: number;
  target: number | 'title';
  oldText: string;
  /** Complete shape text after the operation. */
  newText: string;
  snapshot?: {
    version: 1;
    part: string;
    beforeSha256: string;
    afterSha256: string;
    /** Exact UTF-8 XML restores rich runs/entities instead of guessing from text. */
    beforeXml: string;
  };
}

export interface EditResult {
  ok: boolean;
  error?: string;
  slideFiles: string[];
  changed: Array<{ file: string; op: EditOp }>;
  patches: ReversiblePatch[];
  nonTargetPartsVerified: boolean;
  nonTargetPartsCount: number;
}

const SLIDE_RE = /^ppt\/slides\/[^/]+\.xml$/;
const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

function failure(buffer: Buffer, error: unknown, slideFiles: string[] = [], nonTargetPartsCount = 0) {
  return { buffer, result: { ok: false, error: error instanceof Error ? error.message : String(error), slideFiles,
    changed: [], patches: [], nonTargetPartsVerified: false, nonTargetPartsCount } satisfies EditResult };
}

async function xmlPart(zip: JSZip, name: string): Promise<string> {
  const file = zip.file(name);
  if (!file) throw new Error(`Missing PPTX part: ${name}`);
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.async('nodebuffer'));
}

async function slideOrder(zip: JSZip): Promise<string[]> {
  const presentation = zip.file('ppt/presentation.xml');
  const relationships = zip.file('ppt/_rels/presentation.xml.rels');
  if (!presentation && !relationships) {
    // Historical minimal fixtures have no slideshow relationships.
    return Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]));
  }
  if (!presentation || !relationships) throw new Error('Incomplete presentation slide relationships');
  const rels = new Map<string, string>();
  for (const node of descendants(parseXml(await xmlPart(zip, 'ppt/_rels/presentation.xml.rels')))) {
    if (node.local !== 'Relationship' || !node.attributes.get('Type')?.endsWith('/slide')) continue;
    const id = node.attributes.get('Id'), target = node.attributes.get('Target');
    if (!id || !target || rels.has(id) || node.attributes.get('TargetMode') === 'External') throw new Error('Invalid slide relationship');
    const part = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('ppt', target));
    if (!SLIDE_RE.test(part) || !zip.file(part)) throw new Error('Missing or unsafe slide relationship target');
    rels.set(id, part);
  }
  const parts = descendants(parseXml(await xmlPart(zip, 'ppt/presentation.xml')))
    .filter(node => node.namespace === PRESENTATION_NS && node.local === 'sldId').map(node => {
      const part = rels.get(node.attributes.get('r:id') ?? [...node.attributes].find(([key]) => key.endsWith(':id'))?.[1] ?? '');
      if (!part) throw new Error('Missing slide relationship in slideshow order');
      return part;
    });
  if (new Set(parts).size !== parts.length) throw new Error('Duplicate slides in presentation order');
  return parts;
}

async function hashesExcept(zip: JSZip, targets: Set<string>): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  for (const [name, file] of Object.entries(zip.files)) if (!file.dir && !targets.has(name)) entries.set(name, hash(await file.async('nodebuffer')));
  return entries;
}

async function verifyHashes(buffer: Buffer, expected: Map<string, string>): Promise<void> {
  const output = await JSZip.loadAsync(buffer);
  for (const [name, digest] of expected) {
    const file = output.file(name);
    if (!file || hash(await file.async('nodebuffer')) !== digest) throw new Error(`Non-target PPTX part changed: ${name}`);
  }
}

interface ShapeText {
  index: number;
  node: XmlNode;
  paragraphs: Array<{ node: XmlNode; texts: XmlNode[]; text: string }>;
  text: string;
  size: number;
}

function shapeTexts(xml: string): ShapeText[] {
  return descendants(parseXml(xml)).filter(node => node.namespace === PRESENTATION_NS && node.local === 'sp').flatMap(node => {
    const body = node.children.find(child => child.namespace === PRESENTATION_NS && child.local === 'txBody');
    if (!body) return [];
    const paragraphs = body.children.filter(child => isDrawing(child, 'p')).map(paragraph => {
      const texts = descendants(paragraph.children).filter(child => isDrawing(child, 't'));
      return { node: paragraph, texts, text: texts.map(text => nodeText(xml, text)).join('') };
    });
    const size = Math.max(0, ...descendants(body.children).filter(child => isDrawing(child, 'rPr') || isDrawing(child, 'defRPr'))
      .map(child => Number(child.attributes.get('sz') ?? 0)));
    return [{ index: 0, node, paragraphs, text: paragraphs.map(paragraph => paragraph.text).join('\n'), size }];
  }).map((shape, index) => ({ ...shape, index }));
}

function selectedShape(xml: string, target: EditOp['target']): ShapeText {
  const shapes = shapeTexts(xml);
  const shape = target === 'title' ? shapes.find(item => item.size >= 2400) ?? shapes[0] : shapes[target];
  if (!shape) throw new Error('no matching text shape for operation');
  if (descendants(shape.node.children).some(node => isDrawing(node, 'fld') || isDrawing(node, 'br') || isDrawing(node, 'tab'))) {
    throw new Error('Text fields, explicit breaks and tabs require a dedicated edit operation');
  }
  if (!shape.paragraphs.some(paragraph => paragraph.texts.length)) throw new Error('no matching text run for operation');
  return shape;
}

function replaceParagraph(xml: string, paragraph: ShapeText['paragraphs'][number], ranges: Array<{ start: number; end: number }>, replacement: string): XmlReplacement[] {
  const edits: XmlReplacement[] = [];
  let offset = 0;
  const spans = paragraph.texts.map(node => {
    const text = nodeText(xml, node), start = offset; offset += text.length;
    return { node, text, start, end: offset };
  });
  // Preserve identical characters and their formatting at both ends of each
  // literal. Only genuinely changed characters move into the first changed run.
  const changes = ranges.flatMap(range => {
    const oldChars = Array.from(paragraph.text.slice(range.start, range.end));
    const newChars = Array.from(replacement);
    let prefix = 0, suffix = 0;
    while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix++;
    while (suffix < oldChars.length - prefix && suffix < newChars.length - prefix &&
      oldChars[oldChars.length - suffix - 1] === newChars[newChars.length - suffix - 1]) suffix++;
    const start = range.start + oldChars.slice(0, prefix).join('').length;
    const end = range.end - oldChars.slice(oldChars.length - suffix).join('').length;
    const text = newChars.slice(prefix, newChars.length - suffix).join('');
    if (start === end && !text) return [];
    const anchor = spans.find(span => span.start < start && start <= span.end) ??
      spans.find(span => span.start <= start && start < span.end) ?? spans[0];
    return [{ start, end, text, anchor: anchor.node }];
  });
  for (const { node, text, start: offset, end } of spans) {
    let next = text, affected = false;
    for (const range of changes.slice().reverse()) {
      const first = range.start === range.end ? node === range.anchor : range.start >= offset && range.start < end;
      const intersects = range.start < end && range.end > offset;
      if (!first && !intersects) continue;
      next = next.slice(0, Math.max(0, range.start - offset)) + (first ? range.text : '') + next.slice(Math.max(0, Math.min(text.length, range.end - offset)));
      affected = true;
    }
    if (affected) edits.push({ start: node.start, end: node.end, text: textElement(xml, node, next) });
  }
  return edits;
}

function applyOp(xml: string, op: EditOp): { xml: string; oldText: string; newText: string } {
  const shape = selectedShape(xml, op.target);
  if (op.expectedOldText !== undefined && shape.text !== op.expectedOldText) throw new Error(`old text mismatch on slide ${op.slide}: expected ${JSON.stringify(op.expectedOldText)}, found ${JSON.stringify(shape.text)}`);
  let edits: XmlReplacement[] = [], expected: string;
  if (op.matchText !== undefined) {
    if (!op.matchText || /[\r\n]/.test(op.matchText) || /[\r\n]/.test(op.text)) throw new Error('Substring edits require non-empty, single-paragraph matchText and replacement');
    const matches: Array<{ paragraph: number; start: number; end: number }> = [];
    shape.paragraphs.forEach((paragraph, paragraphIndex) => {
      let cursor = 0;
      for (;;) {
        const start = paragraph.text.indexOf(op.matchText!, cursor);
        if (start < 0) break;
        matches.push({ paragraph: paragraphIndex, start, end: start + op.matchText!.length });
        cursor = start + op.matchText!.length;
      }
    });
    if (!matches.length) throw new Error('matchText not found in selected shape');
    if (matches.length > 1 && op.occurrence === undefined) throw new Error('matchText is ambiguous; specify occurrence or all');
    const chosen = op.occurrence === 'all' ? matches : [matches[op.occurrence ?? 0]];
    if (chosen.some(match => !match)) throw new Error('matchText occurrence not found');
    expected = shape.paragraphs.map((paragraph, index) => {
      const ranges = chosen.filter(match => match.paragraph === index);
      edits.push(...replaceParagraph(xml, paragraph, ranges, op.text));
      let text = paragraph.text;
      for (const range of ranges.slice().reverse()) text = text.slice(0, range.start) + op.text + text.slice(range.end);
      return text;
    }).join('\n');
  } else if (shape.paragraphs.length === 1 && !/[\r\n]/.test(op.text)) {
    edits = replaceParagraph(xml, shape.paragraphs[0], [{ start: 0, end: shape.text.length }], op.text);
    expected = op.text;
  } else {
    // Full-shape replacement selects all paragraphs. Use the first paragraph/run
    // style for new text; exact rich content is retained in the reversible snapshot.
    const paragraph = shape.paragraphs.find(item => item.texts.length)!;
    const text = paragraph.texts[0], run = text.parent;
    if (!run || !isDrawing(run, 'r')) throw new Error('Unsupported text carrier for whole-shape replacement');
    const runProperties = run.children.find(node => isDrawing(node, 'rPr'));
    const paragraphProperties = paragraph.node.children.find(node => isDrawing(node, 'pPr'));
    const endProperties = paragraph.node.children.find(node => isDrawing(node, 'endParaRPr'));
    const raw = (node: XmlNode | undefined) => node ? xml.slice(node.start, node.end) : '';
    const openParagraph = xml.slice(paragraph.node.start, paragraph.node.openEnd).replace(/\/\s*>$/, '>');
    const openRun = xml.slice(run.start, run.openEnd).replace(/\/\s*>$/, '>');
    expected = op.text.replace(/\r\n?/g, '\n');
    const replacement = expected.split('\n').map(line => openParagraph + raw(paragraphProperties) + openRun + raw(runProperties) + textElement(xml, text, line) + `</${run.name}>` + raw(endProperties) + `</${paragraph.node.name}>`).join('');
    edits = shape.paragraphs.map((item, index) => ({ start: item.node.start, end: item.node.end, text: index === 0 ? replacement : '' }));
  }
  const changed = spliceXml(xml, edits), after = selectedShape(changed, shape.index);
  if (after.text !== expected) throw new Error('Edited OOXML text readback differs from requested replacement');
  return { xml: changed, oldText: shape.text, newText: after.text };
}

/** All operations succeed together; any failure returns the untouched source. */
export async function editPptx(buffer: Buffer, ops: EditOp[]): Promise<{ buffer: Buffer; result: EditResult }> {
  let slideFiles: string[] = [], originals = new Map<string, string>();
  try {
    const zip = await JSZip.loadAsync(buffer); slideFiles = await slideOrder(zip);
    if (!Array.isArray(ops)) throw new Error('ops must be an array');
    for (const op of ops) {
      if (!op || !Number.isSafeInteger(op.slide) || op.slide < 1 || op.target !== 'title' && (!Number.isSafeInteger(op.target) || op.target < 0)) throw new Error('Invalid slide or text-shape target');
      if (typeof op.text !== 'string' || op.expectedOldText !== undefined && typeof op.expectedOldText !== 'string' || op.matchText !== undefined && typeof op.matchText !== 'string') throw new Error('Replacement, matchText and expectedOldText must be strings');
      if (op.occurrence !== undefined && op.occurrence !== 'all' && (!Number.isSafeInteger(op.occurrence) || op.occurrence < 0)) throw new Error('Invalid matchText occurrence');
      if (op.occurrence !== undefined && op.matchText === undefined) throw new Error('occurrence requires matchText');
      assertXmlText(op.text);
      if (!slideFiles[op.slide - 1]) throw new Error(`slide ${op.slide} not found (total slides: ${slideFiles.length})`);
    }
    originals = await hashesExcept(zip, new Set(ops.map(op => slideFiles[op.slide - 1])));
    const patches: ReversiblePatch[] = [], changed: EditResult['changed'] = [];
    for (const op of ops) {
      const file = slideFiles[op.slide - 1], beforeXml = await xmlPart(zip, file), after = applyOp(beforeXml, op);
      zip.file(file, after.xml);
      patches.push({ slide: op.slide, target: op.target, oldText: after.oldText, newText: after.newText,
        snapshot: { version: 1, part: file, beforeSha256: hash(beforeXml), afterSha256: hash(after.xml), beforeXml } });
      changed.push({ file, op });
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await verifyHashes(output, originals);
    return { buffer: output, result: { ok: true, slideFiles, changed, patches, nonTargetPartsVerified: true, nonTargetPartsCount: originals.size } };
  } catch (error) { return failure(buffer, error, slideFiles, originals.size); }
}

/** Revert refuses changes made to a target slide after its recorded edit. */
export async function revertPptx(buffer: Buffer, patches: ReversiblePatch[]): Promise<{ buffer: Buffer; result: EditResult }> {
  let slideFiles: string[] = [], originals = new Map<string, string>();
  try {
    const zip = await JSZip.loadAsync(buffer); slideFiles = await slideOrder(zip);
    if (!Array.isArray(patches)) throw new Error('patches must be an array');
    const targets = new Set<string>();
    for (const patch of patches) {
      const snapshot = patch.snapshot;
      if (!snapshot || snapshot.version !== 1 || !SLIDE_RE.test(snapshot.part) || slideFiles[patch.slide - 1] !== snapshot.part ||
        typeof snapshot.beforeXml !== 'string' || hash(snapshot.beforeXml) !== snapshot.beforeSha256 || !/^[a-f0-9]{64}$/.test(snapshot.afterSha256)) {
        throw new Error('Missing, invalid or legacy patch snapshot; refusing unsafe text-only revert');
      }
      parseXml(snapshot.beforeXml); targets.add(snapshot.part);
    }
    originals = await hashesExcept(zip, targets);
    const inverse: ReversiblePatch[] = [], changed: EditResult['changed'] = [];
    for (const patch of patches.slice().reverse()) {
      const snapshot = patch.snapshot!, current = await xmlPart(zip, snapshot.part);
      if (hash(current) !== snapshot.afterSha256) throw new Error(`Concurrent change detected in ${snapshot.part}; refusing revert`);
      zip.file(snapshot.part, snapshot.beforeXml);
      changed.push({ file: snapshot.part, op: { slide: patch.slide, target: patch.target, text: patch.oldText } });
      inverse.push({ slide: patch.slide, target: patch.target, oldText: patch.newText, newText: patch.oldText,
        snapshot: { version: 1, part: snapshot.part, beforeXml: current, beforeSha256: snapshot.afterSha256, afterSha256: snapshot.beforeSha256 } });
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await verifyHashes(output, originals);
    return { buffer: output, result: { ok: true, slideFiles, changed, patches: inverse, nonTargetPartsVerified: true, nonTargetPartsCount: originals.size } };
  } catch (error) { return failure(buffer, error, slideFiles, originals.size); }
}
