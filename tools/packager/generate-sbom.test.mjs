import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {evaluateLicense,collectNpmInventory,scanSecrets,parseAudit,generateSecurityEvidence} from './generate-sbom.mjs';

test('SPDX choices and obligations are evaluated separately; unknown does not become MIT',()=>{
  for(const expression of ['MIT','(MIT OR GPL-3.0-or-later)','MIT AND Zlib','MIT AND (Apache-2.0 OR GPL-3.0-only)'])assert.equal(evaluateLicense(expression),true,expression);
  for(const expression of [undefined,'UNKNOWN','GPL-3.0-only','MIT AND GPL-3.0-only','(MIT OR GPL-3.0-only) AND UNKNOWN','MIT WITH LLVM-exception','(MIT','MIT OR','MIT junk'])assert.equal(evaluateLicense(expression),false,String(expression));
});

test('inventory includes transitive/optional packages, versions and internal links',()=>{
  const leaf={version:'1',path:'b1',optionalDependencies:{c:{version:'1',path:'c1'}}};
  const core={version:'link:../core',path:'core',dependencies:{a:{version:'1',path:'a1',dependencies:{b:leaf}}}};
  const trees=[{name:'@pres/app',version:'1',dependencies:{'@pres/core':core,a:{version:'2',path:'a2'}}}];
  const inv=collectNpmInventory(trees,path=>path==='core'?{name:'@pres/core',version:'1',private:true}:{version:path.endsWith('2')?'2':'1',license:'MIT'});
  assert.deepEqual(inv.components.map(c=>`${c.name}@${c.version}`),['a@1','a@2','b@1','c@1']);
  const refs=new Set([...inv.components,...inv.workspaceComponents].map(c=>c['bom-ref']));
  for(const dep of inv.dependencies){assert(refs.has(dep.ref));for(const ref of dep.dependsOn)assert(refs.has(ref));}
});

test('missing metadata and ambiguous legacy license arrays retain UNKNOWN',()=>{
  const inv=collectNpmInventory([{name:'app',dependencies:{unreadable:{version:'1',path:'missing'}}}],()=>{throw Error('missing');});
  assert.deepEqual(inv.components[0].licenses,[]);
  assert.equal(evaluateLicense(inv.components[0].properties[0].value),false);
  const legacy=collectNpmInventory([{name:'app',dependencies:{ambiguous:{version:'1',path:'legacy'}}}],()=>({licenses:[{type:'MIT'},{type:'GPL-3.0-only'}]}));
  assert.equal(legacy.components[0].properties[0].value,'UNKNOWN');
});

test('secret detection checks every file independently and never reports matched text',()=>{
  const key='sk-proj-'+ 'x'.repeat(40);
  const findings=scanSecrets([{file:'one',content:key},{file:'two',content:key}]);
  assert.equal(findings.length,2);
  assert(!JSON.stringify(findings).includes(key));
  assert.equal(scanSecrets([{file:'private',content:'-----BEGIN '+'PRIVATE KEY-----'}]).length,1);
});

const emptyAudit={advisories:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0}}};
test('audit network errors, malformed/incomplete JSON and inconsistent exits fail closed',()=>{
  assert.equal(parseAudit({stdout:JSON.stringify(emptyAudit),exit_code:0}).status,'PASS');
  for(const result of [{stdout:'network error',exit_code:1},{stdout:'{}',exit_code:0},{stdout:JSON.stringify(emptyAudit),exit_code:1},{stdout:JSON.stringify({error:{message:'unavailable'}}),exit_code:0}])assert.equal(parseAudit(result).status,'ERROR');
});

