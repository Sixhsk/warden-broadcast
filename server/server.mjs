// 卫戍协议 赛事直播 UI — 本地服务
// 职责：单一 matchState + WebSocket 广播 + 素材存储 + OBS WebSocket 桥接 + 静态资源
import http from 'node:http';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const HERE = (() => {
  try {
    // CJS 打包环境（Electron）下 __dirname 存在
    return __dirname;
  } catch {
    return path.dirname(fileURLToPath(import.meta.url));
  }
})();

/* ------------------------------------------------------------------ 状态 */

const PLAYER_SEED = {
  A: ['夜航星', '铁砧', '白噪音', '长明'],
  B: ['逆潮', '铅字', '冷杉', '断路器'],
};

function makePlayers(teamId) {
  return PLAYER_SEED[teamId].map((nickname, i) => ({
    id: `${teamId}${i + 1}`,
    teamId,
    nickname,
    avatar: null,
    note: '',
    alive: !(teamId === 'A' && i === 2),
    signal: teamId === 'A' && i === 3 ? 'offline' : 'online',
    // B 站直播间号：作为该选手的直播信号源，留空表示未绑定
    room: '',
  }));
}

function defaultState() {
  return {
    schema: 1,
    event: { name: '明日方舟：卫戍协议', stage: '季后赛 · 半决赛', round: '第 2 场' },
    teams: {
      A: { id: 'A', name: '灰脊联队', players: makePlayers('A') },
      B: { id: 'B', name: '赤砂工坊', players: makePlayers('B') },
    },
    casters: [
      { id: 'c1', name: '沈青', role: '主解说', avatar: null },
      { id: 'c2', name: '老陈', role: '嘉宾', avatar: null },
    ],
    currentTeam: 'A',
    focusPlayerId: 'A1',
    setupDone: false,
    // 正计时：从 00:00:00 起累计；服务端只存「已累计毫秒 + 本轮开始时刻」，
    // 剩余/已过时间一律由时间戳推算，避免逐秒递减造成的漂移。
    timer: { phase: 'idle', startedAt: null, accumulatedMs: 0 },
    feedBackdrop: 'black',
    // 主题色：种子色推导整套 MD3 配色，控制台与叠加层共用
    theme: { seed: '#4F6BED', mode: 'dark' },
    background: null,
    assets: {},
    libDir: null,
    obs: { url: 'ws://127.0.0.1:4455', srcScene: '比赛画面' },
  };
}

let state = defaultState();
let version = 0;
let dataDir = '';
let assetsDir = '';
let saveTimer = null;

function bump() {
  version += 1;
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 400);
}

function saveNow() {
  try {
    fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[state] 保存失败', err.message);
  }
}

function loadState() {
  const file = path.join(dataDir, 'state.json');
  if (!fs.existsSync(file)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const base = defaultState();
    state = {
      ...base,
      ...raw,
      event: { ...base.event, ...(raw.event || {}) },
      teams: {
        A: { ...base.teams.A, ...(raw.teams?.A || {}) },
        B: { ...base.teams.B, ...(raw.teams?.B || {}) },
      },
      casters: Array.isArray(raw.casters) && raw.casters.length ? raw.casters : base.casters,
      timer: migrateTimer(raw.timer, base.timer),
      feedBackdrop: raw.feedBackdrop === 'transparent' ? 'transparent' : 'black',
      theme: {
        seed: /^#[0-9a-f]{6}$/i.test(raw.theme?.seed || '') ? raw.theme.seed : base.theme.seed,
        mode: raw.theme?.mode === 'light' ? 'light' : 'dark',
      },
      assets: raw.assets || {},
      obs: { ...base.obs, ...(raw.obs || {}) },
    };
    if (state.timer.phase === 'running') {
      // 服务重启：沿用开始时刻，已过时间自动补上，不需要额外修正
      state.timer = { ...state.timer };
    }
    if (!findPlayer(state.focusPlayerId)) state.focusPlayerId = null;
  } catch (err) {
    console.error('[state] 读取失败，使用默认配置', err.message);
  }
}

/* ------------------------------------------------------------- 查询工具 */

const teamIds = ['A', 'B'];

function allPlayers() {
  return teamIds.flatMap((t) => state.teams[t].players);
}

function findPlayer(id) {
  return allPlayers().find((p) => p.id === id) || null;
}

function teamOfPlayer(id) {
  const p = findPlayer(id);
  return p ? state.teams[p.teamId] : null;
}

function clampDuration(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(n, 99 * 3600 * 1000));
}

/* ------------------------------------------------------------------ 计时 */

function elapsedOf(t, now) {
  const acc = Number(t.accumulatedMs) || 0;
  if (t.phase === 'running' && typeof t.startedAt === 'number') {
    return acc + Math.max(0, now - t.startedAt);
  }
  return Math.max(0, acc);
}

function timerSnapshot() {
  const t = state.timer;
  return { ...t, elapsedMs: elapsedOf(t, Date.now()) };
}

