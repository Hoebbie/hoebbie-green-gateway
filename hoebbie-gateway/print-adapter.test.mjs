import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PrintAdapter, PrintJournal, printerConfig, TEST_ASSET_SHA256, validPrintCommand } from './print-adapter.mjs';
const id='11111111-1111-4111-8111-111111111111';
const command=(extra={})=>({commandId:id,asset:'test-a4-v1',maySubmit:true,cancelRequested:false,expiresAt:new Date(Date.now()+600000).toISOString(),...extra});
async function fixture(t, overrides={}){
 const directory=await mkdtemp(join(tmpdir(),'print-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const calls={submit:0,cancel:0};
 const client={target:'test-printer',verifyAsset:async()=>{},check:async()=>({ready:true}),submit:async()=>{calls.submit++;return {jobId:7};},status:async()=>({jobId:7,state:9,sheets:1}),cancel:async()=>{calls.cancel++;return {};},...overrides};
 const journal=new PrintJournal(directory);return {adapter:new PrintAdapter({journal,client}),journal,client,calls,directory};
}
test('disabled pilot never parses or uses a target',()=>assert.equal(printerConfig('false','garbage'),null));
test('configuration accepts only explicitly configured private IPP printer',()=>{
 assert.ok(printerConfig('true','ipp://192.168.1.5:631/ipp/print'));
 for(const uri of ['https://192.168.1.5/ipp/print','ipp://example.com/ipp/print','ipp://127.0.0.1/ipp/print','ipp://169.254.169.254/ipp/print','ipp://192.168.1.5/other','ipp://u:p@192.168.1.5/ipp/print','ipp://192.168.1.5/ipp/print?x=1'])assert.throws(()=>printerConfig('true',uri));
});
test('fixed asset hash matches shipped raster',async()=>assert.equal(createHash('sha256').update(await readFile(new URL('./print/test-a4.pwg',import.meta.url))).digest('hex'),TEST_ASSET_SHA256));
test('free asset paths and invalid identifiers rejected',()=>{
 assert.equal(Boolean(validPrintCommand(command({asset:'https://example.com/file'}))),false);
 assert.equal(Boolean(validPrintCommand(command({commandId:'../../etc/passwd'}))),false);
});
test('one print; completed durable journal replays without second submission',async t=>{
 const f=await fixture(t);assert.equal((await f.adapter.run(command())).status,'completed');
 const restarted=new PrintAdapter({journal:new PrintJournal(f.directory),client:f.client});
 assert.equal((await restarted.run(command({maySubmit:false}))).status,'completed');assert.equal(f.calls.submit,1);
});
test('dispatch tombstone on restart never resubmits',async t=>{
 const f=await fixture(t);await f.journal.put({id,status:'submitting'});
 assert.equal((await f.adapter.run(command())).status,'unknown');assert.equal(f.calls.submit,0);
});
test('cloud replay with lost local journal is unknown, never a first submission',async t=>{
 const f=await fixture(t);assert.equal((await f.adapter.run(command({maySubmit:false}))).status,'unknown');assert.equal(f.calls.submit,0);
});
test('timeout after possible acceptance is terminal unknown without retry',async t=>{
 let calls=0;const f=await fixture(t,{submit:async()=>{calls++;throw new Error('timeout');}});
 assert.equal((await f.adapter.run(command())).status,'unknown');await f.adapter.run(command());assert.equal(calls,1);
});
test('known printer job survives restart and is queried, not submitted again',async t=>{
 const f=await fixture(t);await f.journal.put({id,target:'test-printer',status:'submitted',jobId:7});
 assert.equal((await f.adapter.run(command({maySubmit:false}))).status,'completed');assert.equal(f.calls.submit,0);
});
test('preflight failures cannot print',async t=>{
 const f=await fixture(t,{check:async()=>({ready:false})});assert.equal((await f.adapter.run(command())).code,'printer_not_ready');assert.equal(f.calls.submit,0);
});
test('expired or pre-cancelled jobs cannot print',async t=>{
 const f=await fixture(t);assert.equal((await f.adapter.run(command({expiresAt:'2000-01-01T00:00:00Z'}))).code,'expired');assert.equal(f.calls.submit,0);
 const g=await fixture(t);assert.equal((await g.adapter.run(command({cancelRequested:true}))).status,'cancelled');assert.equal(g.calls.submit,0);
});
test('expiry during preflight checked again',async t=>{
 const f=await fixture(t,{check:async()=>{f.adapter.now=()=>Date.now()+700000;return {ready:true};}});
 assert.equal((await f.adapter.run(command())).status,'failed');assert.equal(f.calls.submit,0);
});
test('accepted job is not called complete while printer is still processing',async t=>{
 const f=await fixture(t,{status:async()=>({jobId:7,state:5,sheets:0})});
 assert.equal((await f.adapter.run(command())).status,'submitted');assert.equal(f.calls.submit,1);
});
test('completion requires an explicit one-sheet count',async t=>{
 const f=await fixture(t,{status:async()=>({jobId:7,state:9,sheets:-1})});assert.equal((await f.adapter.run(command())).code,'sheet_count_unconfirmed');
});
test('cancel verifies job identity and confirms cancellation',async t=>{
 let reads=0;const f=await fixture(t,{status:async()=>({jobId:7,state:++reads===1?5:7})});
 await f.journal.put({id,target:'test-printer',status:'submitted',jobId:7});assert.equal((await f.adapter.run(command({maySubmit:false,cancelRequested:true}))).status,'cancelled');assert.equal(f.calls.cancel,1);assert.equal(f.calls.submit,0);
});
test('wrong job identity never cancelled',async t=>{
 const f=await fixture(t,{status:async()=>({jobId:8,state:5})});await f.journal.put({id,target:'test-printer',status:'submitted',jobId:7});
 assert.equal((await f.adapter.run(command({cancelRequested:true}))).status,'unknown');assert.equal(f.calls.cancel,0);
});
test('corrupt journal fails closed',async t=>{
 const f=await fixture(t);await writeFile(join(f.directory,`${id}.json`),'broken');await assert.rejects(f.adapter.run(command()));assert.equal(f.calls.submit,0);
});
test('journal write failure after accepted request leaves submitting tombstone',async t=>{
 const f=await fixture(t);const put=f.journal.put.bind(f.journal);f.journal.put=async e=>{if(e.status==='submitted')throw new Error('disk');await put(e);};
 await assert.rejects(f.adapter.run(command()));assert.equal(f.calls.submit,1);f.journal.put=put;
 assert.equal((await f.adapter.run(command())).status,'unknown');assert.equal(f.calls.submit,1);
});

test('changed target cannot query or cancel a job from another printer',async t=>{
 const f=await fixture(t,{status:async()=>{throw new Error('must not query');}});
 await f.journal.put({id,target:'previous-printer',status:'submitted',jobId:7});
 assert.equal((await f.adapter.run(command({cancelRequested:true}))).code,'job_identity_unknown');
 assert.equal(f.calls.cancel,0);assert.equal(f.calls.submit,0);
});
test('concurrent delivery cannot enter the adapter twice',async t=>{
 let release;const gate=new Promise(r=>{release=r;});const f=await fixture(t,{check:async()=>{await gate;return {ready:true};}});
 const first=f.adapter.run(command());await assert.rejects(f.adapter.run(command()),/print.busy/);release();await first;assert.equal(f.calls.submit,1);
});

test('coloring job sends selected asset exactly once and survives restart', async t => {
 let selected; const f=await fixture(t,{submit:async(_name,asset)=>{selected=asset;f.calls.submit++;return {jobId:7};}});
 await f.adapter.run(command({asset:'lloyd-v1'}));
 assert.equal(selected,'lloyd-v1');
 const restarted=new PrintAdapter({journal:new PrintJournal(f.directory),client:f.client});
 assert.equal((await restarted.run(command({asset:'lloyd-v1',maySubmit:false}))).status,'completed');
 assert.equal(f.calls.submit,1);
 assert.equal((await restarted.run(command({asset:'charizard-v1'}))).code,'job_identity_unknown');
 assert.equal(f.calls.submit,1);
});
test('legacy test-page journal can never alias a coloring job', async t => {
 const f=await fixture(t);await f.journal.put({id,target:'test-printer',status:'submitted',jobId:7});
 assert.equal((await f.adapter.run(command({asset:'lloyd-v1'}))).status,'unknown');
 assert.equal(f.calls.submit,0);assert.equal(f.calls.cancel,0);
});
