// Grab the current video frame from a VDO viewer page via canvas, save it, and bracket the capture time.
// usage: node tools/vdo-frame.mjs <outPng> [w] [h]
import { WebSocket } from 'ws';
import fs from 'node:fs';

const [, , out = 'frame.png', w = 1280, h = 720] = process.argv;
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const list = await (await fetch(`${CDP}/json/list`)).json();
const want = process.env.VDO_ID || '';
let page = list.find(t => t.type === 'page' && t.url.includes('vdo.ninja') && (!want || t.url.includes(want)));
if (!page) page = list.find(t => t.type === 'page' && t.url.includes('vdo.ninja'));
console.log('using page:', page && page.url);
if (!page) { console.error('no vdo viewer page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));
let id = 0; const pending = new Map();
ws.on('message', (data) => {
  const m = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

// find the largest playing video and draw it to a canvas at requested size
const prep = await evalJs(`(() => {
  const vs = [...document.querySelectorAll('video')].filter(v => v.videoWidth > 0);
  if (!vs.length) return 'no-video';
  const v = vs.sort((a,b) => b.videoWidth*b.videoHeight - a.videoWidth*a.videoHeight)[0];
  const c = document.createElement('canvas');
  c.width = ${+w}; c.height = ${+h};
  c.id = '__grab';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:999999;width:${+w}px;height:${+h}px;background:#000';
  document.body.appendChild(c);
  v.muted = true; v.play().catch(()=>{});
  const g = c.getContext('2d');
  window.__grabLoop = setInterval(() => {
    try { g.drawImage(v, 0, 0, c.width, c.height); } catch (e) {}
  }, 33);
  return JSON.stringify({ src: v.videoWidth + 'x' + v.videoHeight, ready: v.readyState });
})()`);
console.log('prep:', prep);
if (prep === 'no-video') { ws.close(); process.exit(0); }

await new Promise(r => setTimeout(r, 2500));
console.log('ctime:', await evalJs("(()=>{const v=[...document.querySelectorAll('video')].filter(x=>x.videoWidth>0)[0];return v?v.currentTime.toFixed(2)+' paused='+v.paused:''})()"));
const before = Date.now();
const url = await evalJs(`document.getElementById('__grab').toDataURL('image/png')`);
const after = Date.now();
if (typeof url === 'string' && url.startsWith('data:image/png')) {
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ out, tBefore: before, tAfter: after, tMid: Math.round((before + after) / 2), bracketMs: after - before }));
} else {
  console.log('grab failed:', url);
}
ws.close();