function migrateTimer(raw, base) {
  if (!raw || typeof raw !== 'object') return { ...base };
  if (typeof raw.accumulatedMs === 'number') {
    return {
      phase: raw.phase === 'running' || raw.phase === 'paused' ? raw.phase : 'idle',
      startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
      accumulatedMs: Math.max(0, raw.accumulatedMs),
    };
  }
  // 旧版倒计时数据：用 duration - remaining 反推已经过去的时间
  const dur = Number(raw.durationMs) || 0;
  const left = Number(raw.remainingMs);
  const passed = Number.isFinite(left) ? Math.max(0, dur - left) : 0;
  return { phase: passed > 0 ? 'paused' : 'idle', startedAt: null, accumulatedMs: passed };
}

function timerCommand(cmd) {
  const t = state.timer;
  const now = Date.now();
  if (cmd === 'start') {
    if (t.phase === 'running') return '计时已在进行中';
    state.timer = { phase: 'running', startedAt: now, accumulatedMs: 0 };
  } else if (cmd === 'pause') {
    if (t.phase !== 'running') return '当前不在计时中';
    state.timer = { phase: 'paused', startedAt: null, accumulatedMs: elapsedOf(t, now) };
  } else if (cmd === 'resume') {
    if (t.phase !== 'paused') return '当前不在暂停状态';
    state.timer = { phase: 'running', startedAt: now, accumulatedMs: Math.max(0, t.accumulatedMs || 0) };
  } else if (cmd === 'reset') {
    state.timer = { phase: 'idle', startedAt: null, accumulatedMs: 0 };
  } else {
    return '未知计时指令';
  }
  return null;
}

/* ------------------------------------------------------------------ 素材 */

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function storeAsset(kind, dataUrl, thumbDataUrl, meta = {}) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('素材格式无法识别（需要 PNG / JPEG / WebP 的 data URL）');
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw new Error('不支持的图片格式：' + mime);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 12 * 1024 * 1024) throw new Error('素材过大（上限 12 MB，请在导入时压缩）');
  const id = crypto.randomBytes(6).toString('hex');
  const file = `a_${id}.${ext}`;
  fs.writeFileSync(path.join(assetsDir, file), buf);
  let thumbFile = null;
  const tm = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(thumbDataUrl || ''));
  if (tm) {
    const text = MIME_EXT[tm[1].toLowerCase()] || 'png';
    thumbFile = `t_${id}.${text}`;
    fs.writeFileSync(path.join(assetsDir, thumbFile), Buffer.from(tm[2], 'base64'));
  }
  const asset = {
    id,
    kind,
    mime,
    file,
    thumb: thumbFile,
    w: Math.round(Number(meta.w) || 0),
    h: Math.round(Number(meta.h) || 0),
    bytes: buf.length,
    createdAt: Date.now(),
    source: meta.source || '本地导入',
    name: String(meta.name || '').slice(0, 80) || null,
    sha256: String(meta.sha256 || '').slice(0, 64).toLowerCase() || null,
  };
  state.assets[id] = asset;
  return asset;
}

function assetUrl(id) {
  const a = state.assets[id];
  return a ? `/media/${a.file}` : null;
}

function thumbUrl(id) {
  const a = state.assets[id];
  if (!a) return null;
  return a.thumb ? `/media/${a.thumb}` : `/media/${a.file}`;
}

/* ------------------------------------------------------------------- OBS */

const OBS = {
  ws: null,
  url: '',
  authed: false,
  connecting: false,
  error: null,
  rpcVersion: null,
  obsVersion: null,
  scene: null,
  scenes: [],
  streaming: false,
  streamState: 'idle',
  lastMessageAt: 0,
  pending: new Map(),
  seq: 0,
};

function obsStatus() {
  return {
    url: state.obs.url,
    connected: !!(OBS.ws && OBS.authed),
    connecting: OBS.connecting,
    error: OBS.error,
    obsVersion: OBS.obsVersion,
    rpcVersion: OBS.rpcVersion,
    scene: OBS.scene,
    scenes: OBS.scenes,
    streaming: OBS.streaming,
    streamState: OBS.streamState,
  };
}

function pushObs() {
  broadcast();
}

