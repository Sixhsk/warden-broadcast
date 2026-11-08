// 验证：obs.build 建 8 路媒体源 → 切焦点时场景项显隐跟随
const { WebSocket } = require('ws');

const SRV = process.env.SRV || 'ws://127.0.0.1:7414/ws';
const MOCK = process.env.MOCK || 'http://127.0.0.1:4461/state';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const ck = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('PASS', name, extra); } else { fail++; console.log('FAIL', name, extra); }
};

(async () => {
  const ws = new WebSocket(SRV);
  const acks = new Map();
  let seq = 0;
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'ack' && acks.has(m.id)) { acks.get(m.id)(m); acks.delete(m.id); }
    if (m.t === 'error' && acks.has('e')) { acks.get('e')(m); acks.delete('e'); }
  });
  await new Promise((r) => ws.once('open', r));
  const cmd = (type, payload = {}) =>
    new Promise((resolve) => {
      const id = 't' + ++seq;
      acks.set(id, resolve);
      ws.send(JSON.stringify({ t: 'cmd', type, payload, id }));
      setTimeout(() => { if (acks.has(id)) { acks.delete(id); resolve({ timeout: true }); } }, 8000);
    });

  await cmd('obs.config', { url: 'ws://127.0.0.1:4460' });
  const ids = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
  for (let i = 0; i < ids.length; i++) await cmd('player.room', { playerId: ids[i], room: String(19000000 + i) });
  const conn = await cmd('obs.connect', { url: 'ws://127.0.0.1:4460', password: 'pw' });
  await sleep(1200);
  const obs = await (await fetch('http://127.0.0.1:7414/api/health')).json();
  ck('服务健康', obs.ok === true);

  let again0 = null;
  const built = await cmd('obs.build', { scene: '比赛画面' });
  const data = built.data || {};
  const made = (data.sources || []).filter((s) => s.inputName);
  ck('obs.build 返回 8 路源', made.length === 8, `got ${made.length}`);
  ck('场景名回传', data.sceneName === '比赛画面', data.sceneName || '');
  const urls = made.map((s) => s.url || '');
  ck('URL 指向本地代理', urls.every((u) => /127\.0\.0\.1:\d+\/stream\/[AB]\d\.flv$/.test(u)), urls[0] || '');

  let st = await (await fetch(MOCK)).json();
  const items = st.enabled['比赛画面'] || [];
  ck('场景内 8 个场景项', items.length === 8, `got ${items.length}`);
  ck('初始仅焦点源可见', items.filter((i) => i.on).length <= 1, items.filter((i) => i.on).map((i) => i.sourceName).join(','));

  const b0 = (again0 = made[0] || {}).bounds || {};
  ck('画面框在游戏区 0,90 1440x810', b0.x === 0 && b0.y === 90 && b0.w === 1440 && b0.h === 810, JSON.stringify(b0));

  const focusA1 = await cmd('player.focus', { playerId: 'A1' });
  await sleep(600);
  st = await (await fetch(MOCK)).json();
  let on = (st.enabled['比赛画面'] || []).filter((i) => i.on).map((i) => i.sourceName);
  ck('焦点 A1 → 只开 SRC-A1', on.length === 1 && on[0] === 'SRC-A1', on.join(',') || 'none');

  await cmd('team.focus', { teamId: 'B' });
  await cmd('player.focus', { playerId: 'B2' });
  await sleep(600);
  st = await (await fetch(MOCK)).json();
  on = (st.enabled['比赛画面'] || []).filter((i) => i.on).map((i) => i.sourceName);
  ck('切到 B2 → 只开 SRC-B2', on.length === 1 && on[0] === 'SRC-B2', on.join(',') || 'none');

  const again = await cmd('obs.build', { scene: '比赛画面' });
  const againMade = (again.data?.sources || []).filter((s) => s.inputName);
  ck('重复执行不重复建源', againMade.filter((s) => s.created).length === 0, JSON.stringify(againMade.map((s) => s.created)));
  st = await (await fetch(MOCK)).json();
  ck('重复执行后仍是 8 项', (st.enabled['比赛画面'] || []).length === 8, String((st.enabled['比赛画面'] || []).length));

  // 未绑定房间号的选手不应被创建
  const inputs = Object.keys(st.inputs || {});
  ck('仅已绑定房间的选手有源', inputs.length === 8, inputs.join(','));

  ws.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();