// Scoped dependency inventory and reproducible security evidence. Never certify a release.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';

const permissive = new Set(['MIT','ISC','Apache-2.0','BSD-2-Clause','BSD-3-Clause','CC0-1.0','0BSD','Unlicense','BlueOak-1.0.0','Zlib']);
const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

// SPDX OR offers a choice; AND requires every selected obligation. Unmatched
// terms are not accepted, and unsupported WITH syntax requires review.
export function evaluateLicense(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return false;
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;
  function atom() {
    if (tokens[pos] === '(') {pos++; const accepted=or(); if(tokens[pos++]!==')')throw Error('Unclosed license group');return accepted;}
    const id=tokens[pos++];
    if(!id||['AND','OR','WITH',')'].includes(id))throw Error('Invalid license term');
    return permissive.has(id);
  }
  function and() {let accepted=atom();while(tokens[pos]==='AND'){pos++;const next=atom();accepted=accepted&&next;}return accepted;}
  function or() {let accepted=and();while(tokens[pos]==='OR'){pos++;const next=and();accepted=accepted||next;}return accepted;}
  try {const accepted=or();return pos===tokens.length&&accepted;} catch {return false;}
}

export function collectNpmInventory(trees, readPackage = path => readJson(join(path,'package.json'))) {
  const components=new Map(), workspaces=new Map(), links=new Map(), visited=new Set();
  function walk(name,info,parent) {
    const key=`${name}@${info.version}|${info.path ?? ''}`;
    let metadata={};
    try {metadata=readPackage(info.path);} catch {/* Unknown metadata is retained and fails license review. */}
    const internal=String(info.version).startsWith('link:')||(metadata.private===true&&name.startsWith('@pres/'));
    const version=metadata.version??info.version;
    const ref=internal?`workspace:${name}`:`pkg:npm/${name.replace('@','%40')}@${version}`;
    if(internal)workspaces.set(ref,{type:'application','bom-ref':ref,name,version});
    if(parent){if(!links.has(parent))links.set(parent,new Set());links.get(parent).add(ref);}
    if(!internal&&!components.has(ref)) {
      // Old multi-license arrays do not unambiguously state AND versus OR.
      const legacyLicense=metadata.licenses?.length===1?metadata.licenses[0]?.type:undefined;
      const rawLicense=typeof metadata.license==='string'?metadata.license:metadata.license?.type??legacyLicense;
      const license=typeof rawLicense==='string'&&rawLicense.trim()?rawLicense.trim():'UNKNOWN';
      components.set(ref,{type:'library','bom-ref':ref,name,version,purl:ref,licenses:license==='UNKNOWN'?[]:[{expression:license}],properties:[{name:'presentationos:license',value:license}],ecosystem:'npm'});
    }
    if(visited.has(key))return;
    visited.add(key);
    for(const [child,details] of Object.entries({...info.dependencies,...info.optionalDependencies}))walk(child,details,ref);
  }
  for(const tree of trees) {
    const ref=`workspace:${tree.name??tree.path}`;
    workspaces.set(ref,{type:'application','bom-ref':ref,name:tree.name??tree.path,version:tree.version??'UNKNOWN'});
    for(const [name,info] of Object.entries({...tree.dependencies,...tree.optionalDependencies}))walk(name,info,ref);
  }
  return {components:[...components.values()].sort((a,b)=>a.purl.localeCompare(b.purl)),workspaceComponents:[...workspaces.values()],dependencies:[...links].map(([ref,dependsOn])=>({ref,dependsOn:[...dependsOn].sort()}))};
}

const secretRules=[
  ['OpenAI/Anthropic key',/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/],
  ['Private key',/-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH) )?PRIVATE KEY-----/],
  ['GitHub token',/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['AWS access key',/(?:AKIA|ASIA)[A-Z0-9]{16}/],
];
export function scanSecrets(entries) {
  const findings=[];
  for(const {file,content} of entries)for(const [kind,pattern] of secretRules)if(pattern.test(content))findings.push({file,kind});
  return findings; // Matched text and line contents must never enter reports.
}

