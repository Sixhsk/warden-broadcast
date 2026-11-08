const fs=require('fs'),http=require('http'),WS=require('ws');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG='/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const WEBP='UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==';
const get=u=>new Promise((res,rej)=>{const rq=http.request(u,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))});rq.on('error',rej);rq.end()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const {startServer}=require('D:/AI Working/app/dist-server/server.cjs');
  await startServer({port:7420,staticDir:'D:/AI Working/app/dist',dataDir:'D:/AI Working/app/.tmpdata3'});
  const ws=new WS('ws://127.0.0.1:7420/ws');let id=0;const w={};let snap=null;
  const send=(t,p)=>new Promise(r=>{const i='x'+(++id);w[i]=r;ws.send(JSON.stringify({t,payload:p,id:i}))});
  ws.on('message',m=>{const j=JSON.parse(m);if(j.t==='snapshot')snap=j;if(j.t==='ack'&&w[j.id]){w[j.id](j.data);delete w[j.id]}});
  await new Promise(r=>ws.on('open',r)); await sleep(400);
  send('setup.done',{});send('team.focus',{team:'A'});send('player.focus',{playerId:'A1'});
  await sleep(300);
  const caster=(snap.state.casters||[])[0];
  const tgt=async(url)=>{try{const j=JSON.parse(await get('http://127.0.0.1:9333/json/new?'+encodeURIComponent(url)));if(j.webSocketDebuggerUrl)return j.webSocketDebuggerUrl}catch(e){}const list=JSON.parse(await new Promise((res,rej)=>http.get('http://127.0.0.1:9333/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))}).on('error',rej)));const t=list.find(x=>x.type==='page');return t.webSocketDebuggerUrl};
  const open=async(url,w2=1680,h=1020)=>{const u=await tgt(url);const s=new WS(u,{perMessageDeflate:false});let n=0;const q={};
    const c=(m,p={})=>new Promise(r=>{const i=++n;q[i]=r;s.send(JSON.stringify({id:i,method:m,params:p}))});
    s.on('message',m=>{const j=JSON.parse(m);if(j.id&&q[j.id]){q[j.id](j.result);delete q[j.id]}});
    await new Promise(r=>s.on('open',r));await c('Runtime.enable');
    await c('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
    await sleep(3200);return c};
  const con=await open('http://127.0.0.1:7420/');
  const res=await con('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
    const files=[['${PNG}','image/png','p.png'],['${WEBP}','image/webp','w.webp'],['${JPG}','image/jpeg','j.jpg']];
    const inv=document.querySelectorAll('.pav input[type=file]');
    const out={pavs:inv.length};
    if(inv[0]){const b=await (await fetch('data:image/png;base64,'+'${PNG}')).blob();const f=new File([b],'p.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);inv[0].files=dt.files;inv[0].dispatchEvent(new Event('change',{bubbles:true}))}
    await new Promise(r=>setTimeout(r,1800));
    const cav=document.querySelector('.cav input[type=file]');
    if(cav){const b=await (await fetch('data:image/jpeg;base64,'+'${JPG}')).blob();const f=new File([b],'j.jpg',{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(f);cav.files=dt.files;cav.dispatchEvent(new Event('change',{bubbles:true}))}
    await new Promise(r=>setTimeout(r,1800));
    out.pavImg=document.querySelectorAll('.pav img').length;
    out.pavOk=[...document.querySelectorAll('.pav img')].filter(i=>i.naturalWidth>0).length;
    out.cavOk=[...document.querySelectorAll('.cav img')].filter(i=>i.naturalWidth>0).length;
    return out;
  })()`});
  console.log('console:',JSON.stringify(res.result.value));
  const ov=await open('http://127.0.0.1:7420/overlay.html',1920,1080);
  const r2=await ov('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const a=document.querySelector('.feed-av');const b=document.querySelector('.bg');return {av:!!a,nw:a?a.naturalWidth:0,bgClip:b?getComputedStyle(b).clipPath.slice(0,16):'no-bg'}})()`});
  console.log('overlay:',JSON.stringify(r2.result.value));
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
