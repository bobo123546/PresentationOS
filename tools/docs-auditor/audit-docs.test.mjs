import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {auditRepo} from './audit-docs.mjs';

function fixture(change){
  const dir=mkdtempSync(join(tmpdir(),'pres-audit-'));
  try{
    for(const entry of ['package.json','docs','state']) cpSync(resolve(entry),join(dir,entry),{recursive:true});
    mkdirSync(join(dir,'apps/cli'),{recursive:true});
    cpSync(resolve('apps/cli/package.json'),join(dir,'apps/cli/package.json'));
    mkdirSync(join(dir,'098'));
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
  for(const fields of [{active_task_status:'COMPLETED'},{active_task_title:'Different task'}])assert.equal(fixture(m=>m('state/project_state.json',p=>({...p,...fields}))).passAll,false);
});
test('current document metadata cannot silently drift',()=>assert.equal(fixture((m,dir)=>{
  const path=join(dir,'docs/源码结构文档.md');writeFileSync(path,readFileSync(path,'utf8').replace('"phase":"PHASE_9_IN_PROGRESS"','"phase":"PHASE_9_COMPLETE"'));
}).passAll,false));
test('invalid blockers JSON fails closed',()=>assert.equal(fixture((m,dir)=>writeFileSync(join(dir,'state/blockers.json'),'invalid')).passAll,false));
