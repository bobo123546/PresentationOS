import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeckScenes, type DeckSpec, type SlideBlock } from '../src/index.js';
import { detectDomain, DOMAIN_METAS, THEME_PRESETS } from '../src/renderer.js';

function deck(text = '', blocks: SlideBlock[] = []): DeckSpec {
  return { title: text, slides: [{ id: 's1', kind: 'content', title: '', blocks }] };
}

test('domain routing does not treat Capital and identifier substrings as ASCII domain terms', () => {
  for (const text of ['Capital allocation', 'rapid growth', 'my_api endpoint', 'api2', 'hipopotamus', 'sotavento', 'doing work', 'my_gdpr_policy']) {
    assert.equal(detectDomain(deck(text)), 'business', text);
  }
  assert.equal(detectDomain(deck('Capital allocation: IPO')), 'finance');
});

test('standalone ASCII domain terms match case-insensitively next to punctuation and Chinese', () => {
  for (const [text, expected] of [
    ['(API)接口', 'engineering'], ['GitHub / Docker / K8S', 'engineering'],
    ['SOTA-baseline', 'academic'], ['DOI: reference', 'academic'],
    ['FDA/NMPA', 'medical'], ['EBITDA; IPO', 'finance'],
    ['MECE分析', 'consulting'], ['GDPR/PIPL', 'legal'],
  ] as const) assert.equal(detectDomain(deck(text)), expected, text);
});

test('table headers and every row cell contribute to domain routing without a text block', () => {
  assert.equal(detectDomain(deck('', [{ type: 'table', headers: ['临床', '指标'], rows: [['A', '8']] }])), 'medical');
  assert.equal(detectDomain(deck('', [{ type: 'table', headers: ['项目'], rows: [['ordinary'], ['净利润']] }])), 'finance');
  assert.equal(detectDomain(deck('', [{ type: 'table', headers: ['Capital'], rows: [['rapid']] }])), 'business');
});

test('chart category labels and series names both contribute without stringifying JSON keys or paths', () => {
  assert.equal(detectDomain(deck('', [{ type: 'chart', data: { labels: ['SOTA'], series: [{ name: 'Score', values: [1] }] } }])), 'academic');
  assert.equal(detectDomain(deck('', [{ type: 'chart', data: { labels: ['A'], series: [{ name: 'QPS', values: [1] }] } }])), 'engineering');
  assert.equal(detectDomain(deck('', [{ type: 'image', src: 'C:/github/clinical-api.png', alt: 'Capital allocation' }])), 'business');
  assert.equal(detectDomain(deck('', [{ type: 'shape', label: '法律', shape: 'rect' }])), 'legal');
});

test('explicit deck and design-token domains override conflicting table and chart heuristics', () => {
  const source = deck('API API API', [{ type: 'table', headers: ['临床'], rows: [['患者']] }]);
  source.designTokens = { domain: 'finance' };
  assert.equal(detectDomain(source), 'finance');
  source.domain = 'education';
  assert.equal(detectDomain(source), 'education');
  for (const invalid of ['constructor', 'toString', 'unknown']) {
    const untrusted = deck('API');
    untrusted.designTokens = { domain: invalid };
    assert.equal(detectDomain(untrusted), 'engineering');
  }
});

test('domain decisions select the actual shared-scene preset and explicit render override wins', () => {
  const source = deck('Capital', [{ type: 'table', headers: ['净利润'], rows: [['-12.5']] }]);
  const resolveRects = () => new Map();
  assert.equal(resolveDeckScenes(source, { resolveRects })[0].theme.preset.name, 'financial-gold');
  source.domain = 'medical';
  assert.equal(resolveDeckScenes(source, { resolveRects })[0].theme.preset.name, 'healthcare-mint');
  assert.equal(resolveDeckScenes(source, { resolveRects, domain: 'engineering' })[0].theme.preset.name, 'tech-dark');
  assert.equal(Object.keys(DOMAIN_METAS).length, 10);
  assert.equal(Object.keys(THEME_PRESETS).length, 8);
});
