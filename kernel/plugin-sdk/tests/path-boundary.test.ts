import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runSafePlugin} from '../src/safe-runtime.js';
test('entry and filesystem APIs reject parent and junction escapes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pres-plugin-boundary-'));const plugin=join(dir,'plugin');const outside=join(dir,'outside');mkdirSync(plugin);mkdirSync(outside);
  try{
    writeFileSync(join(outside,'entry.mjs'),'async function run(){return 42;}');
    const manifest={name:'test',version:'0.1.0',type:'safe' as const,permissions:['filesystem.read' as const],entry:'../outside/entry.mjs'};
    assert.equal((await runSafePlugin({rootDir:plugin,manifest},{})).ok,false);
    symlinkSync(outside,join(plugin,'linked'),'junction');
    writeFileSync(join(plugin,'entry.mjs'),"async function run(){return fs.readText('linked/entry.mjs');}");manifest.entry='entry.mjs';
    assert.equal((await runSafePlugin({rootDir:plugin,manifest},{})).ok,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
