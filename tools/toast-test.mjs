import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9333';
const URL = process.env.PAGE || 'http://127.0.0.1:5173/';

const j = async (p, m = 'GET') => (await fetch(CDP + p, { method: m })).json();
const t = await j('/json/new?' + encodeURIComponent(URL), 'PUT');
const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
let id = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => ws.on('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1020, deviceScaleFactor: 1, mobile: false });
await sleep(4000);

console.log('页面标题:', await ev('document.title'));
const fired = await ev(`(async () => {
  const m = await import('/src/lib/store.ts');
  if (!m.pushError) return 'no pushError export';
  m.pushError('测试错误：参数不合法（5 秒后应自动消失）');
  return 'fired';
})()`);
console.log('注入错误:', fired);

await sleep(400);
const shown = await ev(`(() => { const el = document.querySelector('.toast'); return el ? { text: el.querySelector('.toast-text')?.textContent, hasX: !!el.querySelector('.toast-x') } : null; })()`);
console.log('0.4s 时:', JSON.stringify(shown));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:/AI Working/app/toast-check.png', Buffer.from(shot.result.data, 'base64'));

await sleep(5400);
const after = await ev(`document.querySelector('.toast') ? 'STILL_VISIBLE' : 'GONE'`);
console.log('5.8s 时:', after);

// 再验证点击关闭
await ev(`(async () => { const m = await import('/src/lib/store.ts'); m.pushError('第二条：点击 X 应立即关闭'); })()`);
await sleep(500);
const clickRes = await ev(`(() => { const x = document.querySelector('.toast-x'); if (!x) return 'no-button'; x.click(); return 'clicked'; })()`);
await sleep(300);
const closed = await ev(`document.querySelector('.toast') ? 'STILL_VISIBLE' : 'GONE'`);
console.log('点击关闭:', clickRes, '→', closed);
ws.close();
process.exit(0);