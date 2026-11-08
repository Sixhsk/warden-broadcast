// Click the START / join button on a VDO.Ninja publisher page, then report state.
import { WebSocket } from 'ws';

const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find(t => t.type === 'page' && t.url.includes('vdo.ninja'));
if (!page) { console.error('no vdo page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 32 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));
let id = 0; const pending = new Map();
ws.on('message', (data) => {
  const m = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  return r.result?.result?.value;
};

const clicked = await evalJs(`(() => {
  const cands = [...document.querySelectorAll('button, .button, div[role=button], a')];
  const hit = cands.find(el => /^\\s*(START|GO LIVE|Join Room with Screenshare|Join Room with Camera)\\s*$/i.test(el.innerText || ''));
  if (!hit) return 'not-found:' + cands.map(c => (c.innerText||'').trim()).filter(Boolean).slice(0, 12).join('|');
  hit.click();
  return 'clicked:' + (hit.innerText || '').trim();
})()`);
console.log(clicked);
await new Promise(r => setTimeout(r, 7000));
console.log('after:', await evalJs(`JSON.stringify({ vids: [...document.querySelectorAll('video')].map(v=>v.readyState+':'+v.videoWidth+'x'+v.videoHeight), text: document.body.innerText.replace(/\\s+/g,' ').slice(0,100) })`));
ws.close();