import { readFileSync } from 'node:fs';
import { mdToDeck } from '../vertical-slice/md2deck.mjs';
import { validateDeck } from '../vertical-slice/validate-deck.mjs';
import { inspectDeck } from '../revision-loop/deck-qa.mjs';
import { assertNewOutputs, writeNewJson } from '../shared/io-safety.mjs';
const [input, output] = process.argv.slice(2);
try {
  if (!input || !output) throw new Error('Usage: qa-deck.mjs <input> <new-report.json>');
  assertNewOutputs(input,[output]);
  const deck=mdToDeck(readFileSync(input,'utf8'),'deck');
  await validateDeck(deck);
  const report=inspectDeck(deck);
  writeNewJson(output,report);
  console.log(JSON.stringify({passed:report.passed,overall:report.visual.overall,report:output,native:report.native}));
  if(!report.passed) process.exitCode=1;
} catch(error) {console.error(error.message);process.exitCode=1;}
