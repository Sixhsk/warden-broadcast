const http=require('http'),WS=require('ws');
const get=u=>new Promise((res,rej)=>{const rq=http.request(u,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))});rq.on('error',rej);rq.end()});
(async()=>{
 const j=JSON.parse(await get('http://127.0.0.1:9333/json/new?http%3A%2F%2F127.0.0.1%3A7412%2F'));
 const s=new WS(j.webSocketDebuggerUrl,{perMessageDeflate:false});let n=0;const q={};
 const c=(m,p={})=>new Promise(r=>{const i=++n;q[i]=r;s.send(JSON.stringify({id:i,method:m,params:p}))});
 s.on('message',m=>{const x=JSON.parse(m);if(x.id&&q[x.id]){q[x.id](x.result);delete q[x.id]}});
 await new Promise(r=>s.on('open',r));await c('Runtime.enable');
 await new Promise(r=>setTimeout(r,3800));
 const r=await c('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const r=document.querySelector('.frow');return{html:r?r.outerHTML.slice(0,420):'none',n:document.querySelectorAll('.frow').length};
 console.log(JSON.stringify(r.result.value,null,1).slice(0,900));
 process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
