import { WebSocket } from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7317/ws');
let snap = null; const errs = [];
const send = (type, payload = {}, id) => ws.send(JSON.stringify({ t: 'cmd', type, payload, id }));
ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'snapshot') snap = m; if (m.t === 'error') errs.push(m.message); });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (c, label, extra='') => console.log((c ? 'PASS ' : 'FAIL ') + label + (extra ? ' :: ' + extra : ''));
await new Promise(r => ws.on('open', r));
await wait(300);
const st = () => snap.state;
ok(st().teams.A.players.length === 4 && st().teams.B.players.length === 4, '两队各 4 名选手');
ok(st().players === undefined, '无遗留双队紧凑字段');

send('team.focus', { teamId: 'B' }); await wait(150);
ok(st().currentTeam === 'B', '切换队伍 → B', st().currentTeam);

send('player.focus', { playerId: 'B2' }); await wait(150);
ok(st().focusPlayerId === 'B2', '切换焦点 → B2', st().focusPlayerId);

const before = errs.length;
send('player.focus', { playerId: 'A4' }); await wait(200);
ok(errs.length > before, 'Offline 选手拒绝切换', errs[errs.length-1] || '');
ok(st().focusPlayerId === 'B2', 'Offline 被拒后焦点不变');

send('player.update', { playerId: 'B2', patch: { alive: false } }); await wait(150);
ok(st().teams.B.players[1].alive === false, '存活状态可独立修改');
send('player.update', { playerId: 'B2', patch: { alive: true } }); await wait(100);

send('timer.set', { durationMs: 90000 }); await wait(120);
send('timer.cmd', { cmd: 'start' }); await wait(200);
const t1 = st().timer;
ok(t1.phase === 'running' && t1.endsAt > Date.now(), '计时启动并带结束时间戳');
const v1 = snap.version;
await wait(1200);
ok(snap.state.timer.remainingMs < t1.remainingMs, '剩余时间递减（服务端换算）', `${t1.remainingMs}→${snap.state.timer.remainingMs}`);
ok(snap.version >= v1, '版本号单调');

send('timer.cmd', { cmd: 'pause' }); await wait(200);
const paused = st().timer.remainingMs;
ok(st().timer.phase === 'paused' && paused > 0, '暂停保存剩余时间', String(paused));
await wait(800);
ok(Math.abs(st().timer.remainingMs - paused) < 50, '暂停期间不流逝');
send('timer.cmd', { cmd: 'resume' }); await wait(300);
ok(st().timer.phase === 'running' && st().timer.endsAt > Date.now(), '继续恢复计时');
send('timer.cmd', { cmd: 'reset' }); await wait(200);
ok(st().timer.phase === 'idle' && st().timer.remainingMs === 90000, '重置回到设定时长');

send('event.set', { stage: '季后赛 · 决赛' }); await wait(120);
ok(st().event.stage === '季后赛 · 决赛', '赛事信息更新');
send('event.set', { stage: '季后赛 · 半决赛' }); await wait(100);
console.log('DONE', snap.version);
ws.close();
