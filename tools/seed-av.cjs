const WS=require('ws');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ws=new WS('ws://127.0.0.1:7412/ws');let id=0;const w={};let snap;
const send=(t,p)=>new Promise(r=>{const i='s'+(++id);w[i]=r;ws.send(JSON.stringify({t,payload:p,id:i}))});
ws.on('message',m=>{const j=JSON.parse(m);if(j.t==='snapshot')snap=j;
 if(j.t==='ack'&&w[j.id]){w[j.id]({ok:true,data:j.data});delete w[j.id]}
 if(j.t==='error'){console.log('ERRMSG',j.message);}});
setTimeout(()=>{console.log('snap assets:',Object.keys((snap||{}).assets||{}).length,'A1.avatar:',((snap||{}).state||{}).teams?.A?.players?.[0]?.avatar||null);process.exit(0)},3500);
ws.on('open',async()=>{
 const r=await send('asset.upload',{kind:'avatar',dataUrl:'data:image/png;base64,'+PNG,thumbDataUrl:'data:image/png;base64,'+PNG,w:1,h:1,source:'seed'});
 console.log('upload ack:',JSON.stringify(r).slice(0,120));
 const aid=r.data?.asset?.id;
 if(aid){send('player.avatar',{playerId:'A1',assetId:aid});console.log('avatar id',aid)}
});
