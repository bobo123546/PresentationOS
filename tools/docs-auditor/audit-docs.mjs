import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function auditRepo(root){
  const checks=[];
  const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
  function json(file){try{return JSON.parse(readFileSync(join(root,file),'utf8'));}catch(error){check(`${file} parses`,false,error.message);return null;}}
  const pkg=json('package.json');
  const state=json('state/project_state.json');
  const backlog=json('state/backlog.json');
  const blockers=json('state/blockers.json');
  if(!pkg||!state||!Array.isArray(backlog)||!Array.isArray(blockers))return{passAll:false,checks};
  check('product version agrees with state',pkg.version===state.project_version,`${pkg.version} / ${state.project_version}`);
  const ids=backlog.map(t=>t.id);
  check('25 unique well-formed task IDs',ids.length===25&&new Set(ids).size===ids.length&&ids.every(id=>/^TASK-\d{4}$/.test(id)));
  const statuses=new Set(['NOT_STARTED','PARTIAL','IN_PROGRESS','BLOCKED','COMPLETED']);
  check('task states and dependencies are valid',backlog.every(t=>statuses.has(t.status)&&Array.isArray(t.dependencies)&&t.dependencies.every(id=>ids.includes(id))));
  const active=backlog.find(t=>t.id===state.active_task);
  check('active task ID, title and status agree',active&&active.title===state.active_task_title&&active.status===state.active_task_status);
  check('completed tasks have evidence references',backlog.filter(t=>t.status==='COMPLETED').every(t=>Array.isArray(t.evidence)&&t.evidence.length>0));
  check('blocker IDs are unique and statuses valid',new Set(blockers.map(b=>b.id)).size===blockers.length&&blockers.every(b=>/^BLOCKED-[A-Z]+-\d{3}$/.test(b.id)&&['OPEN','RESOLVED'].includes(b.status)));
  const open=blockers.filter(b=>b.status==='OPEN');
  check('release state is recognized',['NOT_READY','RELEASE_READY'].includes(state.release_status));
  check('ready release has no open blockers',state.release_status!=='RELEASE_READY'||open.length===0);
  check('not-ready release records its blockers',state.release_status!=='NOT_READY'||open.length>0);
  check('ready release has explicit validation evidence',state.release_status!=='RELEASE_READY'||['native','uia','installer','clean_machine','security'].every(key=>{
    const file=state.release_evidence?.[key];if(!file)return false;
    try{const record=JSON.parse(readFileSync(join(root,file),'utf8'));return record.status==='PASS'&&record.command&&record.exit_code===0&&/^[a-f0-9]{40}$/.test(record.commit_hash);}catch{return false;}
  }));
  for(const name of ['交接文档.md','源码结构文档.md','编译部署指南.md','协作提示词.md','训练数据.md']){
    const file=join(root,'docs',name);
    try{
      const text=readFileSync(file,'utf8');
      const match=/<!-- presentationos-current (\{[^\n]+\}) -->/.exec(text);
      const current=match?JSON.parse(match[1]):null;
      check(`${name} current status agrees`,current&&current.version===pkg.version&&current.phase===state.current_phase&&current.release_status===state.release_status&&current.active_task===state.active_task);
      check(`${name} historical content is delimited`,text.includes('<!-- presentationos-history -->'));
    }catch(error){check(`${name} current status agrees`,false,error.message);}
  }
  const prototype=state.prototypes?.['098'];
  check('098 has explicit experimental ownership and verification limits',!existsSync(join(root,'098'))||(prototype?.status==='EXPERIMENTAL'&&prototype.release_status==='NOT_READY'&&prototype.native_qa==='PARTIAL'&&Boolean(prototype.contract)));
  check('phase remains in progress while QA task is incomplete',state.current_phase!=='PHASE_9_COMPLETE'||backlog.find(t=>t.id==='TASK-0010')?.status==='COMPLETED');
  return{repo:root,passAll:checks.every(c=>c.pass),checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=auditRepo(resolve(process.argv[2]??'.'));console.log(JSON.stringify(report,null,2));process.exitCode=report.passAll?0:1;}
