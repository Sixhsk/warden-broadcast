const {WebSocket}=require('ws');const fs=require('fs');
(async()=>{
  // 先绑定房间号
  const w=new WebSocket('ws://127.0.0.1:7413/ws');
  await new Promise(r=>w.once('open',r));
  w.send(JSON.stringify({t:'cmd',type:'player.room',payload:{playerId:'A1',room:'12345678'}}));
  await new Promise(r=>setTimeout(r,600));
  w.close();
  // 打开控制台并截图
  const list=await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const p=list.find(t=>t.type==='page');
  const ws=new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:128*1024*1024});
  await new Promise(r=>ws.once('open',r));
  let id=0;const pend=new Map();
  ws.on('message',d=>{const m=JSON.parse(Buffer.isBuffer(d)?d.toString():String(d));if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(mm,pr={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:mm,params:pr}));});
  await send('Emulation.setDeviceMetricsOverride',{width:1680,height:1020,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:7413/'});
  await new Promise(r=>setTimeout(r,6000));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('D:/AI Working/app/stream-console.png',Buffer.from(shot.result.data,'base64'));
  const j=await (await fetch('http://127.0.0.1:7413/api/streams')).json();
  console.log('A1:',JSON.stringify(j.streams.find(s=>s.playerId==='A1')));
  console.log('saved stream-console.png');
  ws.close();
})();
