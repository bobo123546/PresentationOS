import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,linkSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {mdToDeck} from '../../tools/vertical-slice/md2deck.mjs';
import {validateDeck} from '../../tools/vertical-slice/validate-deck.mjs';
import {assertNewOutputs} from '../../tools/shared/io-safety.mjs';
import {childExit} from '../../apps/cli/dist/index.js';
import {createRequire} from 'node:module';
const JSZip=createRequire(import.meta.url)('../../kernel/pptx-engine/node_modules/jszip');

test('markdown preserves preamble, empty table cells and the final numeric fact',async()=>{
  const source='Preamble\n## Evidence\n'+'Long text '.repeat(140)+'987654321\n\n| Key | Value |\n| --- | --- |\n| A | |\n| B | 19 |';
  const deck=mdToDeck(source,'test');await validateDeck(deck);
  const text=deck.slides.flatMap(s=>s.blocks).filter(b=>b.type==='text').map(b=>b.text).join('');
  assert.ok(text.includes('Preamble'));assert.ok(text.endsWith('987654321'));
  const table=deck.slides.flatMap(s=>s.blocks).find(b=>b.type==='table');assert.deepEqual(table.rows[0],['A','']);
});
test('schema gate rejects a missing layout and duplicate slide IDs',async()=>{
  const deck=mdToDeck('## One\nBody','test');delete deck.slides[0].layout;await assert.rejects(()=>validateDeck(deck),/schema/);
  const valid=mdToDeck('## One\nA\n## Two\nB','test');valid.slides[1].id=valid.slides[0].id;await assert.rejects(()=>validateDeck(valid),/Duplicate/);
});
test('CLI preserves non-md input and rejects source aliases',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-cli-'));
  try{
    const input=join(dir,'sample.txt');const source='## One\nBody text';writeFileSync(input,source);
    for(const target of [input,join(dir,'hardlink.json')]){
      if(target!==input)linkSync(input,target);
      const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'qa',input,target],{encoding:'utf8'});
      assert.notEqual(result.status,0);assert.equal(readFileSync(input,'utf8'),source);
    }
    const dangling=join(dir,'dangling.json');symlinkSync(join(dir,'missing'),dangling,'junction');
    assert.throws(()=>assertNewOutputs(input,[dangling]),/overwrite/);
    const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'qa',input],{env:{...process.env,PRES_DATA_DIR:join(dir,'data')},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(input,'utf8'),source);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI child failures cannot become success',()=>{assert.equal(childExit({status:null}),1);assert.equal(childExit({status:7}),7);});

test('CLI refuses binary input and malformed template options without publishing',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-cli-reference-'));
  try{
    const source=join(dir,'source.pptx'),output=join(dir,'output.pptx');writeFileSync(source,Buffer.from([0x50,0x4b,3,4,0,255]));
    for(const args of [[source,output],[source,output,'--template'],[source,output,'--template','x.txt']]){
      const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'compile',...args],{encoding:'utf8'});
      assert.notEqual(result.status,0);assert.equal(existsSync(output),false);
    }
    assert.deepEqual(readFileSync(source),Buffer.from([0x50,0x4b,3,4,0,255]));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('CLI rejects malformed UTF-8 rather than rendering replacement characters',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-cli-utf8-'));
  try{
    const source=join(dir,'broken.md'),output=join(dir,'output.pptx');writeFileSync(source,Buffer.from([0x23,0x20,0x41,0x0A,0xC3,0x28]));
    const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'compile',source,output],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(existsSync(output),false);assert.match(result.stderr,/encoded data|encoding/i);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('compile rejects QA failure before publishing a PPTX',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-qa-failure-'));
  try{
    const input=join(dir,'invalid.md');const output=join(dir,'failed.pptx');writeFileSync(input,'## Bad\nUnsafe \u0001 character');
    const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'compile',input,output],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(existsSync(output),false);
    assert.equal(JSON.parse(readFileSync(join(dir,'failed.loop.json'),'utf8')).passed,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('source QA uses document adapters and labels its scope without certifying an exported PPTX',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-source-qa-'));
  try{
    const docx=new JSZip();
    docx.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Source adapter check 123</w:t></w:r></w:p></w:body></w:document>');
    const cases=[['sample.csv',Buffer.from('Metric,Value\nRevenue,123\n')],['sample.docx',await docx.generateAsync({type:'nodebuffer'})]];
    for(const [filename,bytes] of cases){
      const source=join(dir,filename),report=join(dir,filename+'.qa.json');writeFileSync(source,bytes);
      const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'qa',source,report],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      const qa=JSON.parse(readFileSync(report,'utf8'));
      assert.equal(qa.scope,'source-preflight');assert.equal(qa.releaseReady,false);
      assert.equal(qa.native.status,'NOT_ATTEMPTED');assert.equal(qa.exportedArtifactValidation,'NOT_ATTEMPTED');
      assert.match(qa.input.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(readFileSync(source),bytes);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('source QA rejects malformed UTF-8, unsupported binary files and PPTX without writing success reports',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-source-qa-invalid-'));
  try{
    for(const name of ['broken.txt','export.pptx','unhandled.pdf']){
      const source=join(dir,name),report=join(dir,name+'.qa.json');writeFileSync(source,Buffer.from([0x50,0x4b,0,255]));
      const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'qa',source,report],{encoding:'utf8'});
      assert.notEqual(result.status,0);assert.equal(existsSync(report),false);
      if(name.endsWith('.pptx'))assert.match(result.stderr,/qa-native/);
    }
    const help=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'--help'],{encoding:'utf8'});
    assert.match(help.stdout,/source preflight/);assert.match(help.stdout,/does not certify product/);
    const bad=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'qa-native',join(dir,'broken.txt')],{encoding:'utf8'});
    assert.notEqual(bad.status,0);assert.match(bad.stderr,/Usage:/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
