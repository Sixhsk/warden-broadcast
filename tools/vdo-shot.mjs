// Capture a VDO.Ninja view page and report the local timestamp bracket around the capture.
// usage: node tools/vdo-shot.mjs <url> <outPng> <w> <h> [waitMs]
import { WebSocket } from 'ws';
import fs from 'node:fs';

const [, , url, out, w = '1440', h = '810', waitMs = '2600'] = process.argv;
if (!url || !out) { console.error('usage: node tools/vdo-shot.mjs <url> <out.png> <w> <h> [waitMs]'); process.exit(2); }

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));

let id = 0; const pending = new Map();
ws.on('message', (data) => {
  const m = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
  if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, +waitMs));

const before = Date.now();
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const after = Date.now();
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ out, tBefore: before, tAfter: after, tMid: Math.round((before + after) / 2), bracketMs: after - before }));
ws.close();