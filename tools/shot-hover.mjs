import WebSocket from 'ws';
import fs from 'node:fs';

const CDP = 'http://127.0.0.1:9333';
const PAGE = 'http://127.0.0.1:7412/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
const page = list.find((t) => t.type === 'page' && t.url.includes('7412'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

let id = 0;
const pending = new Map();
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1020, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: PAGE });
await sleep(2600);

// 让第 3 张卡片处于 hover 态
const box = (await send('Runtime.evaluate', {
  expression: `(() => { const r = document.querySelectorAll('.frow')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  returnByValue: true,
})).result.result.value;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
await sleep(350);

const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1680, height: 1020, scale: 1 } });
fs.writeFileSync('shot-rowhover.png', Buffer.from(shot.result.data, 'base64'));
console.log('saved shot-rowhover.png');
ws.close();
process.exit(0);