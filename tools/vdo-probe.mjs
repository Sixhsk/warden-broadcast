// Probe the current CDP page state (url/title/video readiness).
import { WebSocket } from 'ws';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const list = await (await fetch(`${CDP}/json/list`)).json();
console.log('targets:', list.filter(t => t.type === 'page').map(t => `${t.title} :: ${t.url}`).join('\n  '));
const page = list.find(t => t.type === 'page');
if (!page) process.exit(0);

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 32 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));
let id = 0; const pending = new Map();
ws.on('message', (data) => {
  const m = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

const expr = `(() => {
  const vs = [...document.querySelectorAll('video')];
  return JSON.stringify({
    href: location.href,
    title: document.title,
    videos: vs.map(v => ({ id: v.id, cls: v.className, ready: v.readyState, w: v.videoWidth, h: v.videoHeight, paused: v.paused, src: (v.srcObject ? 'MediaStream' : (v.src || '').slice(0, 60)) })),
    bodyText: (document.body ? document.body.innerText : '').slice(0, 300)
  });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
console.log(JSON.stringify(r.result, null, 2).slice(0, 2000));
ws.close();