import { WebSocket } from 'ws';
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const cdp = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (m, p = {}) => { const my = ++id; cdp.send(JSON.stringify({ id: my, method: m, params: p })); return new Promise((r) => { const h = (d) => { const j = JSON.parse(d); if (j.id === my) { cdp.off('message', h); r(j.result); } }; cdp.on('message', h); }); };
await new Promise((r) => cdp.on('open', r));
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:7317/overlay.html' });
await new Promise((r) => setTimeout(r, 3500));
const read = async () => (await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result.value;

const app = new WebSocket('ws://127.0.0.1:7317/ws');
await new Promise((r) => app.on('open', r));
const go = (type, payload = {}) => app.send(JSON.stringify({ t: 'cmd', type, payload }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, l, e = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (e ? ' :: ' + e : ''));

go('team.focus', { teamId: 'B' }); go('player.focus', { playerId: 'B1' }); await wait(500);
go('player.update', { playerId: 'B1', patch: { nickname: '热更新测试' } }); await wait(700);
let txt = await read();
ok(txt.includes('热更新测试'), '改名后叠加层无需刷新同步', txt.includes('热更新测试') ? '' : txt.slice(0, 120));

go('team.rename', { teamId: 'B', name: '临时队名' }); await wait(600);
txt = await read();
ok(txt.includes('临时队名'), '改队名即时同步');

go('timer.cmd', { cmd: 'start' }); await wait(900);
txt = await read();
ok(/\d{2}:\d{2}:\d{2}/.test(txt), '计时运行中显示');
go('timer.cmd', { cmd: 'pause' }); await wait(400);
const t1 = await read(); await wait(800); const t2 = await read();
ok(t1 === t2, '暂停后叠加层时间冻结');

go('player.update', { playerId: 'B1', patch: { nickname: '逆潮' } });
go('team.rename', { teamId: 'B', name: '赤砂工坊' });
go('timer.cmd', { cmd: 'reset' });
await wait(400);
console.log('live-sync done');
cdp.close(); app.close();
process.exit(0);
