const http=require('http'),WS=require('ws');
const get=u=>new Promise((res,rej)=>{const rq=http.request(u,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))});rq.on('error',rej);rq.end()});
const list=()=>new Promise((res,rej)=>http.get('http://127.0.0.1:9333/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej));
(async()=>{
 const j=JSON.parse(await get('http://127.0.0.1:9333/json/new?http%3A%2F%2F127.0.0.1%3A7412%2F'));
 const u=j.webSocketDebuggerUrl||(await list()).find(x=>/7412/.test(x.url||'')).webSocketDebuggerUrl;
 const s=new WS(u,{perMessageDeflate:false});let n=0;const q={};
 const c=(m,p={})=>new Promise(r=>{const i=++n;q[i]=r;s.send(JSON.stringify({id:i,method:m,params:p}))});
 s.on('message',m=>{const x=JSON.parse(m);if(x.id&&q[x.id]){q[x.id](x.result);delete q[x.id]}});
 await new Promise(r=>s.on('open',r));await c('Runtime.enable');
 await c('Emulation.setDeviceMetricsOverride',{width:1680,height:1020,deviceScaleFactor:1,mobile:false});
 await new Promise(r=>setTimeout(r,4000));
 const r=await c('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const im=[...document.querySelectorAll('.pav img,.cav img')];return{pavImg:im.length,ok:im.filter(i=>i.naturalWidth>0).length,src:(im[0]||{}).src||'',wiz:!!document.querySelector('.wizard-mask'),txt:(document.body.innerText||'').slice(0,40)}})()`});
 console.log(JSON.stringify(r.result.value));
 process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
