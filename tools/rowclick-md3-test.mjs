import WebSocket from 'ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

const created = await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent('http://127.0.0.1:7412/'), { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', (b) => { const m = JSON.parse(b); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
  return r.result?.result?.value;
};
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1020, deviceScaleFactor: 1, mobile: false });
await sleep(2600);

const rows = await ev(`document.querySelectorAll('.frow').length`);
check('渲染出 4 个选手行', rows === 4, `rows=${rows}`);

const focusIdx = () => ev(`[...document.querySelectorAll('.frow')].findIndex((el) => el.classList.contains('on'))`);
const before = await focusIdx();
check('存在当前焦点行', before >= 0, `index=${before}`);

const target = before === 2 ? 0 : 2;
await ev(`(() => { const el = document.querySelectorAll('.frow')[${target}]; const b = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + 6, clientY: b.top + 6 })); })()`);
await sleep(400);
const after = await focusIdx();
check('点卡片空白处即切换焦点', after === target, `${before} -> ${after}`);

const aliveSel = () => ev(`(() => { const r = document.querySelectorAll('.frow')[${target}];
  const btns = [...r.querySelectorAll('md-outlined-segmented-button')];
  return btns.slice(0, 2).map((b) => b.selected); })()`);
const sel0 = await aliveSel();
const clickIdx = sel0[0] ? 1 : 0;
// MD3 分组按钮只在内部 <button> 上响应真实指针事件，用 CDP 输入真实点一下
const box = await ev(`(() => { const r = document.querySelectorAll('.frow')[${target}];
  const b = [...r.querySelectorAll('md-outlined-segmented-button')][${clickIdx}].getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
await clickAt(box.x, box.y);
await sleep(500);
const focusAfterSeg = await focusIdx();
check('点状态开关不改变聚焦行', focusAfterSeg === target, `${target} -> ${focusAfterSeg}`);
const sel1 = await aliveSel();
check('存活 / 已淘汰 真的翻转', sel0[0] !== sel1[0], `${JSON.stringify(sel0)} -> ${JSON.stringify(sel1)}`);
check('两组状态互斥（各只有一个选中）', sel1[0] !== sel1[1], JSON.stringify(sel1));

// 还原
await ev(`(() => { const r = document.querySelectorAll('.frow')[${target}];
  const btns = [...r.querySelectorAll('md-outlined-segmented-button')];
  btns[${sel1[0] ? 1 : 0}].click(); })()`);

const offRow = await ev(`(() => { const r = [...document.querySelectorAll('.frow')];
  const off = r.find((el) => el.classList.contains('off'));
  return off ? { cls: off.className, cursor: getComputedStyle(off).cursor } : null; })()`);
if (!offRow) { console.log("SKIP  Offline 行变暗且不可点  — 当前没有 Offline 选手"); } else { check("Offline 行变暗且不可点", offRow.cursor === "not-allowed", JSON.stringify(offRow)); }

console.log(`\n${pass} passed, ${fail} failed`);
ws.close();
process.exit(fail ? 1 : 0);
