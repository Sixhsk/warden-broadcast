const fs=require('fs'),path=require('path'),WebSocket=require('ws');
const cfg=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
const pw=cfg.server_password;
(async()=>{
const {startServer,stopServer}=require('D:/AI Working/app/dist-server/server.cjs');
await startServer({port:7417,staticDir:'D:/AI Working/app/dist',dataDir:'D:/AI Working/app/.tmpdata'});
const ws=new WebSocket('ws://127.0.0.1:7417/ws'); let id=0; const waiters={};
const send=(t,p)=>new Promise(r=>{const i='m'+(++id);waiters[i]=r;ws.send(JSON.stringify({t,payload:p,id:i}))});
ws.on('message',m=>{const j=JSON.parse(m);if(j.t==='ack'&&waiters[j.id]){waiters[j.id](j.data);delete waiters[j.id];}if(j.t==='error')console.log('ERR',j.message);});
await new Promise(r=>ws.on('open',r));
await send('obs.config',{url:'ws://127.0.0.1:4455',password:pw});
const c=await send('obs.connect',{}); console.log('connect:',JSON.stringify(c).slice(0,160));
await send('player.room',{playerId:'A1',room:'12345678'});
const b=await send('obs.build',{scene:'比赛画面'}); console.log('BUILD:',JSON.stringify(b).slice(0,900));
const s=await send('obs.sync',{}); console.log('SYNC:',JSON.stringify(s).slice(0,300));
ws.close(); await stopServer(); process.exit(0);
})().catch(e=>{console.log('FATAL',e.message);process.exit(1)});
