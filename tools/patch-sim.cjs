const fs = require('fs');
const p = 'server/server.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('SIM_PREFIX')) { console.log('already patched'); process.exit(0); }
const A = "function srcNameFor(id) { return SRC_PREFIX + id; }";
const ins = `

// ── 模拟源：无真实推流时，给每名选手建一个浏览器源，用于验证建源 / 切人 / 构图 ──
const SIM_PREFIX = 'SIM-';
function simNameFor(id) { return SIM_PREFIX + id; }

function simPage(player) {
  const accent = player.teamId === 'A' ? '#7fcfd2' : '#f0b95a';
  const teamName = (state.teams[player.teamId] || {}).name || '';
  const name = player.nickname || player.id;
  return \`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SIM \${player.id}</title>
<style>
 html,body{margin:0;height:100%;background:#0b0d10;overflow:hidden;color:#e8edf2;
   font-family:"Microsoft YaHei UI",system-ui,sans-serif}
 .wrap{position:relative;height:100%;display:grid;place-items:center}
 canvas{position:absolute;inset:0;width:100%;height:100%}
 .card{position:relative;text-align:center}
 .id{font-size:13px;letter-spacing:.2em;color:\${accent};opacity:.85}
 .nm{font-size:64px;font-weight:600;line-height:1.12;margin-top:8px}
 .tm{margin-top:12px;font-size:15px;letter-spacing:.16em;color:#9aa6b2}
 .badge{position:absolute;left:32px;top:28px;font-size:12px;letter-spacing:.14em;
   color:\${accent};border:1px solid \${accent};border-radius:4px;padding:5px 9px}
 .foot{position:absolute;left:32px;bottom:28px;font-size:13px;color:#7c8794;letter-spacing:.1em}
 .tc{position:absolute;right:32px;bottom:28px;font-size:13px;color:#7c8794;
   font-family:Consolas,monospace;font-variant-numeric:tabular-nums}
</style></head><body><div class="wrap"><canvas></canvas>
<div class="card"><div class="id">SIMULATED FEED</div><div class="nm">\${name}</div>
<div class="tm">\${teamName} · \${player.id}</div></div>
<div class="badge">模拟画面 · 非真实推流</div>
<div class="foot">切换选手时由控制台同步</div><div class="tc" id="tc">00:00:00</div></div>
<script>
const c=document.querySelector('canvas'),x=c.getContext('2d');
function fit(){c.width=innerWidth;c.height=innerHeight}
addEventListener('resize',fit);fit();
const t0=Date.now();let ph=0;
function draw(){
  const w=c.width,h=c.height,mid=h/2;x.clearRect(0,0,w,h);
  x.strokeStyle='rgba(255,255,255,.045)';x.lineWidth=1;
  for(let gx=0;gx<w;gx+=64){x.beginPath();x.moveTo(gx,0);x.lineTo(gx,h);x.stroke()}
  for(let gy=0;gy<h;gy+=64){x.beginPath();x.moveTo(0,gy);x.lineTo(w,gy);x.stroke()}
  const sy=(ph*2)%h,g=x.createLinearGradient(0,sy-90,0,sy+90);
  g.addColorStop(0,'rgba(127,207,210,0)');g.addColorStop(.5,'rgba(127,207,210,.10)');
  g.addColorStop(1,'rgba(127,207,210,0)');x.fillStyle=g;x.fillRect(0,sy-90,w,180);
  x.strokeStyle='\${accent}';x.lineWidth=2;x.beginPath();
  for(let i=0;i<=w;i+=4){
    const spike=(i%260>14&&i%260<26)?Math.sin((i%260-14)/12*Math.PI)*-170:0;
    const y=mid+Math.sin(i/w*Math.PI*6+ph*.06)*14+spike;
    i?x.lineTo(i,y):x.moveTo(i,y);
  }
  x.stroke();ph+=3;requestAnimationFrame(draw);
}
draw();
setInterval(function(){var s=Math.floor((Date.now()-t0)/1000);
  document.getElementById('tc').textContent=
    [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(function(v){return String(v).padStart(2,'0')}).join(':')},500);
</script></body></html>\`;
}

function simSettings(player) {
  return {
    url: 'http://127.0.0.1:' + currentPort + '/sim/' + player.id,
    width: 1440, height: 810, fps_custom: true, fps: 30,
    shutdown: true, restart_when_active: false,
    css: 'body{background:transparent}',
  };
}

async function buildObsSim(sceneOverride, mode) {
  if (!OBS.authed) throw new Error('OBS 未连接');
  const sceneName = String(sceneOverride || state.obs.srcScene || '比赛画面').trim() || '比赛画面';
  state.obs.srcScene = sceneName;
  await ensureObsScene(sceneName);
  let created = 0, updated = 0, removed = 0;
  for (const p of allPlayerList()) {
    const nm = simNameFor(p.id);
    if (mode === 'remove') {
      try { await obsSend('RemoveInput', { inputName: nm }); removed++; } catch (e) {}
      continue;
    }
    let exists = true;
    try { await obsSend('GetInputSettings', { inputName: nm }); } catch (e) { exists = false; }
    if (!exists) {
      await obsSend('CreateInput', { sceneName, inputName: nm, inputKind: 'browser_source', inputSettings: simSettings(p), sceneItemEnabled: false });
      created++;
    } else {
      await obsSend('SetInputSettings', { inputName: nm, inputSettings: simSettings(p), overlay: true });
      let has = false;
      try { const it0 = await obsSend('GetSceneItemId', { sceneName, sourceName: nm }); has = !!(it0 && it0.sceneItemId != null); } catch (e) { has = false; }
      if (!has) { await obsSend('CreateSceneItem', { sceneName, sourceName: nm, sceneItemEnabled: false }); created++; }
      else updated++;
    }
    try {
      const it = await obsSend('GetSceneItemId', { sceneName, sourceName: nm });
      await obsSend('SetSceneItemTransform', {
        sceneName, sceneItemId: it.sceneItemId,
        sceneItemTransform: {
          positionX: 0, positionY: 90, alignment: 5,
          boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 5,
          boundsWidth: 1440, boundsHeight: 810,
        },
      });
    } catch (e) { log('模拟源布局失败 ' + nm + ': ' + e.message); }
  }
  const focus = await applyObsFocus();
  log('模拟源 mode=' + mode + ' created=' + created + ' updated=' + updated + ' removed=' + removed);
  return { scene: sceneName, mode, created, updated, removed, focus };
}
`;
s = s.replace(A, A + ins);

