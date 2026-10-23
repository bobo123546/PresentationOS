import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createTaskService } from '../../kernel/workflow/dist/index.js';
import { assertNewOutputs } from '../shared/io-safety.mjs';
const [input,output,explicitReport,...extra]=process.argv.slice(2);
let service;
try {
  if(!input||!output||extra.length||!output.toLowerCase().endsWith('.pptx')) throw new Error('Usage: loop-deck.mjs <input> <new-output.pptx> [new-report.json]');
  const reportPath=explicitReport??output.replace(/\.pptx$/i,'.loop.json');
  assertNewOutputs(input,[output,reportPath]);
  mkdirSync(dirname(resolve(output)),{recursive:true});
  const workDir=mkdtempSync(join(dirname(resolve(output)),'.pres-workflow-'));
  service=createTaskService({dbPath:join(workDir,'workflow.db')});
  const result=await service.compileMarkdown({projectId:'cli',markdown:readFileSync(input,'utf8'),outPptxPath:output,outReportPath:reportPath});
  console.log(JSON.stringify(result.summary??result));
  if(!result.ok){console.error(result.error);process.exitCode=1;}
} catch(error){console.error(error.message);process.exitCode=1;}
finally{service?.close();}