function fixture(change=()=>{}) {
  const root=mkdtempSync(join(tmpdir(),'pres-security-'));
  mkdirSync(join(root,'lib'));writeFileSync(join(root,'lib/package.json'),JSON.stringify({name:'safe',version:'1.0.0',license:'MIT'}));
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'test',version:'1'}));writeFileSync(join(root,'pnpm-lock.yaml'),'lockfileVersion: 9');writeFileSync(join(root,'sample.txt'),'safe');
  const audits={production:structuredClone(emptyAudit),all:structuredClone(emptyAudit)};
  change(root,audits);
  const commands=[];
  const runner=(cwd,command,args)=>{
    commands.push([command,...args]);let stdout='';let exit_code=0;
    if(command==='git')stdout=args.includes('rev-parse')?'a'.repeat(40):'sample.txt\0';
    else if(args.includes('list'))stdout=JSON.stringify([{name:'app',dependencies:{safe:{version:'1.0.0',path:join(root,'lib')}}}]);
    else if(args.includes('audit')){const audit=args.includes('--prod')?audits.production:audits.all;stdout=JSON.stringify(audit);exit_code=Object.values(audit.metadata.vulnerabilities).some(n=>n>0)?1:0;}
    else stdout='version';
    return {command:[command,...args],cwd,exit_code,stdout,stderr:'',started_at:'fixture',finished_at:'fixture'};
  };
  try {const output=join(root,'evidence');const report=generateSecurityEvidence(root,output,runner);return {root,report,commands,output,cleanup:()=>rmSync(root,{recursive:true,force:true})};} catch(error){rmSync(root,{recursive:true,force:true});throw error;}
}
test('real command paths are invoked and pass is scoped rather than a release certificate',()=>{
  const result=fixture();try {assert.equal(result.report.status,'PASS_SCOPED');assert.equal(result.report.release_ready,false);assert.equal(result.commands.filter(c=>c.includes('audit')).length,2);assert.throws(()=>generateSecurityEvidence(result.root,result.output),/EEXIST/);assert.equal(JSON.parse(readFileSync(join(result.output,'result.json'),'utf8')).exit_code,0);}finally{result.cleanup();}
});
test('development-only advisory changes output and exit instead of writing zero',()=>{
  const result=fixture((root,audits)=>audits.all.metadata.vulnerabilities.high=1);try {assert.equal(result.report.status,'FAIL');assert.equal(result.report.exit_code,1);assert.equal(result.report.all_dependencies_audit.vulnerabilities.high,1);assert.equal(result.report.production_audit.status,'PASS');}finally{result.cleanup();}
});
test('secret finding fails the gate while saved evidence remains redacted',()=>{
  const key='ghp_'+ 'y'.repeat(36);const result=fixture(root=>writeFileSync(join(root,'sample.txt'),key));
  try {assert.equal(result.report.exit_code,1);assert.equal(result.report.secrets.status,'FINDINGS');assert(!readFileSync(join(result.output,'result.json'),'utf8').includes(key));}finally{result.cleanup();}
});
test('missing license metadata and an AND obligation fail the actual evidence gate',()=>{
  for(const license of [undefined,'','   ','MIT AND GPL-3.0-only','MIT WITH LLVM-exception']) {
    const result=fixture(root=>writeFileSync(join(root,'lib/package.json'),JSON.stringify({name:'safe',version:'1.0.0',license})));
    try {assert.equal(result.report.status,'FAIL');assert.equal(result.report.license_policy.status,'REVIEW_REQUIRED');assert.equal(result.report.license_policy.findings[0].license,license?.trim()||'UNKNOWN');}finally{result.cleanup();}
  }
});
test('permissive AND, OR choice and parentheses survive the real gate',()=>{
  for(const license of ['(MIT AND Zlib)','MIT OR GPL-3.0-only','(MIT AND Zlib) OR UNKNOWN']) {
    const result=fixture(root=>writeFileSync(join(root,'lib/package.json'),JSON.stringify({name:'safe',version:'1.0.0',license})));
    try {assert.equal(result.report.status,'PASS_SCOPED');assert.equal(result.report.release_ready,false);assert(result.report.unverified_scopes.some(scope=>scope.includes('NuGet')));assert.equal(result.report.inventory.nuget.every(record=>record.status==='MISSING'),true);}finally{result.cleanup();}
  }
});
