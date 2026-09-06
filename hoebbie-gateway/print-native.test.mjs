import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
const binary=process.env.PRINT_TEST_BINARY ?? '/private/tmp/hoebbie-print-client';
const asset=fileURLToPath(new URL('./print/test-a4.pwg',import.meta.url));
const name='HOS-11111111-1111-4111-8111-111111111111';
function attr(tag,key,value){
 const k=Buffer.from(key),v=typeof value==='number'?Buffer.alloc(4):Buffer.from(value);
 if(typeof value==='number')v.writeInt32BE(value);
 const h=Buffer.alloc(3);h[0]=tag;h.writeUInt16BE(k.length,1);const l=Buffer.alloc(2);l.writeUInt16BE(v.length);return Buffer.concat([h,k,l,v]);
}
async function simulator(t,handler){
 const requests=[];const server=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks);requests.push(b.readUInt16BE(2));
  const reply=handler(b,req,res);if(reply===null)return;
  const header=Buffer.from([2,0,0,0,0,0,0,0]);b.copy(header,4,4,8);
  res.writeHead(200,{'Content-Type':'application/ipp'});
  res.end(Buffer.concat([header,Buffer.from([1]),attr(0x47,'attributes-charset','utf-8'),attr(0x48,'attributes-natural-language','en'),Buffer.from([2]),...reply,Buffer.from([3])]));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 return {uri:`ipp://127.0.0.1:${server.address().port}/ipp/print`,requests};
}
async function run(s,op,arg){const {stdout}=await exec(binary,[op,s.uri,name,arg],{timeout:10000,env:{...process.env,HOEBBIE_PRINT_SIMULATOR:'1'}});return JSON.parse(stdout);}
test('native CUPS sends one raster document and reads the exact named job',async t=>{
 const raster=await readFile(asset);
 const s=await simulator(t,b=>{if(b.readUInt16BE(2)===2) assert.deepEqual(b.subarray(-raster.length),raster); return b.readUInt16BE(2)===2?[attr(0x21,'job-id',7),attr(0x23,'job-state',5)]:[attr(0x21,'job-id',7),attr(0x42,'job-name',name),attr(0x23,'job-state',9),attr(0x21,'job-media-sheets-completed',1)];});
 assert.equal((await run(s,'submit',asset)).jobId,7);assert.equal((await run(s,'status','7')).sheets,1);assert.deepEqual(s.requests,[2,9]);
});
test('native lost reply after receiving document does NOT replay Print-Job',async t=>{
 const s=await simulator(t,(_b,req)=>{req.socket.destroy();return null;});
 await assert.rejects(run(s,'submit',asset));assert.deepEqual(s.requests,[2]);
});
test('native status rejects reused printer job ID with different name',async t=>{
 const s=await simulator(t,()=>[attr(0x21,'job-id',7),attr(0x42,'job-name','another-document'),attr(0x23,'job-state',9),attr(0x21,'job-media-sheets-completed',1)]);
 await assert.rejects(run(s,'status','7'));assert.deepEqual(s.requests,[9]);
});

test('lost reply identifies response phase and attempted bytes without replay',async t=>{
 const s=await simulator(t,(_b,req)=>{req.socket.destroy();return null;});
 await assert.rejects(run(s,'submit',asset),e=>{
  const d=JSON.parse(e.stdout).diagnostic;
  assert.equal(d.phase,'response');assert.equal(d.documentBytes,159017);
  assert.equal(d.bytesAttempted,159017);assert.equal(d.ippStatus,-1);
  assert.ok(d.elapsedMs>=0);return true;
 });
 assert.deepEqual(s.requests,[2]);
});
test('printer IPP rejection is retained as numeric code without response text',async t=>{
 const s=await simulator(t,(b,_req,res)=>{
  const h=Buffer.from([2,0,4,11,0,0,0,0]);b.copy(h,4,4,8);
  res.writeHead(200,{'Content-Type':'application/ipp'});
  res.end(Buffer.concat([h,Buffer.from([1]),attr(0x47,'attributes-charset','utf-8'),attr(0x48,'attributes-natural-language','en'),attr(0x41,'status-message','PRIVATE_PRINTER_MESSAGE'),Buffer.from([3])]));return null;
 });
 await assert.rejects(run(s,'submit',asset),e=>{const d=JSON.parse(e.stdout).diagnostic;assert.equal(d.phase,'response');assert.equal(d.ippStatus,0x040b);assert.equal(d.httpStatus,200);assert.ok(!e.stdout.includes('PRIVATE'));return true;});
 assert.deepEqual(s.requests,[2]);
});
test('identity failure distinguished from transport failure',async t=>{
 const s=await simulator(t,()=>[attr(0x21,'job-id',7),attr(0x42,'job-name','different'),attr(0x23,'job-state',9)]);
 await assert.rejects(run(s,'status','7'),e=>{assert.equal(JSON.parse(e.stdout).diagnostic.phase,'identity');return true;});
});

test('HTTP rejection before document is request phase with zero attempted bytes',async t=>{
 const server=createServer();let requests=0;
 server.on('checkContinue',(_req,res)=>{requests++;res.writeHead(503,{'Connection':'close'});res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const s={uri:`ipp://127.0.0.1:${server.address().port}/ipp/print`};
 await assert.rejects(run(s,'submit',asset),e=>{const d=JSON.parse(e.stdout).diagnostic;assert.equal(d.phase,'request');assert.equal(d.httpStatus,503);assert.equal(d.bytesAttempted,0);return true;});assert.equal(requests,1);
});
test('connection refusal is distinct and cannot attempt document bytes',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 await assert.rejects(run({uri:`ipp://127.0.0.1:${port}/ipp/print`},'submit',asset),e=>{const d=JSON.parse(e.stdout).diagnostic;assert.equal(d.phase,'connect');assert.equal(d.bytesAttempted,0);return true;});
});

test('interrupted large document exposes upload phase without a second request',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ipp-upload-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'large.pwg');await writeFile(path,Buffer.alloc(11000000,255));
 let requests=0;const server=createServer(req=>{requests++;req.once('data',()=>req.socket.destroy());});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 await assert.rejects(run({uri:`ipp://127.0.0.1:${server.address().port}/ipp/print`},'submit',path),e=>{
  const d=JSON.parse(e.stdout).diagnostic;assert.equal(d.phase,'document');assert.ok(d.bytesAttempted>0);assert.ok(d.bytesAttempted<11000000);assert.equal(d.documentBytes,11000000);return true;
 });assert.equal(requests,1);
});
