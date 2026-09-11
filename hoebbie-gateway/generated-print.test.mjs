import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrintAssetCache } from './print-asset-cache.mjs';
import { cupsClient, PrintAdapter, PrintJournal, validPrintCommand } from './print-adapter.mjs';
const key='alfred-11111111-1111-4111-8111-111111111111-v1';
const bytes=Buffer.alloc(4096,17);
const metadata=()=>({sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expiresAt:new Date(Date.now()+3600000).toISOString()});
const command=()=>({commandId:'11111111-1111-4111-8111-111111111111',asset:key,assetMetadata:metadata(),maySubmit:true,cancelRequested:false,expiresAt:new Date(Date.now()+60000).toISOString()});
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'generated-print-'));t.after(()=>rm(directory,{recursive:true,force:true}));let requests=0;const prepare=createPrintAssetCache({directory,requestAsset:async()=>{requests++;return new Response(bytes,{headers:{'Content-Type':'image/pwg-raster'}});}});return {directory,prepare,requests:()=>requests};}
test('generated commands require strict UUID and server metadata',()=>{
 assert.equal(validPrintCommand(command()),true);
 for(const assetMetadata of [null,{}, {...metadata(),bytes:1},{...metadata(),sha256:'bad'},{...metadata(),expiresAt:'never'}]) assert.ok(!validPrintCommand({...command(),assetMetadata}));
 for(const asset of ['alfred-any-v1','../../file',key+'/../x',key.replace('11111111','zzzzzzzz')]) assert.ok(!validPrintCommand({...command(),asset}));
});
test('generated raster requires fresh authorization on every print and is explicitly released',async t=>{
 const f=await fixture(t);const path=await f.prepare(key,metadata());await f.prepare(key,metadata());assert.equal(f.requests(),2);
 assert.deepEqual(await readFile(path),bytes);await f.prepare.release(key);await assert.rejects(readFile(path));
 await f.prepare.release(key);
});
test('expired and mismatched descriptors cannot use a previously cached generated image',async t=>{
 const f=await fixture(t);await f.prepare(key,metadata());
 await assert.rejects(f.prepare(key,{...metadata(),expiresAt:new Date(0).toISOString()}));assert.equal(f.requests(),1);
 await assert.rejects(f.prepare(key,{...metadata(),sha256:'0'.repeat(64)}));await assert.rejects(f.prepare(key,{...metadata(),bytes:4097}));
});
test('startup cleanup erases interrupted generated files while preserving curated art and journal',async t=>{
 const f=await fixture(t);
 for(const suffix of ['.pwg','.pwg.tmp']) await writeFile(join(f.directory,key+suffix),'private');
 for(const name of ['lloyd-v1.pwg','journal.json',key]) await writeFile(join(f.directory,name),'keep');
 await f.prepare.pruneGenerated();
 for(const suffix of ['.pwg','.pwg.tmp']) await assert.rejects(readFile(join(f.directory,key+suffix)));
 for(const name of ['lloyd-v1.pwg','journal.json',key]) assert.equal(await readFile(join(f.directory,name),'utf8'),'keep');
});
test('adapter transfers verified bytes once and erases them after completion; reconciliation never reprints',async t=>{
 const f=await fixture(t);let submissions=0;
 const client=cupsClient({uri:'ipp://192.168.1.2/ipp/print',prepareAsset:f.prepare,run:async(_bin,args)=>{
  if(args[0]==='check') return {stdout:JSON.stringify({ready:true})};
  if(args[0]==='submit'){submissions++;assert.equal(args[3],join(f.directory,key+'.pwg'));assert.deepEqual(await readFile(args[3]),bytes);return {stdout:JSON.stringify({jobId:7})};}
  return {stdout:JSON.stringify({jobId:7,state:9,sheets:1})};
 }});
 const adapter=new PrintAdapter({journal:new PrintJournal(join(f.directory,'journal')),client});const c=command();
 assert.equal((await adapter.run(c)).status,'completed');await assert.rejects(readFile(join(f.directory,key+'.pwg')));
 assert.equal((await adapter.run({...c,maySubmit:false})).status,'completed');assert.equal(submissions,1);assert.equal(f.requests(),1);
});
test('failed preflight also removes generated files without submitting',async t=>{
 const f=await fixture(t);const client=cupsClient({uri:'ipp://192.168.1.2/ipp/print',prepareAsset:f.prepare,run:async()=>({stdout:JSON.stringify({ready:false})})});
 const adapter=new PrintAdapter({journal:new PrintJournal(join(f.directory,'journal')),client});assert.equal((await adapter.run(command())).status,'failed');await assert.rejects(readFile(join(f.directory,key+'.pwg')));
});
test('native production allowlist accepts only the exact generated path shape',async t=>{
 const f=await fixture(t),source=join(f.directory,'paths.c'),binary=join(f.directory,'paths');
 const header=fileURLToPath(new URL('./print/asset-paths.h',import.meta.url));
 await writeFile(source,'#include <string.h>\n#include "'+header+'"\nint main(int argc,char **argv){return argc==2&&allowed_print_path(argv[1])?0:1;}\n');
 execFileSync('cc',['-Wall','-Wextra','-Werror',source,'-o',binary]);
 execFileSync(binary,['/data/print-assets/'+key+'.pwg']);execFileSync(binary,['/data/print-assets/lloyd-v1.pwg']);
 for(const path of ['/tmp/'+key+'.pwg','/data/print-assets/'+key+'.pwg/../x','/data/print-assets/alfred-any-v1.pwg','/data/print-assets/'+key+'.png']) assert.throws(()=>execFileSync(binary,[path]));
});
