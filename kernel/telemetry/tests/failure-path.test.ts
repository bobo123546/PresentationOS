import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Logger,JsonlLogWriter,createEvent} from '../src/index.js';

test('spool remains redacted when the normal log path is unwritable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pres-spool-'));const previous=process.env.PRES_LOG_SPOOL;
  try{
    const invalid=join(dir,'file');await writeFile(invalid,'occupied');process.env.PRES_LOG_SPOOL=join(dir,'spool.jsonl');
    await new Logger({component:'failure',logDir:invalid}).info({event_type:'test',input_summary:'token=private-token-123456789'});
    const log=await readFile(process.env.PRES_LOG_SPOOL,'utf8');assert.ok(log.includes('[REDACTED]'));assert.ok(!log.includes('private-token'));
  }finally{if(previous===undefined)delete process.env.PRES_LOG_SPOOL;else process.env.PRES_LOG_SPOOL=previous;await rm(dir,{recursive:true,force:true});}
});
test('a writer can recover after one failed append',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pres-log-recover-'));const path=join(dir,'logs');await writeFile(path,'occupied');
  try{
    const writer=new JsonlLogWriter({logDir:path});const event=createEvent({level:'info',component:'recover',runtime:'node',event_type:'test'});
    await assert.rejects(()=>writer.write(event));await unlink(path);await writer.write(event);
    assert.ok((await readFile(writer.getCurrentLogPath(),'utf8')).includes('recover'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
