import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
 const s=await simulator(t,b=>b.readUInt16BE(2)===2?[attr(0x21,'job-id',7),attr(0x23,'job-state',5)]:[attr(0x21,'job-id',7),attr(0x42,'job-name',name),attr(0x23,'job-state',9),attr(0x21,'job-media-sheets-completed',1)]);
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
