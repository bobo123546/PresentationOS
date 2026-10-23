import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mdToDeck } from '../../tools/vertical-slice/md2deck.mjs';
import { runMechanicalQa } from '../../kernel/mechanical-qa/dist/index.js';

// Use a workspace package's declared ZIP reader; no Office or Python is needed.
const JSZip = createRequire(new URL('../../kernel/template-dna/package.json', import.meta.url))('jszip');
const cli = resolve('apps/cli/dist/index.js');
const legacy = resolve('tools/vertical-slice/markdown-to-deck.mjs');
const execute = (entry, args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });

async function slideXml(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  return Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1])).map(name => zip.file(name).async('string')));
}

function workspace(run) {
  const dir = mkdtempSync(join(tmpdir(), 'pres-content-upgrade-'));
  return Promise.resolve().then(() => run(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('H1 headings remain visible and the first H1 remains the document title', async () => workspace(async dir => {
  const source = '# Main\nIntro\n# Critical 42\nFact';
  const input = join(dir, 'headings.md');
  const output = join(dir, 'headings.pptx');
  writeFileSync(input, source);
  const deck = mdToDeck(source, 'test');
  assert.equal(deck.title, 'Main');
  assert.deepEqual(deck.slides.map(slide => slide.title), ['Main', 'Critical 42']);
  const result = execute(cli, ['compile', input, output]);
  assert.equal(result.status, 0, result.stderr);
  const slides = await slideXml(output);
  assert.equal(slides.length, 2);
  for (const text of ['Main', 'Intro', 'Critical 42', 'Fact']) assert.ok(slides.join('').includes(text), text);
}));

test('H1-only, consecutive H1 and H1 followed by H2 preserve ordered titles', async () => workspace(async dir => {
  for (const [index, [source, titles]] of [
    ['# Only title', ['Only title']],
    ['# First\n# Second\n# Third', ['First', 'Second', 'Third']],
    ['# Document\n## Section\nBody', ['Document', 'Section']],
  ].entries()) {
    assert.deepEqual(mdToDeck(source, 'test').slides.map(slide => slide.title), titles);
    const input = join(dir, `headings-${index}.md`);
    const output = join(dir, `headings-${index}.pptx`);
    writeFileSync(input, source);
    const result = execute(cli, ['compile', input, output]);
    assert.equal(result.status, 0, result.stderr);
    const slides = await slideXml(output);
    assert.equal(slides.length, titles.length);
    titles.forEach((title, page) => assert.ok(slides[page].includes(`<a:t>${title}</a:t>`)));
  }
}));

test('a separator-looking data row after the table delimiter is retained in the real PPTX', async () => workspace(async dir => {
  const source = '## Evidence\n| Item | Value |\n| --- | --- |\n| --- | --- |\n| A | 19 |';
  const table = mdToDeck(source, 'test').slides[0].blocks[0];
  assert.deepEqual(table.rows, [['---', '---'], ['A', '19']]);
  const input = join(dir, 'table.md');
  const output = join(dir, 'table.pptx');
  writeFileSync(input, source);
  const result = execute(cli, ['compile', input, output]);
  assert.equal(result.status, 0, result.stderr);
  const xml = (await slideXml(output)).join('');
  assert.equal((xml.match(/<a:t>---<\/a:t>/g) ?? []).length, 2);
  assert.ok(xml.includes('<a:t>19</a:t>'));
}));

test('only the first row after a table header can be its delimiter', () => {
  const source = '## Evidence\n| A | B |\n| x | y |\n| --- | --- |';
  assert.deepEqual(mdToDeck(source, 'test').slides[0].blocks[0].rows, [['x', 'y'], ['---', '---']]);
});

test('legacy compile refuses input aliases and existing report/output files', async () => workspace(async dir => {
  const input = join(dir, 'source.md');
  const source = '## Evidence\nKeep the original 42';
  writeFileSync(input, source);
  const oldReport = join(dir, 'existing.qa.json');
  const oldOutput = join(dir, 'existing.pptx');
  const hardlink = join(dir, 'source-alias.json');
  writeFileSync(oldReport, 'user report');
  writeFileSync(oldOutput, 'user output');
  linkSync(input, hardlink);
  const cases = [
    [input, input],
    [input, join(dir, 'alias.pptx'), input],
    [input, join(dir, 'hardlink.pptx'), hardlink],
    [input, join(dir, 'report-exists.pptx'), oldReport],
    [input, oldOutput],
  ];
  for (const args of cases) {
    const result = execute(legacy, args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.equal(readFileSync(input, 'utf8'), source);
  }
  assert.equal(readFileSync(oldReport, 'utf8'), 'user report');
  assert.equal(readFileSync(oldOutput, 'utf8'), 'user output');
  for (const name of ['alias.pptx', 'hardlink.pptx', 'report-exists.pptx']) assert.equal(existsSync(join(dir, name)), false);
}));

test('legacy compile keeps its default .qa.json path and canonical content preservation', async () => workspace(async dir => {
  const input = join(dir, 'source.md');
  const output = join(dir, 'source.pptx');
  writeFileSync(input, 'Preamble 987\n## Table\n| A | B |\n| --- | --- |\n| x | |');
  const result = execute(legacy, [input, output]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'source.qa.json'), 'utf8')).passed, true);
  assert.equal(existsSync(join(dir, 'source.loop.json')), false);
  const xml = (await slideXml(output)).join('');
  assert.ok(xml.includes('Preamble 987'));
}));

test('forbidden XML characters in table headers and cells fail before publishing a PPTX', async () => workspace(async dir => {
  const sources = [
    '## Evidence\n| Item | Bad\u0001 header |\n| --- | --- |\n| A | 19 |',
    '## Evidence\n| Item | Value |\n| --- | --- |\n| A | Bad\u0001 cell |',
  ];
  for (const [index, source] of sources.entries()) {
    const input = join(dir, `bad-${index}.md`);
    const output = join(dir, `bad-${index}.pptx`);
    writeFileSync(input, source);
    const result = execute(cli, ['compile', input, output]);
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(existsSync(output), false);
    const report = JSON.parse(readFileSync(join(dir, `bad-${index}.loop.json`), 'utf8'));
    assert.equal(report.passed, false);
    assert.ok(report.mechanical.slides.some(slide => slide.findings.some(finding => finding.check === 'invalid-xml-character')));
  }
}));

test('XML checks reject lone surrogates and accept supplementary Unicode in every rendered field', () => {
  const input = blocks => ({ pageWidth: 13.33, pageHeight: 7.5, rects: [], blocks });
  for (const text of ['\u0001', '\uD800', '\uDFFF', '\uFFFE', '\uFFFF']) {
    for (const block of [
      { type: 'text', text },
      { type: 'table', headers: [text], rows: [] },
      { type: 'table', headers: ['safe'], rows: [[text]] },
      { type: 'shape', label: text },
      { type: 'chart', data: { labels: [text], series: [{ name: text, values: [1] }] } },
    ]) assert.equal(runMechanicalQa(input([block])).ok, false, JSON.stringify(block));
  }
  assert.equal(runMechanicalQa(input([{ type: 'text', text: 'Good 😀 \u{10000}\u{10FFFF}\t\n\r < & >' }, { type: 'table', headers: ['😀'], rows: [['🚀']] }])).ok, true);
});

test('emoji and escaped punctuation survive table rendering in slide XML', async () => workspace(async dir => {
  const input = join(dir, 'unicode.md');
  const output = join(dir, 'unicode.pptx');
  writeFileSync(input, '## Unicode 😀\n| Item 😀 | Value |\n| --- | --- |\n| A | 🚀 < & > |');
  const result = execute(cli, ['compile', input, output]);
  assert.equal(result.status, 0, result.stderr);
  const xml = (await slideXml(output)).join('');
  assert.ok(xml.includes('😀'));
  assert.ok(xml.includes('🚀'));
  assert.ok(xml.includes('&lt; &amp; &gt;'));
  assert.doesNotMatch(xml, /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u);
}));