export function parseAudit(result) {
  let report;
  try {report=JSON.parse(result.stdout.replace(/^\uFEFF/,''));} catch {return {status:'ERROR',vulnerabilities:null,reason:'Audit response was not JSON'};}
  const counts=report.metadata?.vulnerabilities;
  if(report.error||!counts||!['info','low','moderate','high','critical'].every(k=>Number.isInteger(counts[k])&&counts[k]>=0))return {status:'ERROR',vulnerabilities:null,reason:'Audit service response incomplete'};
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  if(result.exit_code!==(total?1:0))return {status:'ERROR',vulnerabilities:counts,reason:'Exit code and advisory result disagree'};
  return {status:total?'FINDINGS':'PASS',vulnerabilities:counts,metadata:report.metadata,advisories:Object.values(report.advisories??{}).map(a=>({id:a.github_advisory_id??String(a.id),package:a.module_name,severity:a.severity,paths:(a.findings??[]).flatMap(f=>f.paths??[]),url:a.url}))};
}

function run(root,executable,args) {
  const started_at=new Date().toISOString();
  // Only fixed pnpm subcommands/options use the Windows command shim.
  const options={cwd:root,encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,windowsHide:true};
  const result=process.platform==='win32'&&executable==='pnpm'
    ?spawnSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`pnpm ${args.join(' ')}`],options)
    :spawnSync(executable,args,options);
  return {command:[executable,...args],cwd:root,started_at,finished_at:new Date().toISOString(),exit_code:result.status,signal:result.signal,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error?.message??null};
}

function dotnetInventory(root) {
  const components=new Map(),records=[];
  for(const relative of ['apps/desktop-host/obj/project.assets.json','workers/powerpoint-dotnet/src/PresentationOS.PowerPoint/obj/project.assets.json']) {
    const path=join(root,relative);
    if(!existsSync(path)){records.push({file:relative,status:'MISSING'});continue;}
    const bytes=readFileSync(path),assets=JSON.parse(bytes);
    records.push({file:relative,status:'INVENTORIED_NOT_AUDITED',sha256:hash(bytes),targets:Object.keys(assets.targets??{})});
    for(const [id,info] of Object.entries(assets.libraries??{})) {
      if(info.type!=='package')continue;
      const cut=id.lastIndexOf('/'),name=id.slice(0,cut),version=id.slice(cut+1),ref=`pkg:nuget/${name}@${version}`;
      components.set(ref,{type:'library','bom-ref':ref,name,version,purl:ref,licenses:[],ecosystem:'nuget',properties:[{name:'presentationos:license',value:'UNKNOWN'},{name:'presentationos:scope',value:'restored-transitive-assets; binary-inclusion-and-license-review-required'}]});
    }
  }
  return {components:[...components.values()],records};
}

