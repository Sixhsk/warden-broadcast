import WebSocket from 'ws';
import fs from 'node:fs';

const PORT = Number(process.env.PORT) || 7418;
const CDP = 'http://127.0.0.1:9333';
const URL = `http://127.0.0.1:${PORT}/?settings=1`;

const j = async (path, method = 'GET') => (await fetch(CDP + path, { method })).json();
const target = await j('/json/new?' + encodeURIComponent(URL), 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });

let id = 0;
const pending = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => ws.on('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1020, deviceScaleFactor: 1, mobile: false });
await sleep(3200);

const clickText = (txt) => `(() => {
  const els = [...document.querySelectorAll('button, md-text-button, md-filled-button, md-outlined-button, md-filled-tonal-button, md-primary-tab, md-filter-chip')];
  const hit = els.find((b) => (b.textContent || '').trim() === ${JSON.stringify(txt)});
  if (!hit) return 'miss:' + ${JSON.stringify(txt)};
  hit.click(); return 'ok';
})()`;

console.log('open settings:', await ev(clickText('画面与素材')));
await sleep(900);
console.log('open picker:', await ev(`(() => { window.dispatchEvent(new CustomEvent('wb-picker', { detail: { kind: 'avatar', title: '选择头像', onPick: () => {} } })); return document.querySelector('.pickmask') ? 'ok' : 'miss'; })()`));
await sleep(900);

const probe = await ev(`(() => {
  const mask = document.querySelector('.pickmask');
  const sheet = document.querySelector('.picksheet');
  if (!mask) return { picker: false };
  const r = sheet ? sheet.getBoundingClientRect() : null;
  const cx = r ? Math.round(r.left + r.width / 2) : 840;
  const cy = r ? Math.round(r.top + r.height / 2) : 500;
  const top = document.elementFromPoint(cx, cy);
  return {
    picker: true,
    maskZ: getComputedStyle(mask).zIndex,
    sheetZ: sheet ? getComputedStyle(sheet).zIndex : null,
    topInsideSheet: !!(top && sheet && sheet.contains(top)),
    topTag: top ? top.tagName.toLowerCase() + '.' + (top.className || '') : null,
    cells: document.querySelectorAll('.picksheet .libcell, .picksheet .pickcell').length,
    rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
  };
})()`);
console.log('probe:', JSON.stringify(probe));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('D:/AI Working/app/zcheck-picker.png', Buffer.from(shot.result.data, 'base64'));
console.log('shot -> zcheck-picker.png');
ws.close();
fetch(CDP + '/json/close/' + target.id).catch(() => {});
process.exit(0);