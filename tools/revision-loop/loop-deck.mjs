import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { createTaskService } from '../../kernel/workflow/dist/index.js';
import { assertNewOutputs } from '../shared/io-safety.mjs';
const [input,output,...remaining]=process.argv.slice(2);
let service;
try {
  const args=[...remaining];
  const explicitReport=args[0]&&!args[0].startsWith('--')?args.shift():undefined;
  let reference;
  if(args.length){if(args.length!==2||args[0]!=='--template'||!args[1]||args[1].startsWith('--'))throw new Error('Invalid template option');reference=resolve(args[1]);}
  if(!input||!output||!output.toLowerCase().endsWith('.pptx')) throw new Error('Usage: loop-deck.mjs <input.md|input.txt> <new-output.pptx> [new-report.json] [--template reference.pptx]');
  if(!['.md','.markdown','.txt','.csv','.tsv','.docx','.xlsx'].includes(extname(input).toLowerCase()))throw new Error('Unsupported compile format; refusing to decode an unsupported document as UTF-8');
  const reportPath=explicitReport??output.replace(/\.pptx$/i,'.loop.json');
  assertNewOutputs(input,[output,reportPath]);
  if(reference)assertNewOutputs(reference,[output,reportPath]);
  mkdirSync(dirname(resolve(output)),{recursive:true});
  const workDir=mkdtempSync(join(dirname(resolve(output)),'.pres-workflow-'));
  service=createTaskService({dbPath:join(workDir,'workflow.db')});
  const options={projectId:'cli',outPptxPath:output,outReportPath:reportPath,referencePptxPath:reference};
  const result=['.md','.markdown','.txt'].includes(extname(input).toLowerCase())
    ?await service.compileMarkdown({...options,markdown:new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(input))})
    :await service.compileDocumentFile({...options,inputPath:input});
  console.log(JSON.stringify(result.summary??result));
  if(!result.ok){console.error(result.error);process.exitCode=1;}
} catch(error){console.error(error.message);process.exitCode=1;}
finally{service?.close();}
