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
test('compile rejects QA failure before publishing a PPTX',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-qa-failure-'));
  try{
    const input=join(dir,'invalid.md');const output=join(dir,'failed.pptx');writeFileSync(input,'## Bad\nUnsafe \u0001 character');
    const result=spawnSync(process.execPath,[resolve('apps/cli/dist/index.js'),'compile',input,output],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(existsSync(output),false);
    assert.equal(JSON.parse(readFileSync(join(dir,'failed.loop.json'),'utf8')).passed,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