s = s.replace(
  "  const target = focus && focus.room ? srcNameFor(focus.id) : null;",
  "  const target = focus && focus.room ? srcNameFor(focus.id) : null;\n  const targetSim = focus ? simNameFor(focus.id) : null;"
);
s = s.replace(
  "  const found = items.filter((it) => String(it.sourceName || '').startsWith(SRC_PREFIX));",
  "  const found = items.filter((it) => /^(SRC|SIM)-/.test(String(it.sourceName || '')));"
);
s = s.replace(
  "    const want = it.sourceName === target;",
  "    const want = it.sourceName === target || it.sourceName === targetSim;"
);
s = s.replace(
  "    if (type === 'obs.build') {",
  `    if (type === 'obs.sim') {
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      const r = await buildObsSim(payload.scene, payload.mode === 'remove' ? 'remove' : 'add');
      pushObs();
      return sendTo(ws, { t: 'ack', id, data: r });
    }
    if (type === 'obs.build') {`
);
s = s.replace(
  "    const mStream = p.match(/^\/stream\/([A-Za-z0-9_-]+)\.flv$/);",
  `    const mSim = p.match(/^\/sim\/([A-Za-z0-9_-]+)$/);
    if (mSim) {
      const pl = findPlayer(mSim[1]);
      if (!pl) { res.writeHead(404); res.end('no player'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(simPage(pl));
      return;
    }

    const mStream = p.match(/^\/stream\/([A-Za-z0-9_-]+)\.flv$/);`
);
fs.writeFileSync(p, s);
console.log('patched ok');
