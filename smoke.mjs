/** Local protocol tests — NO real AI usage, images are test-only placeholders. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = 'LOCAL_TEST_TOKEN_NOT_A_REAL_SECRET';
function crc32(data) { let c=0xffffffff;for(const byte of data){c^=byte;for(let k=0;k<8;k++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
function chunk(name,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(name),data])));return Buffer.concat([len,Buffer.from(name),data,crc]);}
function png(width,height){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++){const off=y*(1+width*3);raw[off]=0;for(let x=0;x<width;x++){const k=off+1+x*3;raw[k]=20;raw[k+1]=55;raw[k+2]=45;}}return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const inputPhoto=png(512,512), outputPhoto=png(512,768);
const imageDataURL='data:image/png;base64,'+inputPhoto.toString('base64');
async function listen(server){return new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)).once('error',reject));}
async function openPort(){const s=netServer();const port=await listen(s);await new Promise(r=>s.close(r));return port;}
async function runApp(environment){const port=await openPort();const child=spawn(process.execPath,['server.cjs'],{cwd,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),...environment},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<70;i++){if(child.exitCode!==null)throw Error('Server exited: '+output);try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.status===200)return {port,child,output:()=>output};}catch{}await sleep(80);}child.kill();throw Error('No app response: '+output);}
const stop=async ({child})=>{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);if(child.exitCode===null)child.kill('SIGKILL')};
const upstreamRequests=[];
const upstream=createServer(async (req,res)=>{
  const buffers=[];for await(const chunk of req)buffers.push(chunk);
  const body=Buffer.concat(buffers).toString('latin1');
  upstreamRequests.push({body,authorization:req.headers.authorization});
  await sleep(220);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({data:[{b64_json:outputPhoto.toString('base64')}]}));
});
const upstreamPort=await listen(upstream);
let app;
try{
  app=await runApp({NODE_ENV:'test',TEST_UPSTREAM_URL:`http://127.0.0.1:${upstreamPort}/v1/images/edits`,OPENAI_API_KEY:'TEST_ONLY_NO_REAL_KEY',APP_ACCESS_TOKEN:token});
  const base=`http://127.0.0.1:${app.port}`;
  let r=await fetch(base+'/');assert.equal(r.status,200);const markup=await r.text();assert.match(markup,/Gölge Kristali/);assert.match(markup,/FOTOĞRAF YÜKLE/);
  r=await fetch(base+'/api/status');const st=await r.json();assert.equal(st.ready,true);assert.equal(st.requiresAccessCode,true);
  r=await fetch(base+'/api/character',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:imageDataURL})});assert.equal(r.status,401);
  r=await fetch(base+'/api/character',{method:'POST',headers:{'Content-Type':'application/json','X-App-Access-Token':token},body:'{}'});assert.equal(r.status,400);
  r=await fetch(base+'/api/character',{method:'POST',headers:{'Content-Type':'application/json','X-App-Access-Token':token,Origin:'https://invalid.example'},body:JSON.stringify({image:imageDataURL})});assert.equal(r.status,403);
  const auth={'Content-Type':'application/json','X-App-Access-Token':token};
  r=await fetch(base+'/api/character',{method:'POST',headers:auth,body:JSON.stringify({image:imageDataURL})});assert.equal(r.status,202);const job=await r.json();assert.match(job.jobId,/^[a-f0-9]{36}$/);
  let state='processing';for(let i=0;i<25;i++){await sleep(100);r=await fetch(base+'/api/jobs/'+job.jobId,{headers:auth});assert.equal(r.status,200);state=(await r.json()).state;if(state==='completed')break;}assert.equal(state,'completed');
  r=await fetch(base+'/api/jobs/'+job.jobId+'/image',{headers:auth});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const received=Buffer.from(await r.arrayBuffer());assert(received.equals(outputPhoto));
  assert.equal(upstreamRequests.length,1);const request=upstreamRequests[0];assert.equal(request.authorization,'Bearer TEST_ONLY_NO_REAL_KEY');assert.equal((request.body.match(/name="image\[\]"/g)||[]).length,2);assert.match(request.body,/gpt-image-2.5-sunburst/);
  r=await fetch(base+'/api/character',{method:'POST',headers:auth,body:JSON.stringify({image:imageDataURL})});assert.equal(r.status,202);const cancelJob=await r.json();
  r=await fetch(base+'/api/jobs/'+cancelJob.jobId,{method:'DELETE',headers:auth});assert.equal(r.status,200);
  r=await fetch(base+'/api/jobs/'+cancelJob.jobId,{headers:auth});assert.equal((await r.json()).state,'cancelled');
  r=await fetch(base+'/api/jobs/'+cancelJob.jobId+'/image',{headers:auth});assert.equal(r.status,409);
  await stop(app);app=null;
  app=await runApp({NODE_ENV:'test',OPENAI_API_KEY:'',APP_ACCESS_TOKEN:''});
  r=await fetch(`http://127.0.0.1:${app.port}/api/status`);assert.equal((await r.json()).ready,false);
  r=await fetch(`http://127.0.0.1:${app.port}/api/character`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,503);
  console.log('PASS: HTML, API health, API-key missing, auth, invalid photo, origin, 202 job, polling, 2 reference files, PNG, cancellation.');
  console.log('NOTE: This is a MOCK upstream test; no real OpenAI image was generated.');
} finally {if(app)await stop(app);await new Promise(r=>upstream.close(r));}
