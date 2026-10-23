import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, extractFacts, verifyFactsPreserved } from '../src/index.js';
import { officeZip } from './fixtures.js';

test('unimplemented PDF and PPTX ingestion fails explicitly instead of decoding binary as text', async () => {
  for (const [name, data] of [['report.pdf', Buffer.from('%PDF-1.7\u0000fake')], ['deck.pptx', officeZip({ 'ppt/slides/slide1.xml': '<slide/>' })]] as const) {
    await assert.rejects(parseDocument(data, name), /unsupported document format.*(pdf|pptx)/i);
  }
  await assert.rejects(parseDocument(Buffer.from([0xff, 0xfe, 0x00, 0x50]), 'unknown.bin'), /utf-8|binary/i);
});

test('DOCX paragraphs and tables retain body order without duplicating table-cell paragraphs', async () => {
  const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const table = `<w:tbl><w:tr><w:tc>${p('项目')}</w:tc><w:tc>${p('金额')}</w:tc></w:tr><w:tr><w:tc>${p('净利润')}</w:tc><w:tc>${p('-12.5 万元')}${p('说明 &amp; &#x4e2d;&#25991;')}</w:tc></w:tr></w:tbl>`;
  const result = await parseDocument(officeZip({ 'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('表前')}${table}<w:sdt><w:sdtContent>${p('表后 10,000 家')}</w:sdtContent></w:sdt></w:body></w:document>` }), 'ordered.docx');
  assert.deepEqual(result.doc.blocks.map(b => b.type), ['paragraph', 'table', 'paragraph']);
  const block = result.doc.blocks[1]; assert.equal(block.type, 'table');
  if (block.type === 'table') assert.deepEqual(block.rows, [['净利润', '-12.5 万元\n说明 & 中文']]);
  assert.equal(result.facts.filter(f => f.literalValue === '-12.5 万元').length, 1);
  assert.ok(result.rawText.startsWith('表前\n'));
  assert.ok(!result.rawText.includes('PK\u0003\u0004'));
});

test('DOCX preserves tabs/breaks and rejects malformed XML or nested tables it cannot represent', async () => {
  const parsed = await parseDocument(officeZip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>甲</w:t><w:tab/><w:t>乙</w:t><w:br/><w:t>丙</w:t></w:r></w:p></w:body></w:document>' }), 'breaks.docx');
  assert.equal(parsed.doc.blocks[0].type === 'paragraph' && parsed.doc.blocks[0].text, '甲\t乙\n丙');
  await assert.rejects(parseDocument(officeZip({ 'word/document.xml': '<w:document><w:body><w:p><w:t>broken</w:t></w:body></w:document>' }), 'broken.docx'), /xml|mismatch/i);
  await assert.rejects(parseDocument(officeZip({ 'word/document.xml': '<w:document><w:body><w:tbl><w:tr><w:tc><w:tbl/></w:tc></w:tr></w:tbl></w:body></w:document>' }), 'nested.docx'), /nested table.*unsupported/i);
});

test('XLSX sparse cell references preserve column positions and trailing empty cells', async () => {
  const result = await parseDocument(officeZip({ 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>项目</t></is></c><c r="C1" t="inlineStr"><is><t>金额</t></is></c><c r="D1"/></row><row r="2"><c r="A2" t="inlineStr"><is><t>利润</t></is></c><c r="C2"><v>-12.5</v></c></row><row r="3"><c r="C3"><v>10000</v></c><c r="AA3"><v>7</v></c></row></sheetData></worksheet>' }), 'sparse.xlsx');
  const table = result.doc.blocks[0]; assert.equal(table.type, 'table');
  if (table.type !== 'table') return;
  assert.equal(table.headers.length, 27);
  assert.deepEqual(table.headers.slice(0, 4), ['项目', '', '金额', '']);
  assert.deepEqual(table.rows[0].slice(0, 4), ['利润', '', '-12.5', '']);
  assert.equal(table.rows[1][0], ''); assert.equal(table.rows[1][2], '10000'); assert.equal(table.rows[1][26], '7');
  assert.ok(result.facts.some(f => f.literalValue === '-12.5'));
});

test('XLSX reads all worksheets in workbook relationship order, including rich inline strings', async () => {
  const result = await parseDocument(officeZip({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="先读" sheetId="2" r:id="r2"/><sheet name="后读" sheetId="1" r:id="r1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>后页</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><r><t>先</t></r><r><t>页</t></r></is></c></row></sheetData></worksheet>'
  }), 'sheets.xlsx');
  assert.deepEqual(result.doc.blocks.filter(b => b.type === 'heading').map(b => b.type === 'heading' && b.text), ['先读', '后读']);
  assert.deepEqual(result.doc.blocks.filter(b => b.type === 'table').map(b => b.type === 'table' && b.headers[0]), ['先页', '后页']);
});

test('XLSX formulas without cached values and invalid shared-string references fail visibly', async () => {
  await assert.rejects(parseDocument(officeZip({ 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1"><f>SUM(B1:B2)</f></c></row></sheetData></worksheet>' }), 'formula.xlsx'), /cached value|formula/i);
  await assert.rejects(parseDocument(officeZip({ 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>99</v></c></row></sheetData></worksheet>' }), 'strings.xlsx'), /shared.string/i);
});

test('fact extraction preserves full signed quantities and emits one fact per occurrence in source order', () => {
  const text = '利润 -12.5 万元，客户 10,000 家；融资 100亿美元，增长 −5.0%，日期 2026年10月23日；延迟 500ms，内存 16GB，批次 2。';
  const facts = extractFacts(text, 'source', 7);
  assert.deepEqual(facts.map(f => f.literalValue), ['-12.5 万元', '10,000 家', '100亿美元', '−5.0%', '2026年10月23日', '500ms', '16GB', '2']);
  assert.deepEqual(facts.map(f => f.factId), facts.map((_, i) => `fact_${String(i + 7).padStart(4, '0')}`));
  for (const f of facts) assert.equal(text.slice(...f.charRange!), f.literalValue);
  assert.equal(extractFacts('营收 $1,250.50M 与净额 -€500.00').map(f => f.literalValue).join('|'), '$1,250.50M|-€500.00');
});

test('fact preservation rejects substring matches, sign loss and lost repeated occurrences', () => {
  assert.equal(verifyFactsPreserved(extractFacts('客户 50 家'), '客户 150 家').preserved, false);
  assert.equal(verifyFactsPreserved(extractFacts('净额 -12.5万元'), '净额 12.5万元').preserved, false);
  const twice = extractFacts('甲 25%，乙 25%');
  assert.equal(twice.length, 2);
  const report = verifyFactsPreserved(twice, '仅 25%');
  assert.equal(report.preserved, false); assert.equal(report.preservedFacts, 1);
  assert.equal(verifyFactsPreserved(extractFacts('客户 10,000 家'), '客户 10,000\n家').preserved, true);
});

test('streamed Office ZIP data descriptors are read, corrupted entries are rejected', async () => {
  const bytes = officeZip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>真实正文 100万元。</w:t></w:r></w:p></w:body></w:document>' }, true);
  assert.ok((await parseDocument(bytes, 'streamed.docx')).rawText.includes('100万元'));
  const corrupted = Buffer.from(bytes);
  corrupted[30 + Buffer.byteLength('word/document.xml') + 1] ^= 1;
  await assert.rejects(parseDocument(corrupted, 'corrupt.docx'), /CRC|ZIP/i);
  await assert.rejects(parseDocument(Buffer.from('PK broken'), 'broken.docx'), /ZIP/i);
});

test('fact punctuation boundaries and explicit Chinese negative sign remain literal', () => {
  assert.deepEqual(extractFacts('Value 2. 负12.5万元；3，4。').map(f => f.literalValue), ['2', '负12.5万元', '3', '4']);
});

test('XML numeric entities and quoted attributes are preserved; DTDs and bare ampersands are refused', async () => {
  const wrap = (inside: string) => officeZip({ 'word/document.xml': inside });
  const parsed = await parseDocument(wrap("<q:document><q:body><q:p><q:r><q:t xml:space='preserve'> &#x4e2d;&#25991; &apos; &quot; &gt; </q:t></q:r></q:p></q:body></q:document>"), 'entities.docx');
  assert.equal(parsed.rawText, " 中文 ' \" > ");
  await assert.rejects(parseDocument(wrap('<!DOCTYPE document [<!ENTITY leak SYSTEM "file:///C:/private">]><document><body/></document>'), 'dtd.docx'), /DTD|declaration/i);
  await assert.rejects(parseDocument(wrap('<document><body><p><t>bad & value</t></p></body></document>'), 'amp.docx'), /entity/i);
});

test('DOCX embedded images and math are refused instead of silently omitted or flattened to wrong values', async () => {
  for (const object of ['<w:drawing><a:blip/></w:drawing>', '<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>', '<w:altChunk r:id="external"/>']) {
    const bytes = officeZip({ 'word/document.xml': `<w:document><w:body><w:p><w:r><w:t>正文</w:t></w:r>${object}</w:p></w:body></w:document>` });
    await assert.rejects(parseDocument(bytes, 'asset.docx'), /unsupported DOCX body feature/i);
  }
});

test('CSV quoted multiline fields preserve whitespace, escaped quotes and explicit empty records', async () => {
  const parsed = await parseDocument('name,note\r\n"  Alice  "," line 1\r\nline ""2"" "\r\n,\r\n', 'quoted.csv');
  const table = parsed.doc.blocks[0]; assert.equal(table.type, 'table');
  if (table.type === 'table') assert.deepEqual(table.rows, [['  Alice  ', ' line 1\r\nline "2" '], ['', '']]);
});

test('malformed CSV quoting and ragged records fail visibly rather than modifying fields', async () => {
  for (const content of ['name,note\nAlice,"open', 'name,note\nAli"ce,value', 'name,note\n"Alice"tail,value', 'name,note\nAlice,one,extra']) {
    await assert.rejects(parseDocument(content, 'invalid.csv'), /CSV|quote|record|column/i);
  }
});

test('OOXML invalid byte encodings and illegal numeric entities fail; UTF-16 text remains intact', async () => {
  const prefix = '<w:document><w:body><w:p><w:r><w:t>', suffix = '</w:t></w:r></w:p></w:body></w:document>';
  const invalid = Buffer.concat([Buffer.from(prefix), Buffer.from([0xff]), Buffer.from(suffix)]);
  await assert.rejects(parseDocument(officeZip({ 'word/document.xml': invalid }), 'encoding.docx'), /encoding|UTF-8/i);
  for (const code of ['&#1;', '&#xFFFE;']) await assert.rejects(parseDocument(officeZip({ 'word/document.xml': prefix + code + suffix }), 'entity.docx'), /entity/i);
  const encoded = Buffer.from('<?xml version="1.0" encoding="UTF-16"?>' + prefix + '正文 -12.5万元' + suffix, 'utf16le');
  const little = Buffer.concat([Buffer.from([0xff, 0xfe]), encoded]);
  const big = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(encoded).swap16()]);
  for (const bytes of [little, big]) assert.equal((await parseDocument(officeZip({ 'word/document.xml': bytes }), 'utf16.docx')).rawText, '正文 -12.5万元');
});

test('plaintext paragraph line endings stay intact so source fact ranges point to the actual block', async () => {
  const parsed = await parseDocument('标题\r\n\r\n第一行\r\n第二行利润 -12.5万元', 'ranges.txt');
  const body = parsed.doc.blocks[1]; assert.equal(body.type, 'paragraph');
  if (body.type !== 'paragraph') return;
  assert.equal(body.text, '第一行\r\n第二行利润 -12.5万元');
  for (const fact of body.facts ?? []) assert.equal(body.text.slice(...fact.charRange!), fact.literalValue);
});
