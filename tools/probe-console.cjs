const http=require('http'),WS=require('ws');
const get=u=>new Promise((res,rej)=>{const rq=http.request(u,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))});rq.on('error',rej);rq.end()});
(async()=>{
 const list=JSON.parse(await new Promise((res,rej)=>http.get('http://127.0.0.1:9333/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))}).on('error',rej)));
 const t=list.find(x=>x.type==='page'&&/7420/.test(x.url))||list.find(x=>x.type==='page');
 const s=new WS(t.webSocketDebuggerUrl,{perMessageDeflate:false});let n=0;const q={};
 const c=(m,p={})=>new Promise(r=>{const i=++n;q[i]=r;s.send(JSON.stringify({id:i,method:m,params:p}))});
 s.on('message',m=>{const j=JSON.parse(m);if(j.id&&q[j.id]){q[j.id](j.result);delete q[j.id]}});
 await new Promise(r=>s.on('open',r));
 await c('Runtime.enable');
 const r=await c('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const b=document.body;return{url:location.href,txt:(b.innerText||'').slice(0,90),prow:document.querySelectorAll('.prow').length,pav:document.querySelectorAll('.pav').length,wiz:!!document.querySelector('.wizard-mask'),inputs:document.querySelectorAll('input[type=file]').length}})()`});
 console.log(JSON.stringify(r.result.value));
 const errs=await c('Runtime.evaluate',{returnByValue:true,expression:`window.__errs||'none'`});
 console.log('errs:',JSON.stringify(errs.result.value));
 process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
