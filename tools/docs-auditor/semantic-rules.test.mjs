import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {auditRepo} from './audit-docs.mjs';
import {validateEvidence} from './semantic-rules.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(change) {
  const dir=mkdtempSync(join(tmpdir(),'pres-semantic-'));
  try {
    for(const entry of ['package.json','README.md','docs','state'])cpSync(resolve(entry),join(dir,entry),{recursive:true});
    mkdirSync(join(dir,'apps/cli'),{recursive:true});cpSync(resolve('apps/cli/package.json'),join(dir,'apps/cli/package.json'));
    const current=JSON.parse(readFileSync(join(dir,'state/backlog.json'),'utf8'));
    for(const path of new Set(current.flatMap(task=>(task.evidence??[]).map(ref=>typeof ref==='object'?ref.path:'')).filter(path=>path.startsWith('evidence/')).map(path=>path.split('/').slice(0,2).join('/'))))if(existsSync(resolve(path)))cpSync(resolve(path),join(dir,path),{recursive:true});
    const mutate=(file,fn)=>{const path=join(dir,file);writeFileSync(path,JSON.stringify(fn(JSON.parse(readFileSync(path,'utf8'))),null,2));};
    change(dir,mutate);return auditRepo(dir);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
function createReport(dir,changes={}) {
  const artifact=Buffer.from('actual output bytes');writeFileSync(join(dir,'artifact.bin'),artifact);
  const report={status:'PASS',exit_code:0,command:'node run-test.mjs',scope:'fixture output acceptance',commit_hash:'a'.repeat(40),recorded_at:'2026-10-23T00:00:00Z',artifacts:[{path:'artifact.bin',sha256:sha(artifact)}],...changes};
  const bytes=JSON.stringify(report);writeFileSync(join(dir,'report.json'),bytes);return {path:'report.json',sha256:sha(bytes)};
}
test('visible body drift is rejected even when hidden JSON metadata matches',()=>{
  assert.equal(fixture(dir=>{const path=join(dir,'docs/交接文档.md');writeFileSync(path,readFileSync(path,'utf8').replace('；PHASE_9_IN_PROGRESS；','；PHASE_21_COMPLETED；'));}).passAll,false);
  for(const text of ['当前阶段 PHASE_21_COMPLETED','当前唯一任务 TASK-0022'])assert.equal(fixture(dir=>{const path=join(dir,'docs/交接文档.md');writeFileSync(path,readFileSync(path,'utf8').replace('<!-- presentationos-history -->',text+'\n<!-- presentationos-history -->'));}).passAll,false);
});
test('README unconditional marketing and incorrect implemented architecture fail',()=>{
  for(const text of ['全球首个','保真率恒为100%','零幻觉','全量0 CVE','完整企业级','Tauri 2 + React 已完成'])assert.equal(fixture(dir=>{const path=join(dir,'README.md');writeFileSync(path,readFileSync(path,'utf8')+'\n'+text);}).passAll,false,text);
});
test('history stays readable without being mistaken for current claims',()=>{
  assert.equal(fixture(dir=>{const path=join(dir,'docs/交接文档.md');writeFileSync(path,readFileSync(path,'utf8')+'\n历史：全球首个、零幻觉、PHASE_21_COMPLETED');}).passAll,true);
});
test('missing, bare-path, corrupt and hash-mismatched evidence cannot complete tasks',()=>{
  for(const reference of ['missing.json',{path:'missing.json',sha256:'a'.repeat(64)},{path:'package.json',sha256:'b'.repeat(64)}])assert.equal(fixture((dir,m)=>m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,status:'COMPLETED',blocked_reason:null,acceptance_verified:t.acceptance,evidence:[reference]}:t))).passAll,false);
  assert.equal(fixture((dir,m)=>{const reference=createReport(dir);m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,evidence:[{...reference,path:join(dir,'report.json')}]}:t));}).passAll,false);
});
test('complete task requires execution evidence, all criteria and no outstanding gap',()=>{
  assert.equal(fixture((dir,m)=>{const reference=createReport(dir);m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,status:'COMPLETED',blocked_reason:null,acceptance_verified:t.acceptance,evidence:[reference]}:t));}).passAll,true);
  for(const change of [{blocked_reason:'Still needs native proof'},{acceptance_verified:[]}])assert.equal(fixture((dir,m)=>{const reference=createReport(dir);m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,status:'COMPLETED',blocked_reason:null,acceptance_verified:t.acceptance,evidence:[reference],...change}:t));}).passAll,false);
});
test('a report digest cannot conceal a changed output artifact',()=>{
  assert.equal(fixture((dir,m)=>{const reference=createReport(dir);writeFileSync(join(dir,'artifact.bin'),'changed');m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,status:'COMPLETED',blocked_reason:null,acceptance_verified:t.acceptance,evidence:[reference]}:t));}).passAll,false);
});
test('source-only, scoped, mock or missing execution fields cannot certify completion',()=>{
  for(const change of [{status:'PASS_SCOPED'},{mock:true},{simulated:true},{verification_mode:'SOURCE_CONTRACT'},{command:null},{recorded_at:'unknown'},{artifacts:[]}])assert.equal(fixture((dir,m)=>{const reference=createReport(dir,change);m('state/backlog.json',tasks=>tasks.map((t,i)=>i===0?{...t,status:'COMPLETED',blocked_reason:null,acceptance_verified:t.acceptance,evidence:[reference]}:t));}).passAll,false,JSON.stringify(change));
});
test('resolved blocker without executed proof and missing known blocker entries fail',()=>{
  assert.equal(fixture((dir,m)=>m('state/blockers.json',items=>items.map((b,i)=>i===0?{...b,status:'RESOLVED'}:b))).passAll,false);
  assert.equal(fixture((dir,m)=>m('state/project_state.json',state=>({...state,known_blockers:[]}))).passAll,false);
});
test('self dependency, dependency cycle and malformed task fail closed',()=>{
  for(const mutation of [tasks=>tasks.map((t,i)=>i===0?{...t,dependencies:[t.id]}:t),tasks=>tasks.map((t,i)=>i===0?{...t,dependencies:[tasks[1].id]}:i===1?{...t,dependencies:[tasks[0].id]}:t),tasks=>tasks.map((t,i)=>i===0?null:t)])assert.equal(fixture((dir,m)=>m('state/backlog.json',mutation)).passAll,false);
});
test('release evidence must bind a clean source commit, version and full release acceptance',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-release-evidence-'));
  try {
    for(const change of [{release_ready:false},{working_tree_dirty:true},{commit_hash:'b'.repeat(40)},{version:'0.0.0'}]){const reference=createReport(dir,{release_ready:true,working_tree_dirty:false,version:'1.0.0',...change});assert.equal(validateEvidence(dir,reference,{report:true,release:true,version:'1.0.0',commit:'a'.repeat(40)}).valid,false);}
    const reference=createReport(dir,{release_ready:true,working_tree_dirty:false,version:'1.0.0',gate:'native'});assert.equal(validateEvidence(dir,reference,{report:true,release:true,version:'1.0.0',commit:'a'.repeat(40),gate:'native'}).valid,true);
    assert.equal(validateEvidence(dir,reference,{report:true,release:true,version:'1.0.0',commit:'a'.repeat(40),gate:'uia'}).valid,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('null/array report JSON and malformed known blocker types fail closed',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-null-evidence-'));
  try {for(const text of ['null','[]','false']){writeFileSync(join(dir,'report.json'),text);assert.equal(validateEvidence(dir,{path:'report.json',sha256:sha(text)},{report:true}).valid,false);}}finally{rmSync(dir,{recursive:true,force:true});}
  assert.equal(fixture((dir,m)=>m('state/project_state.json',state=>({...state,known_blockers:[123]}))).passAll,false);
});
