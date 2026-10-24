import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { mdToDeck, parseDocument, documentToDeck, validateDeck, inspectDeck } from '../../kernel/workflow/dist/index.js';
import { assertNewOutputs, writeNewJson } from '../shared/io-safety.mjs';
const [input, output] = process.argv.slice(2);
try {
  if (!input || !output) throw new Error('Usage: qa-deck.mjs <input> <new-report.json>');
  assertNewOutputs(input,[output]);
  const extension=extname(input).toLowerCase();
  if(!['.md','.markdown','.txt','.csv','.tsv','.docx','.xlsx'].includes(extension)) throw new Error('Source QA supports MD/TXT/CSV/TSV/DOCX/XLSX. Use qa-native for an actual PPTX; source preflight does not inspect an exported file.');
  const bytes=readFileSync(input);
  const deck=['.md','.markdown','.txt'].includes(extension)
    ?mdToDeck(new TextDecoder('utf-8',{fatal:true}).decode(bytes),basename(input))
    :documentToDeck((await parseDocument(bytes,basename(input))).doc,basename(input));
  await validateDeck(deck);
  const report={...inspectDeck(deck),scope:'source-preflight',releaseReady:false,
    input:{path:resolve(input),sha256:createHash('sha256').update(bytes).digest('hex')},
    exportedArtifactValidation:'NOT_ATTEMPTED',semanticTruth:'NOT_VERIFIED'};
  writeNewJson(output,report);
  console.log(JSON.stringify({passed:report.passed,scope:report.scope,overall:report.visual.overall,report:output,native:report.native,exportedArtifactValidation:report.exportedArtifactValidation}));
  if(!report.passed) process.exitCode=1;
} catch(error) {console.error(error.message);process.exitCode=1;}
