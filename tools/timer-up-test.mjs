import WebSocket from 'ws';

const port = process.env.PORT || 7411;

function conn() {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const box = { ws, snap: null };
    ws.on('message', (buf) => {
      const m = JSON.parse(buf.toString());
      if (m.t === 'snapshot') {
        box.snap = m;
        // 服务端只广播状态变化，运行中的已过时间由客户端按 startedAt 自行推算
        box.offset = (m.serverTime || Date.now()) - Date.now();
        if (!box.ready) { box.ready = true; res(box); }
      }
      if (m.t === 'error') {
        box.lastError = m.message;
        console.log('   server error:', m.message);
      }
    });
    ws.on('error', rej);
  });
}

let seq = 0;
// 服务端只对返回对象的命令回 ack，其余为「执行 + 广播」，因此这里发完即走，靠快照轮询验收
function send(box, type, payload = {}) {
  box.ws.send(JSON.stringify({ t: 'cmd', type, payload, id: 'c' + ++seq }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(box, pred, ms = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (box.snap && pred(box.snap.state)) return true;
    await sleep(50);
  }
  return false;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const T = (box) => box.snap.state.timer;
// 与服务端 elapsedOf 同算法：累计 + (服务端当前时刻 - 本轮开始时刻)
const elapsed = (box) => {
  const t = T(box);
  const now = Date.now() + (box.offset || 0);
  const acc = Math.max(0, t.accumulatedMs || 0);
  return t.phase === 'running' && typeof t.startedAt === 'number' ? acc + Math.max(0, now - t.startedAt) : acc;
};

const box = await conn();
console.log('connected, phase =', T(box).phase);

send(box, 'timer.cmd', { cmd: 'reset' });
await waitFor(box, (s) => s.timer.elapsedMs === 0 && s.timer.phase === 'idle');
check('归零', elapsed(box) === 0, `${elapsed(box)}ms / ${T(box).phase}`);

send(box, 'timer.cmd', { cmd: 'start' });
await sleep(1600);
const e1 = elapsed(box);
check('开始后正向累计', e1 > 1200 && e1 < 3000, `elapsed=${e1}ms`);
check('phase=running', T(box).phase === 'running');

send(box, 'timer.cmd', { cmd: 'pause' });
await waitFor(box, (s) => s.timer.phase === 'paused');
await sleep(100);
const p1 = elapsed(box);
await sleep(1300);
const p2 = elapsed(box);
check('暂停后冻结', Math.abs(p2 - p1) < 60, `${p1} -> ${p2}`);
check('phase=paused', T(box).phase === 'paused');

send(box, 'timer.cmd', { cmd: 'resume' });
await waitFor(box, (s) => s.timer.phase === 'running');
await sleep(1200);
const r1 = elapsed(box);
check('继续后接续累计', r1 > p1 + 800 && r1 < p1 + 2400, `${p1} -> ${r1}`);

send(box, 'timer.cmd', { cmd: 'reset' });
await waitFor(box, (s) => s.timer.elapsedMs === 0);
check('再次归零', elapsed(box) === 0 && T(box).phase === 'idle', `${T(box).phase}`);

send(box, 'feed.backdrop', { value: 'transparent' });
await waitFor(box, (s) => s.feedBackdrop === 'transparent');
check('画面底色切透明', box.snap.state.feedBackdrop === 'transparent');
send(box, 'feed.backdrop', { value: 'black' });
await waitFor(box, (s) => s.feedBackdrop === 'black');
check('画面底色切纯黑', box.snap.state.feedBackdrop === 'black');

const keys = Object.keys(T(box));
check('字段已换成正计时', !keys.includes('durationMs') && !keys.includes('endsAt') && keys.includes('startedAt'), keys.join(','));

// 重连后仍一致（服务端权威）
const before = elapsed(box);
box.ws.close();
const box2 = await conn();
check('重连后状态一致', Math.abs(elapsed(box2) - before) < 1500, `${Math.round(before)} -> ${Math.round(elapsed(box2))}`);

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} PASS`);
box2.ws.close();
process.exit(bad ? 1 : 0);