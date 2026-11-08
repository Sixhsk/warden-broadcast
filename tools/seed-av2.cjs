const WS=require('ws');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ws=new WS('ws://127.0.0.1:7412/ws');let snap;const ack={};
ws.on('message',m=>{const j=JSON.parse(m);if(j.t==='snapshot')snap=j;if(j.t==='ack'&&j.id)ack[j.id]=j.data;if(j.t==='error')console.log('ERR:',j.message)});
ws.on('open',()=>{
  ws.send(JSON.stringify({t:'cmd',type:'asset.upload',id:'u1',payload:{kind:'avatar',dataUrl:'data:image/png;base64,'+PNG,thumbDataUrl:'data:image/png;base64,'+PNG,w:1,h:1,source:'seed'}}));
  setTimeout(()=>{
    console.log('ack u1:',JSON.stringify(ack.u1||null).slice(0,140));
    const aid=ack.u1&&ack.u1.asset&&ack.u1.asset.id;
    if(aid)ws.send(JSON.stringify({t:'cmd',type:'player.avatar',id:'u2',payload:{playerId:'A1',assetId:aid}}));
    setTimeout(()=>{
      const p=snap&&snap.state&&snap.state.teams.A.players[0];
      console.log('A1.avatar:',p&&p.avatar,'assets:',Object.keys((snap||{}).assets||{}).length,'ack u2:',JSON.stringify(ack.u2));
      process.exit(0);
    },700);
  },700);
});
