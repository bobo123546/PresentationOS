import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonText=bytes=>JSON.parse(String(bytes).replace(/^\uFEFF/,''));
const gates=['native','uia','installer','clean_machine','security'];
const productClaims=[/全球首个/,/零幻觉/,/保真率恒为/,/100\s*%\s*(?:事实保真|许可合规)/i,/(?:全量|供应链)\s*0\s*CVE/i,/0\s*CVE\s*供应链/i,/全行业.*(?:成熟|支持)/,/cleanMachineReady\s*[:=]\s*true/];

// File presence or successful-looking fields alone are never acceptance evidence.
export function validateEvidence(root,reference,{report=false,release=false,version,commit,gate}={}) {
  const errors=[];
  if(!reference||typeof reference!=='object'||typeof reference.path!=='string'||!/^[a-f0-9]{64}$/i.test(reference.sha256??''))return {valid:false,errors:['Evidence requires path and SHA256']};
  const path=resolve(root,reference.path);let bytes,value;
  try {if(!statSync(path).isFile())throw Error('Not a file');bytes=readFileSync(path);}catch{return {valid:false,errors:[`Evidence missing/unreadable: ${reference.path}`]};}
  if(digest(bytes)!==reference.sha256.toLowerCase())errors.push(`Evidence SHA256 mismatch: ${reference.path}`);
  if(report) {
    try {value=jsonText(bytes);}catch {errors.push('Evidence report is not JSON');}
    if(!value||typeof value!=='object'||Array.isArray(value))errors.push('Evidence report must be a JSON object');
    else {
      if(value.status!=='PASS'||value.exit_code!==0||!value.command||!value.scope||!/^[a-f0-9]{40}$/.test(value.commit_hash??'')||!Number.isFinite(Date.parse(value.recorded_at)))errors.push('Report lacks PASS, command, exit code, scope, source commit or timestamp');
      if(value.simulated===true||value.mock===true||['SIMULATED','SOURCE_CONTRACT','NOT_ATTEMPTED'].includes(value.verification_mode))errors.push('Simulated/source-only evidence cannot complete acceptance');
      if(!Array.isArray(value.artifacts)||value.artifacts.length===0)errors.push('Report requires hashed artifacts');
      else for(const artifact of value.artifacts)errors.push(...validateEvidence(dirname(path),artifact).errors);
      if(release&&(value.version!==version||value.commit_hash!==commit||value.working_tree_dirty!==false||value.release_ready!==true))errors.push('Release evidence does not bind the clean version/commit and full acceptance');
      if(release&&gate&&value.gate!==gate)errors.push('Release evidence is for another acceptance gate');
    }
  }
  return {valid:errors.length===0,errors,value};
}

function detectCycles(backlog) {
  const tasks=new Map(backlog.map(task=>[task.id,task]));const visiting=new Set(),done=new Set();
  function visit(id) {if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);for(const next of tasks.get(id)?.dependencies??[])if(visit(next))return true;visiting.delete(id);done.add(id);return false;}
  return backlog.some(task=>visit(task.id));
}

