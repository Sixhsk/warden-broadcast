// 验证：焦点切换只换画面，所有选手媒体源恒为静音（声音只走 AUD-DESKTOP）
import { WebSocket } from 'ws';
const SRV = process.env.SRV || 'ws://127.0.0.1:7419/ws';
const MOCK = process.env.MOCK || 'http://127.0.0.1:4461';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(SRV);
let id = 0;
const call = (type, payload = {}) => new Promise((res) => {
  const i = ++id;
  const h = (d) => { const m = JSON.parse(d); if (m.t === 'ack' && m.id === i) { ws.off('message', h); res(m.data); } };
  ws.on('message', h); ws.send(JSON.stringify({ t: 'cmd', type, payload, id: i }));
  setTimeout(() => res(null), 5000);
});
await new Promise((r) => ws.on('open', r));
await sleep(300);
await call('obs.config', { url: 'ws://127.0.0.1:4461', password: 'pw' });
await sleep(800);
const conn = await call('obs.connect', { url: 'ws://127.0.0.1:4461', password: 'pw' });
await sleep(1200);
console.log('obs.connect:', JSON.stringify(conn)?.slice(0, 120));
const built = await call('obs.build', { scene: '比赛画面' });
console.log('obs.build:', JSON.stringify(built)?.slice(0, 160));
await sleep(900);
for (const pid of ['A1', 'B2', 'A3']) {
  await call('team.focus', { teamId: pid[0] });
  await call('player.focus', { playerId: pid });
  await sleep(700);
  const st = await (await fetch(MOCK + '/state')).json();
  const muted = Object.entries(st.inputs).filter(([n]) => /^(SRC|SIM)-/.test(n)).map(([n, v]) => n + '=' + (v.muted ? 'muted' : 'UNMUTED'));
  const anyUnmuted = muted.some((s) => s.includes('UNMUTED'));
  console.log(`focus=${pid}  ${muted.join(' ')}  → ${anyUnmuted ? 'FAIL(有源出声)' : 'PASS(全部静音)'}`);
}
ws.close(); process.exit(0);
