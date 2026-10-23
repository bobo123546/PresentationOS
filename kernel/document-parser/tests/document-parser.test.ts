// Tests for @pres/document-parser (P05)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  parseDocument,
  extractFacts,
  verifyFactsPreserved,
  documentIrToDeck,
  detectFormat,
} from '../src/index.js';

function createSimpleZipBuffer(files: Record<string, string>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const [filename, content] of Object.entries(files)) {
    const fnBuf = Buffer.from(filename, 'utf8');
    const rawData = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(rawData);

    // Local Header
    const lh = Buffer.alloc(30 + fnBuf.length + compressed.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); // Deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14); // crc
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(rawData.length, 22);
    lh.writeUInt16LE(fnBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    fnBuf.copy(lh, 30);
    compressed.copy(lh, 30 + fnBuf.length);

    localHeaders.push(lh);

    // Central Directory Header
    const cdh = Buffer.alloc(46 + fnBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(rawData.length, 24);
    cdh.writeUInt16LE(fnBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    fnBuf.copy(cdh, 46);

    cdHeaders.push(cdh);
    offset += lh.length;
  }

  const cdTotalSize = cdHeaders.reduce((acc, h) => acc + h.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(cdHeaders.length, 8);
  eocd.writeUInt16LE(cdHeaders.length, 10);
  eocd.writeUInt32LE(cdTotalSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

describe('PresentationOS Multi-Format Document Parser Suite (P05)', () => {
  test('TC-DP01: Format detection accurately identifies extensions and text contents', () => {
    assert.equal(detectFormat('slides.md'), 'markdown');
    assert.equal(detectFormat('document.docx'), 'docx');
    assert.equal(detectFormat('metrics.csv'), 'csv');
    assert.equal(detectFormat('sales.xlsx'), 'xlsx');
    assert.equal(detectFormat('notes.txt'), 'plaintext');
    assert.equal(detectFormat('unknown.dat', '# Title\n- bullet'), 'markdown');
  });

  test('TC-DP02: Fact extractor identifies currencies, percentages, dates, and units', () => {
    const text = '在 2026-10-23，该项目达成 $50M 轮融资，同比增长 120%，并在 500ms 内交付 16GB 吞吐量。';
    const facts = extractFacts(text);

    assert.ok(facts.length >= 4, `Expected at least 4 facts, found ${facts.length}`);
    const values = facts.map((f) => f.literalValue);

    assert.ok(values.includes('2026-10-23'), 'Date must be extracted');
    assert.ok(values.includes('$50M'), 'Currency must be extracted');
    assert.ok(values.includes('120%'), 'Percentage must be extracted');
    assert.ok(values.includes('500ms'), 'Unit ms must be extracted');
  });

  test('TC-DP03: Fact preservation verifier passes on exact match and flags stripped numbers', () => {
    const text = '营收 100万元，利润率 25%，耗时 50ms。';
    const facts = extractFacts(text);

    // Full match
    const reportPass = verifyFactsPreserved(facts, '我们的营收达到 100万元，净利润率高达 25%，核心链路耗时 50ms。');
    assert.equal(reportPass.preserved, true);
    assert.equal(reportPass.missingFacts.length, 0);

    // Missing numbers (e.g., rewritten or stripped)
    const reportFail = verifyFactsPreserved(facts, '我们的营收可观，净利润率很好，耗时很短。');
    assert.equal(reportFail.preserved, false);
    assert.ok(reportFail.missingFacts.length >= 2);
  });

  test('TC-DP04: Parse Markdown produces valid DocumentIR with headings, paragraphs, lists, and tables', async () => {
    const md = `# PresentationOS 战略规划

## 核心指标
- 2026年累计交付 1000套 文稿
- 客户净满意度 98%

| 季度 | 目标金额 | 达成率 |
| Q1 | $10M | 105% |
| Q2 | $15M | 110% |

总结段落：已全面完成上半年预算目标。`;

    const result = await parseDocument(md, 'strategy.md');
    assert.ok(result.doc);
    assert.equal(result.doc.sourceType, 'markdown');
    assert.ok(result.doc.blocks.length >= 4);

    assert.equal(result.summary.headingsCount, 2);
    assert.equal(result.summary.tablesCount, 1);
    assert.ok(result.facts.length >= 5);
  });

  test('TC-DP05: Parse Plaintext produces DocumentIR with paragraph division', async () => {
    const txt = `产品概述报告

这是第一段描述，包含 100位 核心客户参与调研。

这是第二段分析，总投入达到 $50000。`;

    const result = await parseDocument(txt, 'report.txt');
    assert.equal(result.doc.sourceType, 'plaintext');
    assert.ok(result.doc.blocks.length >= 2);
    assert.ok(result.facts.some((f) => f.literalValue.includes('100位')));
  });

  test('TC-DP06: Parse CSV and TSV retains headers, empty cells, and quotes', async () => {
    const csv = `ID,Name,"Financial Target",Notes
1,Alpha,$100M,"Target approved"
2,Beta,,Pending review`;

    const result = await parseDocument(csv, 'targets.csv');
    assert.equal(result.doc.sourceType, 'csv');
    assert.equal(result.summary.tablesCount, 1);

    const tableBlock: any = result.doc.blocks.find((b) => b.type === 'table');
    assert.ok(tableBlock);
    assert.deepEqual(tableBlock.headers, ['ID', 'Name', 'Financial Target', 'Notes']);
    assert.equal(tableBlock.rows.length, 2);
    assert.equal(tableBlock.rows[1][2], ''); // empty cell preserved
    assert.equal(tableBlock.rows[0][2], '$100M');
  });

  test('TC-DP07: Parse DOCX archive extracts headings, paragraphs, and tables', async () => {
    const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>DOCX Annual Strategy 2026</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Key performance indicator: 99.5% uptime across 10个 数据中心.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Throughput</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>50000 QPS</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const docxBuffer = createSimpleZipBuffer({
      'word/document.xml': docxXml,
    });

    const result = await parseDocument(docxBuffer, 'strategy.docx');
    assert.equal(result.doc.sourceType, 'docx');
    assert.equal(result.summary.headingsCount, 1);
    assert.equal(result.summary.tablesCount, 1);
    assert.ok(result.facts.some((f) => f.literalValue.includes('99.5%')));
  });

  test('TC-DP08: Parse XLSX archive extracts sheet rows with shared strings', async () => {
    const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>Department</t></si>
  <si><t>Budget</t></si>
  <si><t>Engineering</t></si>
</sst>`;

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2"><v>5000000</v></c>
    </row>
  </sheetData>
</worksheet>`;

    const xlsxBuffer = createSimpleZipBuffer({
      'xl/sharedStrings.xml': sharedStringsXml,
      'xl/worksheets/sheet1.xml': sheetXml,
    });

    const result = await parseDocument(xlsxBuffer, 'budget.xlsx');
    assert.equal(result.doc.sourceType, 'xlsx');
    assert.equal(result.summary.tablesCount, 1);

    const tableBlock: any = result.doc.blocks[0];
    assert.deepEqual(tableBlock.headers, ['Department', 'Budget']);
    assert.equal(tableBlock.rows[0][0], 'Engineering');
    assert.equal(tableBlock.rows[0][1], '5000000');
  });

  test('TC-DP09: documentIrToDeck maps blocks into compliant presentation slides', async () => {
    const md = `# Q4 Strategy Deck

## Product Overview
- Feature 1: Pure TypeScript Engine
- Feature 2: 100% Fact Preservation

## Financial Highlights
- Target achieved $20M`;

    const parsed = await parseDocument(md, 'deck.md');
    const deck = documentIrToDeck(parsed.doc);

    assert.equal(deck.schema, 'deck-spec');
    assert.equal(deck.title, 'Q4 Strategy Deck');
    assert.equal(deck.slides.length, 3);
    assert.equal(deck.slides[0].kind, 'cover');
    assert.equal(deck.slides[1].title, 'Product Overview');
    assert.equal(deck.slides[2].title, 'Financial Highlights');
  });
});
