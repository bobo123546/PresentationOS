import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mdToDeck, layoutFor } from '../vertical-slice/md2deck.mjs';
import { validateDeck } from '../vertical-slice/validate-deck.mjs';
import { applyRevisions } from '../../kernel/revision-engine/dist/index.js';
import { resolveLayout, renderDeck } from '../../kernel/pptx-engine/dist/index.js';
import { inspectDeck } from './deck-qa.mjs';
import { assertNewOutputs, writeNewJson } from '../shared/io-safety.mjs';
const [input,output,explicitReport]=process.argv.slice(2);
try {
  if(!input||!output||!output.toLowerCase().endsWith('.pptx')) throw new Error('Usage: loop-deck.mjs <input> <new-output.pptx> [new-report.json]');
  const reportPath=explicitReport??output.replace(/\.pptx$/i,'.loop.json');
  assertNewOutputs(input,[output,reportPath]);
  let deck=mdToDeck(readFileSync(input,'utf8'),'deck');
  await validateDeck(deck);
  const original=content(deck);
  const history=[];
  let qa=inspectDeck(deck);
  for(let round=0;round<3;round++) {
    history.push({round,overall:qa.visual.overall,passed:qa.passed});
    const suggestions=qa.visual.revision.filter((s)=>['split','increase_font','fix_contrast'].includes(s.action));
    if(!suggestions.length) break;
    const revised=applyRevisions(deck,suggestions);
    deck=revised.deck;
    for(const slide of deck.slides) slide.layout=layoutFor(slide);
    if(content(deck)!==original) throw new Error('Revision changed source content; refusing to render');
    await validateDeck(deck);
    qa=inspectDeck(deck);
  }
  const summary={passed:qa.passed,rounds:history,final:{overall:qa.visual.overall,slides:deck.slides.length,issues:qa.visual.issues},mechanical:qa.mechanical,native:qa.native,sourceContentPreserved:true,pptx:output};
  if(!qa.passed){writeNewJson(reportPath,summary);console.error('QA failed; presentation was not published');process.exitCode=1;}
  else {mkdirSync(dirname(output),{recursive:true});await renderDeck(deck,{outPath:output,resolveRects:(slide)=>resolveLayout(slide.layout)});writeNewJson(reportPath,summary);console.log(JSON.stringify(summary));}
} catch(error){console.error(error.message);process.exitCode=1;}
function content(deck){return JSON.stringify(deck.slides.flatMap((s)=>s.blocks).map(({fontScale,color,...block})=>block));}