function obsSend(requestType, requestData = {}) {
  return new Promise((resolve, reject) => {
    if (!OBS.ws || !OBS.authed) return reject(new Error('OBS 未连接'));
    const requestId = 'r' + ++OBS.seq;
    const timer = setTimeout(() => {
      OBS.pending.delete(requestId);
      reject(new Error('OBS 请求超时：' + requestType));
    }, 8000);
    OBS.pending.set(requestId, {
      resolve: (d) => { clearTimeout(timer); resolve(d); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    OBS.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
}

function sha256b64(s) {
  return crypto.createHash('sha256').update(s).digest('base64');
}

function obsConnect(url, password) {
  obsDisconnect(true);
  OBS.url = url || state.obs.url;
  state.obs.url = OBS.url;
  OBS.connecting = true;
  OBS.error = null;
  bump();
  pushObs();

  let ws;
  try {
    ws = new WebSocket(OBS.url);
  } catch (err) {
    OBS.connecting = false;
    OBS.error = '地址无效：' + err.message;
    pushObs();
    return;
  }
  OBS.ws = ws;

  ws.on('open', () => { OBS.lastMessageAt = Date.now(); });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    OBS.lastMessageAt = Date.now();

    if (msg.op === 0) { // Hello
      const d = msg.d || {};
      OBS.rpcVersion = d.rpcVersion;
      const identify = { rpcVersion: 1, eventSubscriptions: 0x7ff };
      if (d.authentication) {
        if (!password) {
          OBS.error = 'OBS 要求认证，请填写 WebSocket 密码（OBS → 工具 → WebSocket 服务器设置）';
          ws.close();
          return;
        }
        const { challenge, salt } = d.authentication;
        identify.authentication = sha256b64(sha256b64(password + salt) + challenge);
      }
      ws.send(JSON.stringify({ op: 1, d: identify }));
    } else if (msg.op === 2) { // Identified
      OBS.authed = true;
      OBS.connecting = false;
      OBS.error = null;
      log('OBS 已连接');
      await refreshObs();
      pushObs();
    } else if (msg.op === 7) { // RequestResponse
      const d = msg.d || {};
      const p = OBS.pending.get(d.requestId);
      if (p) {
        OBS.pending.delete(d.requestId);
        const st = d.requestStatus || {};
        if (st.result) p.resolve(d.responseData || {});
        else p.reject(new Error(st.comment || `OBS 请求失败（code ${st.code}）`));
      }
    } else if (msg.op === 5) { // Event
      const d = msg.d || {};
      if (d.eventType === 'CurrentProgramSceneChanged') {
        OBS.scene = d.eventData?.sceneName ?? OBS.scene;
        pushObs();
      } else if (d.eventType === 'StreamStateChanged') {
        OBS.streaming = d.eventData?.outputActive === true;
        OBS.streamState = d.eventData?.outputState || (OBS.streaming ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED');
        if (OBS.streaming) OBS.streamState = 'streaming';
        pushObs();
      } else if (d.eventType === 'SceneListChanged') {
        refreshObs().then(pushObs).catch(() => {});
      }
    }
  });

  ws.on('close', () => {
    const wasAuthed = OBS.authed;
    OBS.authed = false;
    OBS.connecting = false;
    OBS.streaming = false;
    OBS.scene = null;
    OBS.scenes = [];
    OBS.ws = null;
    for (const [, p] of OBS.pending) p.reject(new Error('OBS 连接已断开'));
    OBS.pending.clear();
    if (wasAuthed) log('OBS 连接断开');
    pushObs();
  });

  ws.on('error', (err) => {
    OBS.connecting = false;
    OBS.error = '连接失败：' + err.message + '（请确认 OBS 已启动且 WebSocket 服务器已启用）';
    pushObs();
  });
}

async function refreshObs() {
  try {
    const v = await obsSend('GetVersion');
    OBS.obsVersion = v.obsVersion;
  } catch {}
  try {
    const l = await obsSend('GetSceneList');
    OBS.scenes = (l.scenes || []).map((s) => s.sceneName);
    OBS.scene = l.currentProgramSceneName || OBS.scene;
  } catch {}
  try {
    const s = await obsSend('GetStreamStatus');
    OBS.streaming = !!s.outputActive;
    OBS.streamState = OBS.streaming ? 'streaming' : (s.outputReconnecting ? 'reconnecting' : 'idle');
  } catch {}
}

function obsDisconnect(silent) {
  if (OBS.ws) {
    try { OBS.ws.removeAllListeners(); OBS.ws.close(); } catch {}
  }
  OBS.ws = null;
  OBS.authed = false;
  OBS.connecting = false;
  OBS.streaming = false;
  OBS.scene = null;
  OBS.scenes = [];
  for (const [, p] of OBS.pending) p.reject(new Error('已主动断开'));
  OBS.pending.clear();
  if (!silent) {
    log('OBS 已断开');
    pushObs();
  }
}


/* --------------------------------------------------- OBS 媒体源（8 路信号） */

const SRC_PREFIX = 'SRC-';

function srcNameFor(id) { return SRC_PREFIX + id; }

// ── 模拟源：无真实推流时，给每名选手建一个浏览器源，用于验证建源 / 切人 / 构图 ──
const SIM_PREFIX = 'SIM-';
function simNameFor(id) { return SIM_PREFIX + id; }

function simPage(player) {
  const accent = player.teamId === 'A' ? '#7fcfd2' : '#f0b95a';
  const teamName = (state.teams[player.teamId] || {}).name || '';
  const name = player.nickname || player.id;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SIM ${player.id}</title>
<style>
 html,body{margin:0;height:100%;background:#0b0d10;overflow:hidden;color:#e8edf2;
   font-family:"Microsoft YaHei UI",system-ui,sans-serif}
 .wrap{position:relative;height:100%;display:grid;place-items:center}
 canvas{position:absolute;inset:0;width:100%;height:100%}
 .card{position:relative;text-align:center}
 .id{font-size:13px;letter-spacing:.2em;color:${accent};opacity:.85}
 .nm{font-size:64px;font-weight:600;line-height:1.12;margin-top:8px}
 .tm{margin-top:12px;font-size:15px;letter-spacing:.16em;color:#9aa6b2}
 .badge{position:absolute;left:32px;top:28px;font-size:12px;letter-spacing:.14em;
   color:${accent};border:1px solid ${accent};border-radius:4px;padding:5px 9px}
 .foot{position:absolute;left:32px;bottom:28px;font-size:13px;color:#7c8794;letter-spacing:.1em}
 .tc{position:absolute;right:32px;bottom:28px;font-size:13px;color:#7c8794;
   font-family:Consolas,monospace;font-variant-numeric:tabular-nums}
</style></head><body><div class="wrap"><canvas></canvas>
<div class="card"><div class="id">SIMULATED FEED</div><div class="nm">${name}</div>
<div class="tm">${teamName} · ${player.id}</div></div>
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
  x.strokeStyle='${accent}';x.lineWidth=2;x.beginPath();
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
</script></body></html>`;
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
      try { await obsSend('GetInputSettings', { inputName: nm }); await obsSend('RemoveInput', { inputName: nm }); removed++; } catch (e) {}
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


function allPlayerList() {
  return [...state.teams.A.players, ...state.teams.B.players];
}

async function ensureObsScene(sceneName) {
  const l = await obsSend('GetSceneList');
  if (!(l.scenes || []).some((s) => s.sceneName === sceneName)) {
    await obsSend('CreateScene', { sceneName });
  }
  return sceneName;
}

function mediaSettings(player) {
  return {
    input: 'http://127.0.0.1:' + currentPort + '/stream/' + player.id + '.flv',
    input_format: '',
    is_local_file: false,
    reconnect_delay: 0.5,
    restart_on_activate: false,
    close_when_inactive: false,
    clear_on_media_end: false,
    buffering_mb: 1,
    hw_decode: false,
    input_format: 'flv',
    ffmpeg_options: '-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0',
  };
}

async function ensureObsSource(sceneName, player) {
  const inputName = srcNameFor(player.id);
  const settings = mediaSettings(player);
  let existed = true;
  try {
    await obsSend('GetInputSettings', { inputName });
  } catch {
    existed = false;
  }
  if (!existed) {
    await obsSend('CreateInput', {
      sceneName,
      inputName,
      inputKind: 'ffmpeg_source',
      inputSettings: settings,
      sceneItemEnabled: false,
    });
  } else {
    await obsSend('SetInputSettings', { inputName, inputSettings: settings, overlay: true });
    try {
      await obsSend('GetSceneItemId', { sceneName, sourceName: inputName });
    } catch {
      await obsSend('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: false });
    }
  }
  const idRes = await obsSend('GetSceneItemId', { sceneName, sourceName: inputName });
  try {
    await obsSend('SetSceneItemTransform', {
      sceneName,
      sceneItemId: idRes.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 90,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 5,
        boundsWidth: 1440,
        boundsHeight: 810,
      },
    });
  } catch {}
  return { inputName, sceneItemId: idRes.sceneItemId, url: settings.input, created: !existed, bounds: { x: 0, y: 90, w: 1440, h: 810 } };
}

async function applyObsFocus() {
  if (!OBS.authed) return null;
  const sceneName = state.obs.srcScene || '比赛画面';
  const focus = allPlayerList().find((p) => p.id === state.focusPlayerId);
  const target = focus && focus.room ? srcNameFor(focus.id) : null;
  const targetSim = focus ? simNameFor(focus.id) : null;
  let list;
  try {
    list = await obsSend('GetSceneItemList', { sceneName });
  } catch (e) {
    return { sceneName, error: e.message };
  }
  const items = (list && list.sceneItems) || [];
  const found = items.filter((it) => /^(SRC|SIM)-/.test(String(it.sourceName || '')));
  let changed = 0;
  for (const it of found) {
    const want = it.sourceName === target || it.sourceName === targetSim;
    if (!!it.sceneItemEnabled === want) continue;
    try {
      await obsSend('SetSceneItemEnabled', {
        sceneName,
        sceneItemId: it.sceneItemId,
        sceneItemEnabled: want,
      });
      changed++;
    } catch {}
  }
  OBS.srcSync = { sceneName, target: target || targetSim, changed, at: Date.now() };
  return { sceneName, target, changed, matched: found.length };
}

async function buildObsSources(sceneOverride) {
  const sceneName = String(sceneOverride || state.obs.srcScene || '比赛画面').trim() || '比赛画面';
  state.obs.srcScene = sceneName;
  await ensureObsScene(sceneName);
  const out = [];
  for (const p of allPlayerList()) {
    if (!p.room) {
      out.push({ id: p.id, skipped: '未绑定房间号' });
      continue;
    }
    try {
      out.push({ id: p.id, ...(await ensureObsSource(sceneName, p)) });
    } catch (e) {
      out.push({ id: p.id, error: e.message });
    }
  }
  const sync = await applyObsFocus();
  log('OBS 媒体源已对齐场景「' + sceneName + '」');
  return { sceneName, sources: out, sync };
}

/* -------------------------------------------------------------- WebSocket */

let wss = null;
const clients = new Set();

function log(text) {
  const line = { at: Date.now(), text };
  state.__log = [...(state.__log || []).slice(-39), line];
  for (const c of clients) sendTo(c, { t: 'log', line });
}

function snapshot() {
  return {
    t: 'snapshot',
    version,
    serverTime: Date.now(),
    state: { ...state, timer: timerSnapshot() },
    assets: Object.fromEntries(Object.entries(state.assets).map(([id, a]) => [id, { ...a, url: assetUrl(id), thumbUrl: thumbUrl(id) }])),
    obs: obsStatus(),
  };
}

function sendTo(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast() {
  const snap = snapshot();
  for (const c of clients) sendTo(c, snap);
}

/* --------------------------------------------------------------- 命令处理 */

function applyCommand(type, payload = {}) {
  switch (type) {
    case 'event.set': {
      const e = state.event;
      state.event = {
        name: String(payload.name ?? e.name).slice(0, 80),
        stage: String(payload.stage ?? e.stage).slice(0, 60),
        round: String(payload.round ?? e.round).slice(0, 60),
      };
      return null;
    }
    case 'team.rename': {
      const t = state.teams[payload.teamId];
      if (!t) return '队伍不存在';
      const name = String(payload.name ?? t.name).trim().slice(0, 40);
      if (!name) return '队名不能为空';
      t.name = name;
      return null;
    }
    case 'player.update': {
      const p = findPlayer(payload.playerId);
      if (!p) return '选手不存在';
      const patch = payload.patch || {};
      if (typeof patch.nickname === 'string') {
        const n = patch.nickname.trim().slice(0, 24);
        if (!n) return '选手昵称不能为空';
        p.nickname = n;
      }
      if (typeof patch.note === 'string') p.note = patch.note.slice(0, 120);
      if (typeof patch.alive === 'boolean') p.alive = patch.alive;
      if (patch.signal === 'online' || patch.signal === 'offline') p.signal = patch.signal;
      // 变为 offline 时若正处于焦点，保留焦点但标记不可播；这里不强制切换
      return null;
    }
    case 'player.room': {
      const p = findPlayer(payload.playerId);
      if (!p) return '选手不存在';
      const room = String(payload.room ?? '').trim();
      if (room && !/^\d{3,12}$/.test(room)) return '房间号应为 3–12 位数字';
      if (room !== p.room) {
        streamCache.delete(p.room);
        streamCache.delete(room);
      }
      p.room = room;
      if (room) probeRoom(room);
      applyObsFocus().catch(() => {});
      return null;
    }
    case 'player.avatar': {
      const p = findPlayer(payload.playerId);
      if (!p) return '选手不存在';
      p.avatar = payload.assetId || null;
      return null;
    }
    case 'caster.update': {
      const c = state.casters.find((x) => x.id === payload.casterId);
      if (!c) return '解说不存在';
      const patch = payload.patch || {};
      if (typeof patch.name === 'string') c.name = patch.name.trim().slice(0, 24) || c.name;
      if (typeof patch.role === 'string') c.role = patch.role.slice(0, 24);
      if (patch.avatar !== undefined) c.avatar = patch.avatar || null;
      return null;
    }
    case 'caster.add': {
      if (state.casters.length >= 2) return '最多两名解说';
      state.casters.push({ id: 'c' + crypto.randomBytes(2).toString('hex'), name: '新解说', role: '解说', avatar: null });
      return null;
    }
    case 'caster.remove': {
      if (state.casters.length <= 1) return '至少保留一名解说';
      state.casters = state.casters.filter((c) => c.id !== payload.casterId);
      return null;
    }
    case 'team.focus': {
      if (!teamIds.includes(payload.teamId)) return '队伍不存在';
      state.currentTeam = payload.teamId;
      applyObsFocus().catch(() => {});
      return null;
    }
    case 'player.focus': {
      const p = findPlayer(payload.playerId);
      if (!p) return '选手不存在';
      if (p.signal === 'offline') return `${p.nickname} 处于 Offline，无法切换`;
      state.focusPlayerId = p.id;
      applyObsFocus().catch(() => {});
      return null;
    }
    case 'timer.set': {
      // 正计时模式：手动校正已过时间
      const ms = clampDuration(payload.elapsedMs ?? 0);
      if (ms === null) return '时间无效';
      state.timer = {
        ...state.timer,
        accumulatedMs: ms,
        startedAt: state.timer.phase === 'running' ? Date.now() : null,
      };
      return null;
    }
    case 'theme.set': {
      if (payload.seed !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(String(payload.seed))) return '主题色需为 #RRGGBB';
        state.theme = { ...state.theme, seed: String(payload.seed) };
      }
      if (payload.mode !== undefined) {
        state.theme = { ...state.theme, mode: payload.mode === 'light' ? 'light' : 'dark' };
      }
      return null;
    }
    case 'feed.backdrop': {
      state.feedBackdrop = payload.value === 'transparent' ? 'transparent' : 'black';
      return null;
    }
    case 'timer.cmd':
      return timerCommand(payload.cmd);
    case 'setup.done':
      state.setupDone = true;
      return null;
    case 'bg.set': {
      if (!state.assets[payload.assetId]) return '素材不存在';
      state.background = payload.assetId;
      return null;
    }
    case 'bg.clear':
      state.background = null;
      return null;
    case 'asset.remove': {
      if (!state.assets[payload.assetId]) return '素材不存在';
      if (state.background === payload.assetId) state.background = null;
      for (const p of allPlayers()) if (p.avatar === payload.assetId) p.avatar = null;
      for (const c of state.casters) if (c.avatar === payload.assetId) c.avatar = null;
      delete state.assets[payload.assetId];
      return null;
    }
    case 'obs.config': {
      const url = String(payload.url || '').trim();
      if (!/^wss?:\/\//.test(url)) return 'OBS 地址需以 ws:// 开头';
      state.obs.url = url.slice(0, 120);
      return null;
    }
    case 'obs.connect':
      obsConnect(String(payload.url || state.obs.url).trim(), String(payload.password || ''));
      return null;
    case 'obs.disconnect':
      obsDisconnect();
      return null;
    case 'asset.upload': {
      const kind = payload.kind === 'background' ? 'background' : 'avatar';
      const sha = String(payload.sha256 || '').toLowerCase().slice(0, 64);
      if (sha) {
        const hit = Object.values(state.assets).find((a) => a.sha256 === sha && a.kind === kind);
        if (hit) return { asset: { ...hit, url: assetUrl(hit.id), thumbUrl: thumbUrl(hit.id) }, deduped: true };
      }
      const asset = storeAsset(kind, payload.dataUrl, payload.thumbDataUrl, { w: payload.w, h: payload.h, source: payload.source, name: payload.name, sha256: sha });
      return { asset: { ...asset, url: assetUrl(asset.id), thumbUrl: thumbUrl(asset.id) }, deduped: false };
    }
    case 'lib.dir': {
      const raw = String(payload.path || '').trim();
      if (!raw) {
        state.libDir = null;
        assetsDir = state.libDir ? path.resolve(state.libDir) : path.join(dataDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
        fs.mkdirSync(assetsDir, { recursive: true });
        return { dir: assetsDir };
      }
      const norm = raw;
      if (!path.win32.isAbsolute(norm)) return '素材目录需为绝对路径，例如 D:/卫戍协议素材';
      const dir = path.normalize(norm);
      fs.mkdirSync(dir, { recursive: true });
      const old = path.join(dataDir, 'assets');
      for (const a of Object.values(state.assets)) {
        for (const file of [a.file, a.thumb]) {
          if (!file) continue;
          const src = path.join(old, file);
          const dst = path.join(dir, file);
          if (!fs.existsSync(dst) && fs.existsSync(src)) {
            try { fs.copyFileSync(src, dst); } catch {}
          }
        }
      }
      state.libDir = dir;
      assetsDir = dir;
      log('素材目录 → ' + dir);
      return { dir };
    }
    case 'lib.reveal': {
      try { execFile('explorer.exe', [assetsDir]); } catch {}
      return { dir: assetsDir };
    }
    case 'lib.rename': {
      const a = state.assets[payload.id];
      if (!a) return '素材不存在';
      const nm = String(payload.name || '').trim().slice(0, 80);
      if (!nm) return '名称不能为空';
      a.name = nm;
      return null;
    }
    case 'lib.remove': {
      const id = String(payload.id || '');
      const a = state.assets[id];
      if (!a) return '素材不存在';
      const users = [];
      for (const p of allPlayers()) if (p.avatar === id) users.push(p.nickname);
      for (const c of state.casters) if (c.avatar === id) users.push('解说 · ' + c.name);
      if (state.background === id) users.push('当前背景');
      if (users.length) return '该素材正被使用：' + users.slice(0, 3).join('、') + (users.length > 3 ? ' 等 ' + users.length + ' 处' : '');
      for (const file of [a.file, a.thumb]) {
        if (!file) continue;
        try { fs.unlinkSync(path.join(assetsDir, file)); } catch {}
        try { fs.unlinkSync(path.join(dataDir, 'assets', file)); } catch {}
      }
      delete state.assets[id];
      return null;
    }
    default:
      return '未知命令：' + type;
  }
}

async function handleCommand(ws, type, payload, id) {
  try {
    if (type === 'obs.scene') {
      const scene = String(payload.scene || '');
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      if (!OBS.scenes.includes(scene)) return sendTo(ws, { t: 'error', message: '场景不可用：' + scene });
      await obsSend('SetCurrentProgramScene', { sceneName: scene });
      OBS.scene = scene;
      log('切换场景 → ' + scene);
      return pushObs();
    }
    if (type === 'obs.stream') {
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      if (payload.action === 'start') {
        await obsSend('StartStream');
        OBS.streaming = true;
        OBS.streamState = 'streaming';
        log('开始推流');
      } else if (payload.action === 'stop') {
        await obsSend('StopStream');
        OBS.streaming = false;
        OBS.streamState = 'idle';
        log('停止推流');
      } else {
        return sendTo(ws, { t: 'error', message: '未知推流指令' });
      }
      return pushObs();
    }

    if (type === 'obs.sim') {
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      const r = await buildObsSim(payload.scene, payload.mode === 'remove' ? 'remove' : 'add');
      pushObs();
      return sendTo(ws, { t: 'ack', id, data: r });
    }
    if (type === 'obs.build') {
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      const r = await buildObsSources(payload.scene);
      pushObs();
      return sendTo(ws, { t: 'ack', id, data: r });
    }
    if (type === 'obs.sync') {
      if (!OBS.authed) return sendTo(ws, { t: 'error', message: 'OBS 未连接' });
      const r = await applyObsFocus();
      return sendTo(ws, { t: 'ack', id, data: r });
    }

    const result = applyCommand(type, payload);
    if (typeof result === 'string') {
      sendTo(ws, { t: 'error', message: result });
      sendTo(ws, { t: 'ack', id, data: { error: result } });
      return;
    }
    sendTo(ws, { t: 'ack', id, data: result === undefined ? null : result });
    bump();
    broadcast();
    if (type === 'obs.config' || type === 'asset.upload') pushObs();
  } catch (err) {
    sendTo(ws, { t: 'error', message: err.message || '命令执行失败' });
  }
}

/* ------------------------------------------------------------------ HTTP */

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-cache' });
    const stream = fs.createReadStream(file);
    // 读流失败（asar 内路径异常等）只影响这一个请求，绝不能让异常冒到主进程
    stream.on('error', (e) => {
      log('静态文件读取失败: ' + file + ' :: ' + (e && e.message ? e.message : e));
      try { res.destroy(); } catch {}
    });
    stream.pipe(res);
  });
}

/* ------------------------------------------------- 直播信号：B 站拉流代理
 * OBS 的「媒体源」不能自定义 Referer，而 B 站 CDN 必须带 Referer；
 * 所以由本服务做一层转发：OBS 拉 http://127.0.0.1:PORT/stream/<playerId>.flv，
 * 服务端负责 取地址 / 补 Referer / 到期前断开重连。
 */
const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const streamCache = new Map(); // room -> { url, expiresAt }
const streamStats = new Map(); // playerId -> { bytes, opened, error, since }
const roomLive = new Map(); // room -> { live, title, at }
let currentPort = 7317;

async function resolveBili(room) {
  const api =
    'https://api.live.bilibili.com/xlive/web-room/v1/playUrl/playUrl' +
    `?cid=${room}&platform=web&qn=10000&https_url_req=1&ptype=8`;
  const r = await fetch(api, {
    headers: { 'user-agent': BILI_UA, referer: `https://live.bilibili.com/${room}` },
  });
  const j = await r.json();
  const first = j && j.data && j.data.durl && j.data.durl[0];
  if (!j || j.code !== 0 || !first || !first.url) {
    throw new Error(`房间 ${room} 取流失败（code=${j && j.code}）`);
  }
  const m = String(first.url).match(/expires=(\d+)/);
  const expiresAt = m ? Number(m[1]) * 1000 : Date.now() + 30 * 60 * 1000;
  return { url: first.url, expiresAt };
}

/* 探测房间是否正在直播：用房间信息接口，不需要拉流 */
async function probeRoom(room) {
  if (!room) return null;
  try {
    const r = await fetch(
      `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${room}`,
      { headers: { 'user-agent': BILI_UA, referer: 'https://live.bilibili.com/' } }
    );
    const j = await r.json();
    const d = j && j.data;
    if (!d) throw new Error('房间信息不可用');
    const rec = { live: Number(d.live_status) === 1, title: String(d.title || ''), at: Date.now() };
    roomLive.set(room, rec);
    return rec;
  } catch (e) {
    roomLive.set(room, { live: false, title: '', at: Date.now(), err: e.message });
    return null;
  }
}

async function probeAllRooms() {
  const rooms = [...new Set(allPlayers().map((p) => p.room).filter(Boolean))];
  for (const r of rooms) await probeRoom(r);
}

async function streamUrlFor(room) {
  const c = streamCache.get(room);
  if (c && c.expiresAt - Date.now() > 5 * 60 * 1000) return c;
  const fresh = await resolveBili(room);
  streamCache.set(room, fresh);
  return fresh;
}

function statOf(playerId) {
  let s = streamStats.get(playerId);
  if (!s) {
    s = { bytes: 0, opened: 0, error: null, since: Date.now(), at: Date.now() };
    streamStats.set(playerId, s);
  }
  return s;
}

async function proxyStream(res, player) {
  const st = statOf(player.id);
  st.at = Date.now();
  let reader = null;
  let guard = null;
  try {
    let up = null;
    let expiresAt = 0;
    // CDN 偶发 404（边缘节点切换/签名刚过期），最多重试 3 次，每次强制重新取地址
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        streamCache.delete(player.room);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
      const got = await streamUrlFor(player.room);
      expiresAt = got.expiresAt;
      up = await fetch(got.url, {
        headers: { 'user-agent': BILI_UA, referer: `https://live.bilibili.com/${player.room}` },
      });
      if (up.ok && up.body) break;
      try { if (up.body) up.body.cancel(); } catch {}
      up = null;
    }
    if (!up || !up.body) throw new Error('上游取流失败（已重试 3 次）');
    st.error = null;
    st.opened += 1;
    res.writeHead(200, {
      'content-type': 'video/x-flv',
      'cache-control': 'no-store',
      connection: 'close',
    });
    reader = up.body.getReader();
    let closed = false;
    res.on('close', () => {
      closed = true;
      try { reader.cancel(); } catch {}
    });
    // 地址过期只影响新连接：到期前后台刷新缓存，绝不中断已建立的画面（中途掐断会让 OBS 解码器丢 SPS/PPS 出绿屏）
    const refreshAt = Math.max(30000, expiresAt - Date.now() - 5 * 60 * 1000);
    guard = setTimeout(() => {
      if (closed) return;
      streamCache.delete(player.room);
      streamUrlFor(player.room).catch(() => {});
    }, refreshAt);
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        st.bytes += value.length;
        if (!res.write(Buffer.from(value))) await new Promise((r) => res.once('drain', r));
      }
    }
  } catch (e) {
    st.error = e && e.message ? e.message : String(e);
    try {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('stream error: ' + st.error);
    } catch {}
  } finally {
    if (guard) clearTimeout(guard);
    try { res.end(); } catch {}
  }
}

function streamStatusList() {
  return allPlayers().map((p) => {
    const s = streamStats.get(p.id);
    const c = p.room ? streamCache.get(p.room) : null;
    const lv = p.room ? roomLive.get(p.room) : null;
    return {
      playerId: p.id,
      room: p.room || '',
      bytes: s ? s.bytes : 0,
      opened: s ? s.opened : 0,
      error: s ? s.error : null,
      active: !!(s && s.opened > 0 && s.at && Date.now() - s.at < 60000 && !s.error),
      roomLive: lv ? !!lv.live : null,
      title: lv && lv.title ? lv.title : '',
      checkedAt: lv ? lv.at : null,
      expiresIn: c ? Math.max(0, Math.round((c.expiresAt - Date.now()) / 1000)) : null,
    };
  });
}

function createHttp(staticDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/media/')) {
      const name = path.basename(p);
      if (!/^[a-z0-9_]+\.(png|jpg|jpeg|webp|gif)$/i.test(name)) {
        res.writeHead(400); res.end('bad asset'); return;
      }
      const primary = path.join(assetsDir, name);
      if (fs.existsSync(primary)) return serveFile(res, primary);
      return serveFile(res, path.join(dataDir, 'assets', name));
    }

    if (p === '/' || p === '/index.html') return serveFile(res, path.join(staticDir, 'index.html'));
    if (p === '/overlay' || p === '/overlay.html') return serveFile(res, path.join(staticDir, 'overlay.html'));
    if (p === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version, clients: clients.size }));
      return;
    }

    // 直播信号：给 OBS 拉流用，形如 /stream/A1.flv
    // 模拟画面：给 8 名选手各提供一个浏览器源页面
    const mSim = p.startsWith('/sim/') ? ['/sim/', p.slice(5)] : null;
    if (mSim) {
      const pl = findPlayer(mSim[1]);
      if (!pl) { res.writeHead(404); res.end('no player'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(simPage(pl));
      return;
    }

    const mStream = p.match(/^\/stream\/([A-Za-z0-9_-]+)\.flv$/);
    if (mStream) {
      const player = findPlayer(mStream[1]);
      if (!player) { res.writeHead(404); res.end('no player'); return; }
      if (!player.room) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('该选手未绑定房间号'); return; }
      proxyStream(res, player);
      return;
    }

    if (p === '/api/streams') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, port: currentPort, streams: streamStatusList() }));
      return;
    }
    const file = path.join(staticDir, path.normalize(p).replace(/^(\.\.[\\/])+/, ''));
    if (!file.startsWith(staticDir)) { res.writeHead(403); res.end('forbidden'); return; }
    serveFile(res, file);
  });
}