export function auditSemantic(root,pkg,state,backlog,blockers) {
  const checks=[];const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
  check('task acceptance criteria are present',backlog.every(t=>Array.isArray(t.acceptance)&&t.acceptance.length>0));
  check('task dependency graph has no cycle',!detectCycles(backlog));
  const completed=backlog.filter(t=>t.status==='COMPLETED');
  check('completed tasks have no outstanding blocked reason',completed.every(t=>!t.blocked_reason));
  check('completed tasks cover every declared acceptance criterion',completed.every(t=>Array.isArray(t.acceptance_verified)&&t.acceptance_verified.length===t.acceptance.length&&t.acceptance.every(criterion=>t.acceptance_verified.includes(criterion))));
  for(const task of backlog) {
    const references=Array.isArray(task.evidence)?task.evidence:[];
    const results=references.map(ref=>validateEvidence(root,ref,{report:task.status==='COMPLETED'}));
    check(`${task.id} current evidence paths are portable`,references.every(ref=>typeof ref?.path==='string'&&!isAbsolute(ref.path)&&!ref.path.split(/[\\/]/).includes('..')));
    check(`${task.id} current evidence references are valid`,Array.isArray(task.evidence)&&results.every(result=>result.valid),`${references.length} current references; empty does not certify acceptance. ${results.flatMap(result=>result.errors).join('; ')}`);
    if(task.status==='COMPLETED')check(`${task.id} has executed acceptance evidence`,results.length>0&&results.every(result=>result.valid));
  }
  const open=blockers.filter(b=>b.status==='OPEN');
  check('known blockers match all open blocker IDs',Array.isArray(state.known_blockers)&&state.known_blockers.every(text=>typeof text==='string')&&state.known_blockers.length===open.length&&new Set(state.known_blockers.map(text=>text.split(':')[0])).size===open.length&&open.every(b=>state.known_blockers.some(text=>text.startsWith(`${b.id}:`))));
  check('resolved blockers have executed resolution evidence',blockers.filter(b=>b.status==='RESOLVED').every(b=>validateEvidence(root,b.resolution_evidence,{report:true}).valid));
  check('release-ready is not an alpha or prerelease version',state.release_status!=='RELEASE_READY'||!pkg.version.includes('-'));
  check('ready release has hashed executed Native/UIA/installer/clean-machine/security evidence',state.release_status!=='RELEASE_READY'||gates.every(gate=>validateEvidence(root,state.release_evidence?.[gate],{report:true,release:true,version:pkg.version,commit:state.release_commit,gate}).valid));
  check('release evidence gates use distinct reports and an explicit source commit',state.release_status!=='RELEASE_READY'||(/^[a-f0-9]{40}$/.test(state.release_commit??'')&&new Set(gates.map(gate=>state.release_evidence?.[gate]?.path)).size===gates.length));
  const active=backlog.find(t=>t.id===state.active_task);
  check('phase does not claim complete while acceptance is outstanding',!/(?:COMPLETE|COMPLETED)$/.test(state.current_phase)||(active?.status==='COMPLETED'&&open.length===0));
  for(const phase of Object.values(state.completed_phases??{}))check('completed phase has hashed executed evidence',Array.isArray(phase.evidence)&&phase.evidence.length>0&&phase.evidence.every(ref=>validateEvidence(root,ref,{report:true}).valid));
  const names=['README.md',...['交接文档.md','源码结构文档.md','编译部署指南.md','协作提示词.md','训练数据.md'].map(name=>`docs/${name}`)];
  for(const name of names){
    try{
      const text=readFileSync(join(root,name),'utf8');const parts=text.split('<!-- presentationos-history -->');const currentText=parts[0];
      const match=/<!-- presentationos-current (\{[^\n]+\}) -->/.exec(currentText);
      const current=match?JSON.parse(match[1]):null;
      check(`${name} current metadata agrees`,current&&current.version===pkg.version&&current.phase===state.current_phase&&current.release_status===state.release_status&&current.active_task===state.active_task);
      const status=/当前状态：([^；\n]+)；([^；\n]+)；([^。\n]+)。当前任务 (TASK-\d{4})。/.exec(currentText);
      check(`${name} visible status agrees`,status&&status[1]===pkg.version&&status[2]===state.current_phase&&status[3]===state.release_status&&status[4]===state.active_task);
      const phases=currentText.match(/PHASE_\d+_(?:IN_PROGRESS|COMPLETED|COMPLETE)\b/g)??[];
      check(`${name} current phase references do not conflict`,phases.every(phase=>phase===state.current_phase));
      const taskMentions=[...currentText.matchAll(/当前(?:唯一)?任务[ ：]+(TASK-\d{4})/g)].map(match=>match[1]);
      check(`${name} current task references do not conflict`,taskMentions.every(id=>id===state.active_task));
      check(`${name} avoids unsupported unconditional product claims`,!productClaims.some(pattern=>pattern.test(currentText)));
      if(name!=='README.md')check(`${name} historical content is delimited exactly once`,parts.length===2);
      else {
        check('README describes the implemented WinForms/WebView2 host',currentText.includes('.NET 8')&&currentText.includes('WinForms')&&currentText.includes('WebView2')&&!/Tauri\s*2\s*[+＋]\s*React.*(?:已完成|已实现)/i.test(currentText));
        check('README does not promise release acceptance while not-ready',state.release_status!=='NOT_READY'||!/完整企业级|正式发布就绪|所有.*(?:原生验收|干净机验证).*通过|发布状态.*RELEASE_READY/.test(currentText));
      }
    }catch(error){check(`${name} semantic status agrees`,false,error.message);}
  }
  const prototype=state.prototypes?.['098'];
  check('098 schema contract exists',!existsSync(join(root,'098'))||(prototype?.contract&&existsSync(resolve(root,prototype.contract))));
  return checks;
}
