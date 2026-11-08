const fs=require('fs'),path=require('path'),crypto=require('crypto'),WS=require('ws');
const cfg=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
const tries=[['config',cfg.server_password],['empty','']];
let i=0;
function attempt(){
 if(i>=tries.length){process.exit(0)}
 const [label,pw]=tries[i++];
 const ws=new WS('ws://127.0.0.1:4455',{handshakeTimeout:5000,perMessageDeflate:false});
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());
  if(m.op===0){const {salt,challenge}=m.d;const s=crypto.createHash('sha256').update(pw+salt).digest('base64');const a=crypto.createHash('sha256').update(s+challenge).digest('base64');ws.send(JSON.stringify({op:1,d:{rpcVersion:1,authentication:a}}))}
  if(m.op===2){console.log(label,'=> AUTH OK');ws.close();setTimeout(attempt,200)}});
 ws.on('close',(c,r)=>{console.log(label,'close',c,String(r||'').slice(0,60));setTimeout(attempt,200)});
 ws.on('error',e=>{console.log(label,'error',e.message);setTimeout(attempt,200)});
}
attempt();
