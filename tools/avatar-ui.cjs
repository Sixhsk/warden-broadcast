const WS=require('ws');
const JPG='/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const CDP='http://127.0.0.1:9333';
const http=require('http');
const get=u=>new Promise((res,rej)=>{const rq=http.request(u,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))});rq.on('error',rej);rq.end()});
async function target(url){const list=JSON.parse(await get(CDP+'/json/new?'+encodeURIComponent(url)));return list.webSocketDebuggerUrl}
(async()=>{
 const wsUrl=await target('http://127.0.0.1:7419/');
 const ws=new WS(wsUrl,{perMessageDeflate:false});let id=0;const p={};
 const cmd=(m,pr={})=>new Promise(r=>{const i=++id;p[i]=r;ws.send(JSON.stringify({id:i,method:m,params:pr}))});
 ws.on('message',m=>{const j=JSON.parse(m);if(j.id&&p[j.id]){p[j.id](j.result);delete p[j.id]}});
 await new Promise(r=>ws.on('open',r));
 await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:1680,height:1020,deviceScaleFactor:1,mobile:false});
 await new Promise(r=>setTimeout(r,3500));
 const inject=await cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   const b64='${JPG}';
   const res=await fetch('data:image/jpeg;base64,'+b64); const blob=await res.blob();
   const f=new File([blob],'a.jpg',{type:'image/jpeg'});
   const inp=document.querySelector('.pav input[type=file]');
   if(!inp) return 'no-input';
   const dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files;
   inp.dispatchEvent(new Event('change',{bubbles:true}));
   return 'dispatched';
 })()`});
 console.log('inject:',JSON.stringify(inject.result.value));
 await new Promise(r=>setTimeout(r,2500));
 const out=await cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   const img=document.querySelector('.pav img');
   const r=await fetch('/api/health').then(x=>x.json());
   return {img:!!img, nw:img?img.naturalWidth:0, src:img?img.src.slice(0,40):'', health:r.ok};
 })()`});
 console.log('console:',JSON.stringify(out.result.value));
 const ov=await target('http://127.0.0.1:7419/overlay.html');
 const w2=new WS(ov,{perMessageDeflate:false});let id2=0;const q={};
 const c2=(m,pr={})=>new Promise(r=>{const i=++id2;q[i]=r;w2.send(JSON.stringify({id:i,method:m,params:pr}))});
 w2.on('message',m=>{const j=JSON.parse(m);if(j.id&&q[j.id]){q[j.id](j.result);delete q[j.id]}});
 await new Promise(r=>w2.on('open',r));
 await c2('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await new Promise(r=>setTimeout(r,3000));
 const o2=await c2('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const a=document.querySelector('.feed-av');return {av:!!a,nw:a?a.naturalWidth:0,bgClip:getComputedStyle(document.querySelector('.bg')||document.body).clipPath.slice(0,24)}})()`});
 console.log('overlay:',JSON.stringify(o2.result.value));
 process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
