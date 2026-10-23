// Existing PPT Editing（总方案 PHASE 12 / P09）：OOXML 级最小编辑，只改目标页
// 能力：目标旧值强校验、可逆 Patch 记录、非目标部件 SHA256 哈希完整性核验、Revert 支持
import JSZip from 'jszip';
import { createHash } from 'node:crypto';

export interface EditOp {
  /** 1-based slide number */
  slide: number;
  /** 按出现顺序替换的第 n 个文本形状（0-based），或 'title' 匹配第一个大字号文本形状 */
  target: number | 'title';
  text: string;
  /** 目标旧值校验：若指定，则当前文本必须精确匹配旧值，否则拒绝编辑以防误修改 */
  expectedOldText?: string;
}

export interface ReversiblePatch {
  slide: number;
  target: number | 'title';
  oldText: string;
  newText: string;
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

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 编辑 PPTX 的指定页（只改目标 shape 文本，其它部件字节不动） */
export async function editPptx(
  buffer: Buffer,
  ops: EditOp[]
): Promise<{ buffer: Buffer; result: EditResult }> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);
  const slideFiles = files.filter((f) => SLIDE_RE.test(f)).sort((a, b) => {
    return Number(SLIDE_RE.exec(a)![1]) - Number(SLIDE_RE.exec(b)![1]);
  });

  const targetFiles = new Set<string>();
  for (const op of ops) {
    const f = slideFiles[op.slide - 1];
    if (f) targetFiles.add(f);
  }

  // 记录非目标部件的原始哈希
  const nonTargetHashes = new Map<string, string>();
  for (const f of files) {
    if (!targetFiles.has(f) && !zip.files[f].dir) {
      const b = await zip.files[f].async('nodebuffer');
      nonTargetHashes.set(f, hashBuffer(b));
    }
  }

  const changed: Array<{ file: string; op: EditOp }> = [];
  const patches: ReversiblePatch[] = [];

  for (const op of ops) {
    const file = slideFiles[op.slide - 1];
    if (!file) {
      return {
        buffer,
        result: {
          ok: false,
          error: `slide ${op.slide} not found (total slides: ${slideFiles.length})`,
          slideFiles,
          changed,
          patches,
          nonTargetPartsVerified: false,
          nonTargetPartsCount: nonTargetHashes.size,
        },
      };
    }

    const xml = await zip.files[file].async('string');
    const { newXml, oldText, found } = applyOp(xml, op);

    if (!found) {
      return {
        buffer,
        result: {
          ok: false,
          error: `no matching text shape for op on slide ${op.slide}`,
          slideFiles,
          changed,
          patches,
          nonTargetPartsVerified: false,
          nonTargetPartsCount: nonTargetHashes.size,
        },
      };
    }

    // 校验期望旧值
    if (op.expectedOldText !== undefined && oldText !== op.expectedOldText) {
      return {
        buffer,
        result: {
          ok: false,
          error: `old text mismatch on slide ${op.slide}: expected "${op.expectedOldText}", found "${oldText}"`,
          slideFiles,
          changed,
          patches,
          nonTargetPartsVerified: false,
          nonTargetPartsCount: nonTargetHashes.size,
        },
      };
    }

    zip.file(file, newXml);
    changed.push({ file, op });
    patches.push({
      slide: op.slide,
      target: op.target,
      oldText,
      newText: op.text,
    });
  }

  // 校验非目标部件内容哈希未被修改
  let nonTargetVerified = true;
  for (const [f, originalHash] of nonTargetHashes.entries()) {
    const currentBuf = await zip.files[f].async('nodebuffer');
    if (hashBuffer(currentBuf) !== originalHash) {
      nonTargetVerified = false;
      break;
    }
  }

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    buffer: out,
    result: {
      ok: true,
      slideFiles,
      changed,
      patches,
      nonTargetPartsVerified: nonTargetVerified,
      nonTargetPartsCount: nonTargetHashes.size,
    },
  };
}

/** 基于可逆 Patch 撤销修改，恢复初始文稿 */
export async function revertPptx(
  buffer: Buffer,
  patches: ReversiblePatch[]
): Promise<{ buffer: Buffer; result: EditResult }> {
  const reverseOps: EditOp[] = patches
    .slice()
    .reverse()
    .map((p) => ({
      slide: p.slide,
      target: p.target,
      text: p.oldText,
      expectedOldText: p.newText,
    }));
  return editPptx(buffer, reverseOps);
}

function applyOp(
  xml: string,
  op: EditOp
): { newXml: string; oldText: string; found: boolean } {
  // 提取所有带文本的 p:sp 块
  const spRe = /<p:sp>[\s\S]*?<p:txBody>[\s\S]*?<\/p:txBody>[\s\S]*?<\/p:sp>/g;
  const sps: Array<{ raw: string; start: number; end: number; sz: number; text: string }> = [];

  for (const m of xml.matchAll(spRe)) {
    const raw = m[0];
    const szMatch = /<a:rPr[^>]*sz="(\d+)"/.exec(raw);
    const tMatches = [...raw.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]);
    const text = tMatches.join('');
    sps.push({
      raw,
      start: m.index,
      end: m.index + raw.length,
      sz: szMatch ? Number(szMatch[1]) : 0,
      text,
    });
  }

  let targetIdx: number;
  if (op.target === 'title') {
    const t = sps.find((s) => s.sz >= 2400) ?? sps[0];
    if (!t) return { newXml: xml, oldText: '', found: false };
    targetIdx = sps.indexOf(t);
  } else {
    targetIdx = op.target;
  }

  const target = sps[targetIdx];
  if (!target) return { newXml: xml, oldText: '', found: false };

  const oldText = target.text;
  const replaced = replaceFirstText(target.raw, op.text);
  const newXml = xml.slice(0, target.start) + replaced + xml.slice(target.end);

  return { newXml, oldText, found: true };
}

function replaceFirstText(spXml: string, text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tRe = /<a:t>[\s\S]*?<\/a:t>/;
  if (tRe.test(spXml)) {
    return spXml.replace(tRe, `<a:t>${escaped}</a:t>`);
  }
  // 无文本 run：在最后一个 </a:p> 前插入 run
  const pRe = /<a:p>[\s\S]*?<\/a:p>/g;
  const ps = [...spXml.matchAll(pRe)];
  const lastP = ps[ps.length - 1];
  if (!lastP) return spXml;
  const run = `<a:r><a:t>${escaped}</a:t></a:r>`;
  return spXml.slice(0, lastP.index + lastP[0].length) + run + spXml.slice(lastP.index + lastP[0].length);
}