export function generateSecurityEvidence(root,outputDir,runner=run) {
  root=resolve(root);outputDir=resolve(outputDir);
  mkdirSync(outputDir,{recursive:false}); // Preserve previous runs and release bundles.
  const save=(name,value)=>writeFileSync(join(outputDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const commands={};
  function record(name,executable,args) {
    const result=runner(root,executable,args);commands[name]=result;
    save(`${name}.command.json`,{...result,stdout_file:`${name}.stdout.txt`,stderr_file:`${name}.stderr.txt`,stdout:undefined,stderr:undefined});
    writeFileSync(join(outputDir,`${name}.stdout.txt`),result.stdout,{flag:'wx'});
    writeFileSync(join(outputDir,`${name}.stderr.txt`),result.stderr,{flag:'wx'});
    return result;
  }
  const pkg=readJson(join(root,'package.json'));
  record('git-head','git',['rev-parse','HEAD']);
  record('git-status','git',['status','--porcelain=v1']);
  record('node-version',process.execPath,['--version']);
  record('pnpm-version','pnpm',['--version']);
  const listed=record('npm-production-tree','pnpm',['-r','list','--prod','--depth','Infinity','--json']);
  let npm={components:[],workspaceComponents:[],dependencies:[]},inventoryError=null;
  try {if(listed.exit_code!==0)throw Error('pnpm inventory failed');npm=collectNpmInventory(JSON.parse(listed.stdout));if(!npm.components.length)throw Error('No production components discovered');} catch(error){inventoryError=error.message;}
  const production=parseAudit(record('audit-production','pnpm',['audit','--prod','--json']));
  const all=parseAudit(record('audit-all','pnpm',['audit','--json']));
  const gitFiles=record('git-files','git',['-c','core.quotepath=false','ls-files','--cached','--others','--exclude-standard','-z']);
  const excluded=/\.(?:png|jpe?g|gif|webp|ico|exe|dll|pdb|zip|pptx|pdf|mp4|mov|woff2?|ttf|eot|db)$/i;
  const unreadable=[],entries=[];let binaryFiles=0;
  if(gitFiles.exit_code===0)for(const file of [...new Set(gitFiles.stdout.split('\0').filter(Boolean))]) {
    if(excluded.test(file)){binaryFiles++;continue;}
    try {const bytes=readFileSync(join(root,file));if(bytes.includes(0)){binaryFiles++;continue;}entries.push({file,content:bytes.toString('utf8')});} catch {unreadable.push(file);}
  }
  const findings=scanSecrets(entries);
  const secrets={status:gitFiles.exit_code!==0||unreadable.length?'ERROR':findings.length?'FINDINGS':'PASS',files_scanned:entries.length,binary_files_excluded:binaryFiles,unreadable,findings,scope:'Current tracked and non-ignored untracked text files; not Git history, ignored files, or packaged binary contents'};
  const licenses=npm.components.filter(c=>!evaluateLicense(c.properties.find(p=>p.name==='presentationos:license').value)).map(c=>({name:c.name,version:c.version,license:c.properties.find(p=>p.name==='presentationos:license').value}));
  const dotnet=dotnetInventory(root),components=[...npm.workspaceComponents,...npm.components,...dotnet.components];
  const bom={bomFormat:'CycloneDX',specVersion:'1.5',serialNumber:`urn:uuid:${randomUUID()}`,version:1,metadata:{timestamp:new Date().toISOString(),component:{type:'application',name:pkg.name,version:pkg.version},properties:[{name:'presentationos:scope',value:'npm workspace production transitive graph plus restored NuGet inventory; not an installed-binary SBOM'}]},components:components.map(({ecosystem,...c})=>c),dependencies:npm.dependencies};
  save('PRODUCT_SBOM.json',bom);
  const criticalCommands=['git-head','git-status','node-version','pnpm-version'];
  const scopedPass=criticalCommands.every(name=>commands[name].exit_code===0)&&/^[a-f0-9]{40}$/.test(commands['git-head'].stdout.trim())&&!inventoryError&&production.status==='PASS'&&all.status==='PASS'&&secrets.status==='PASS'&&licenses.length===0;
  const report={status:scopedPass?'PASS_SCOPED':'FAIL',exit_code:scopedPass?0:1,recorded_at:new Date().toISOString(),command:'node tools/packager/generate-sbom.mjs --output-dir <new-directory>',commit_hash:commands['git-head'].stdout.trim(),working_tree_dirty:Boolean(commands['git-status'].stdout.trim()),lockfile_sha256:hash(readFileSync(join(root,'pnpm-lock.yaml'))),generator_sha256:hash(readFileSync(fileURLToPath(import.meta.url))),scope:'npm advisory queries for lockfile plus installed host-platform production npm graph and current text-file secret patterns',release_ready:false,production_audit:production,all_dependencies_audit:all,inventory:{npm_components:npm.components.length,nuget_components:dotnet.components.length,error:inventoryError,nuget:dotnet.records,not_inventory_scope:['uninstalled optional packages for other platforms','development npm dependency graph','native runtime and final package binary composition']},license_policy:{scope:'installed production npm components only; conservative permissive SPDX expression policy',status:licenses.length?'REVIEW_REQUIRED':'PASS',findings:licenses},secrets,unverified_scopes:['NuGet advisories and license obligations','self-contained runtime and final installed binary composition','actual FFmpeg build and distribution obligations','OS plugin isolation and release threat review','ignored files, Git history, packaged binary secret contents'],artifacts:{sbom:{path:'PRODUCT_SBOM.json',sha256:hash(readFileSync(join(outputDir,'PRODUCT_SBOM.json')))}}};
  save('result.json',report);return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const index=process.argv.indexOf('--output-dir');
  if(index<0||!process.argv[index+1]){console.error('Usage: node tools/packager/generate-sbom.mjs --output-dir <new-directory> [--root <repository>]');process.exitCode=2;}
  else {const rootIndex=process.argv.indexOf('--root');try {const report=generateSecurityEvidence(rootIndex<0?resolve(dirname(fileURLToPath(import.meta.url)),'../..'):process.argv[rootIndex+1],process.argv[index+1]);console.log(JSON.stringify(report,null,2));process.exitCode=report.exit_code;} catch(error){console.error(`Security evidence failed: ${error.message}`);process.exitCode=1;}}
}
