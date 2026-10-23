import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {auditRepo} from './audit-docs.mjs';

function fixture(change){
  const dir=mkdtempSync(join(tmpdir(),'pres-audit-'));
  try{
    for(const entry of ['package.json','README.md','docs','state']) cpSync(resolve(entry),join(dir,entry),{recursive:true});
    mkdirSync(join(dir,'apps/cli'),{recursive:true});
    cpSync(resolve('apps/cli/package.json'),join(dir,'apps/cli/package.json'));
    mkdirSync(join(dir,'098/schemas'),{recursive:true});
    cpSync(resolve('098/schemas/source_ir.schema.json'),join(dir,'098/schemas/source_ir.schema.json'));
    const current=JSON.parse(readFileSync(join(dir,'state/backlog.json'),'utf8'));
    for(const path of new Set(current.flatMap(task=>(task.evidence??[]).map(ref=>typeof ref==='object'?ref.path:'')).filter(path=>path.startsWith('evidence/')).map(path=>path.split('/').slice(0,2).join('/'))))if(existsSync(resolve(path)))cpSync(resolve(path),join(dir,path),{recursive:true});
    const mutate=(file,fn)=>{const path=join(dir,file);writeFileSync(path,JSON.stringify(fn(JSON.parse(readFileSync(path,'utf8'))),null,2));};
    change(mutate,dir);
    return auditRepo(dir);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('current project governance passes',()=>assert.equal(auditRepo(resolve('.')).passAll,true));
test('unchanged isolated governance fixture passes',()=>assert.equal(fixture(()=>{}).passAll,true));
test('version mismatch fails',()=>assert.equal(fixture(m=>m('package.json',p=>({...p,version:'9.0.0'}))).passAll,false));
test('CLI version cannot drift from the product',()=>assert.equal(fixture(m=>m('apps/cli/package.json',p=>({...p,version:'9.0.0'}))).passAll,false));
test('release-ready with open blockers fails',()=>assert.equal(fixture(m=>m('state/project_state.json',p=>({...p,release_status:'RELEASE_READY'}))).passAll,false));
test('unknown release state fails',()=>assert.equal(fixture(m=>m('state/project_state.json',p=>({...p,release_status:'READY_ENOUGH'}))).passAll,false));
test('duplicate and malformed task IDs fail',()=>{
  for(const id of ['TASK-0001','bad-id']) assert.equal(fixture(m=>m('state/backlog.json',p=>p.map((t,i)=>i===1?{...t,id}:t))).passAll,false);
});
test('active task status and title must match backlog',()=>{
  for(const change of [p=>({...p,active_task_status:p.active_task_status==='COMPLETED'?'PARTIAL':'COMPLETED'}),p=>({...p,active_task_title:p.active_task_title+' (changed)'})])assert.equal(fixture(m=>m('state/project_state.json',change)).passAll,false);
});
test('current document metadata cannot silently drift',()=>assert.equal(fixture((m,dir)=>{
  const path=join(dir,'docs/源码结构文档.md'),before=readFileSync(path,'utf8');
  const marker=/<!-- presentationos-current (\{[^\n]+\}) -->/.exec(before);assert.ok(marker);
  const metadata=JSON.parse(marker[1]);metadata.phase=metadata.phase+'_DRIFT';
  const after=before.replace(marker[0],`<!-- presentationos-current ${JSON.stringify(metadata)} -->`);
  assert.notEqual(after,before,'The negative fixture must actually change current metadata');writeFileSync(path,after);
}).passAll,false));
test('invalid blockers JSON fails closed',()=>assert.equal(fixture((m,dir)=>writeFileSync(join(dir,'state/blockers.json'),'invalid')).passAll,false));
