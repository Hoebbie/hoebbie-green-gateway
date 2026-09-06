import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPrintAssetCache } from './print-asset-cache.mjs';
const bytes = Buffer.alloc(4096, 17); // Owned synthetic transport fixture, no third-party image.
const digest = createHash('sha256').update(bytes).digest('hex');
const assets = { 'lloyd-v1': { sha256: digest } };
async function fixture(t, requestAsset) { const directory=await mkdtemp(join(tmpdir(),'print-assets-')); t.after(()=>rm(directory,{recursive:true,force:true})); return {directory, prepare:createPrintAssetCache({directory,assets,requestAsset})}; }
test('private asset is downloaded once, verified and then restored from cache', async t => {
 let requests=0; const f=await fixture(t, async key=>{assert.equal(key,'lloyd-v1');requests++;return new Response(bytes,{headers:{'Content-Type':'image/pwg-raster'}});});
 const path=await f.prepare('lloyd-v1');assert.deepEqual(await readFile(path),bytes);await f.prepare('lloyd-v1');assert.equal(requests,1);
 await writeFile(path,'corrupt');await f.prepare('lloyd-v1');assert.equal(requests,2);
});
test('invalid hash, oversized download, denied access and free paths cannot become printable cache', async t => {
 for (const response of [new Response('denied',{status:403}), new Response(Buffer.alloc(4096),{headers:{'Content-Type':'image/pwg-raster'}}),new Response(bytes,{headers:{'Content-Type':'image/pwg-raster','Content-Length':'12000001'}})]) {
  const f=await fixture(t,async()=>response);await assert.rejects(f.prepare('lloyd-v1'));await assert.rejects(readFile(join(f.directory,'lloyd-v1.pwg')));
 }
 const f=await fixture(t,async()=>{throw new Error('must not request');});await assert.rejects(f.prepare('../../file'));
});
test('declared download size cannot bypass the streaming bound', async t => {
 const f=await fixture(t,async()=>new Response(Buffer.alloc(12000001),{headers:{'Content-Type':'image/pwg-raster','Content-Length':'10'}}));await assert.rejects(f.prepare('lloyd-v1'));
});
test('artwork cache is bounded and eviction never touches the print journal', async t => {
 const directory=await mkdtemp(join(tmpdir(),'print-bounded-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const customAssets={'lloyd-v1':{sha256:digest},'charizard-v1':{sha256:digest}};
 let requests=0;
 const prepare=createPrintAssetCache({directory,assets:customAssets,maxCacheBytes:4096,requestAsset:async()=>{requests++;return new Response(bytes,{headers:{'Content-Type':'image/pwg-raster'}});}});
 await writeFile(join(directory,'journal.json'),'keep');
 await prepare('lloyd-v1');await prepare('charizard-v1');
 await assert.rejects(readFile(join(directory,'lloyd-v1.pwg')));
 assert.equal((await readFile(join(directory,'charizard-v1.pwg'))).length,4096);
 assert.equal(await readFile(join(directory,'journal.json'),'utf8'),'keep');
 await prepare('lloyd-v1');assert.equal(requests,3);
});
