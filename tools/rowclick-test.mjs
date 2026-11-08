import WebSocket from 'ws';

const CDP = 'http://127.0.0.1:9333';
const PAGE = 'http://127.0.0.1:7412/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// 新建标签页（Chrome 111+ 用 PUT）
const created = await fetch(`${CDP}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

let id = 0;
const pending = new Map();
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((res) => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await sleep(2500);

const rows = await evalJs(`document.querySelectorAll('.frow').length`);
check('渲染出 4 个选手卡片', rows === 4, `rows=${rows}`);

const before = await evalJs(`(() => {
  const r = [...document.querySelectorAll('.frow')];
  return r.findIndex((el) => el.classList.contains('on'));
})()`);
check('已有当前焦点行', before >= 0, `index=${before}`);

// 点第 3 行卡片空白处（不是名字、不是开关）
const target = before === 2 ? 0 : 2;
await evalJs(`(() => {
  const el = document.querySelectorAll('.frow')[${target}];
  const box = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + 6, clientY: box.top + 6 }));
})()`);
await sleep(400);

const after = await evalJs(`(() => {
  const r = [...document.querySelectorAll('.frow')];
  return r.findIndex((el) => el.classList.contains('on'));
})()`);
check('点卡片空白处即切换焦点', after === target, `${before} -> ${after} (target ${target})`);

// 点状态开关：不应改变焦点
const beforeSeg = after;
const deadBefore = await evalJs(`document.querySelectorAll('.frow')[${target}].querySelector('.seg button:nth-child(2)').className`);
// 点"没被选中"的那一侧，确保状态真的翻转
const clickIdx = deadBefore.includes('on') ? 1 : 2;
await evalJs(`document.querySelectorAll('.frow')[${target}].querySelector('.seg button:nth-child(${clickIdx})').click()`);
await sleep(400);
const afterSeg = await evalJs(`(() => {
  const r = [...document.querySelectorAll('.frow')];
  return r.findIndex((el) => el.classList.contains('on'));
})()`);
check('点「已淘汰」不切换焦点', afterSeg === beforeSeg, `${beforeSeg} -> ${afterSeg}`);

const deadAfter = await evalJs(`document.querySelectorAll('.frow')[${target}].querySelector('.seg button:nth-child(2)').className`);
const flipped = await evalJs(`(() => {
  const b = document.querySelectorAll('.frow')[${target}].querySelectorAll('.seg')[0].querySelectorAll('button');
  return [b[0].className.includes('on'), b[1].className.includes('on')];
})()`);
check('存活 / 已淘汰 状态真的翻转', flipped[0] !== flipped[1], `存活=${flipped[0]} 已淘汰=${flipped[1]}`);

// 点第二组开关（在线/Offline）也不应切换焦点，且该行变暗
await evalJs(`document.querySelectorAll('.frow')[${target}].querySelectorAll('.seg')[1].querySelectorAll('button')[1].click()`);
await sleep(400);
const offNow = await evalJs(`document.querySelectorAll('.frow')[${target}].classList.contains('off')`);
const focusNow = await evalJs(`[...document.querySelectorAll('.frow')].findIndex((el) => el.classList.contains('on'))`);
check('切 Offline 后整行变暗', offNow === true);
check('切 Offline 后焦点保持', focusNow === beforeSeg, `${beforeSeg} -> ${focusNow}`);

// 再点这张已 Offline 的卡片：不应切换焦点（也切不了）
const offlineIdx = target;
const otherRow = [0, 1, 2, 3].find((k) => k !== offlineIdx);
await evalJs(`document.querySelectorAll('.frow')[${otherRow}].click()`);
await sleep(400);
const otherIdx = [0, 1, 2, 3].find((k) => k !== offlineIdx);
await evalJs(`document.querySelectorAll('.frow')[${offlineIdx}].click()`);
await sleep(400);
const focusAfterOfflineClick = await evalJs(`[...document.querySelectorAll('.frow')].findIndex((el) => el.classList.contains('on'))`);
check('点 Offline 卡片焦点不转移', focusAfterOfflineClick === otherRow, `期望 ${otherRow}，实际 ${focusAfterOfflineClick}`);

// 恢复状态，避免影响后续
await evalJs(`document.querySelectorAll('.frow')[${target}].querySelectorAll('.seg')[1].querySelectorAll('button')[0].click()`);
await sleep(200);

const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} PASS`);
ws.close();
process.exit(bad ? 1 : 0);