/* ------------------------------------------------------------------ 启动 */

export async function startServer(opts = {}) {
  const port = Number(opts.port || process.env.PORT || 7317);
  currentPort = port;
  const staticDir = opts.staticDir || path.join(HERE, '..', 'dist');
  dataDir = opts.dataDir || path.join(HERE, '..', 'data');
  assetsDir = path.join(dataDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  loadState();
  // 房间在线状态：启动时探一次，之后每 30 秒刷新
  probeAllRooms();
  const probeTimer = setInterval(() => { probeAllRooms(); }, 30000);
  if (probeTimer.unref) probeTimer.unref();

  const server = createHttp(staticDir);
  wss = new WebSocketServer({ server, path: '/ws' });
  // 端口被占用时 ws 会在这里 emit 'error'；没有监听器会直接让进程崩溃
  wss.on('error', (err) => log('WebSocket 服务错误: ' + (err && err.message ? err.message : err)));

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.t === 'hello') return sendTo(ws, snapshot());
      if (msg.t === 'cmd' && typeof msg.type === 'string') return handleCommand(ws, msg.type, msg.payload, msg.id);
    });
    sendTo(ws, snapshot());
  });

  try {
    await new Promise((resolve, reject) => {
      const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
      const onListening = () => { server.removeListener('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  } catch (err) {
    // 端口占用等失败：先清掉本次创建的 server / wss，避免残留的 error 事件把进程打崩
    try { wss.close(); } catch {}
    try { server.on('error', () => {}); server.close(); } catch {}
    throw err;
  }

  const actual = server.address().port;
  const url = `http://127.0.0.1:${actual}/`;
  log('服务已启动');
  return { server, wss, port: actual, url, overlayUrl: url + 'overlay.html' };
}

export function stopServer() {
  saveNow();
  try { wss?.close(); } catch {}
  try { obsDisconnect(true); } catch {}
}


/* 直接运行时（开发 / npm start） */
const invokedDirectly = !!(process.argv[1] && /server.(mjs|cjs)$/.test(process.argv[1]));
if (invokedDirectly) {
  (async () => {
    const r = await startServer({ port: process.env.PORT || 7317 });
    console.log('  控制台      ' + r.url);
    console.log('  直播叠加层  ' + r.overlayUrl);
    console.log('  OBS 浏览器源请填 ' + r.overlayUrl + '（1920x1080）');
    if (process.argv.includes('--open')) {
      const { spawn } = await import('node:child_process');
      spawn('cmd', ['/c', 'start', '', r.url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    const shutdown = () => { stopServer(); process.exit(0); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })().catch((e) => { console.error(e); process.exit(1); });
}
