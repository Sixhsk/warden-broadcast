// 连接 mock OBS → 打开设置 OBS 页 → 点「生成/更新 8 路媒体源」→ 截图 + 读 mock 状态
const fs = require('fs');
const { WebSocket } = require('ws');

const SRV = 'ws://127.0.0.1:7414/ws';
const CDP = 'http://127.0.0.1:9333/json/list';
const OUT = 'D:/AI Working/app/obs-sources.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) 先通过服务端连上 mock OBS
  const ws = new WebSocket(SRV);
  await new Promise((r) => ws.once('open', r));
  const send = (type, payload = {}) => ws.send(JSON.stringify({ t: 'cmd', type, payload, id: 'x' + Math.random() }));
  send('obs.config', { url: 'ws://127.0.0.1:4460' });
  send('obs.connect', { url: 'ws://127.0.0.1:4460', password: 'pw' });
  await sleep(1500);

  // 2) 打开控制台设置页
  const list = await (await fetch(CDP)).json();
  const page = list.find((t) => t.type === 'page');
  const cdp = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdp.once('open', r));
  let id = 0;
  const pend = new Map();
  cdp.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const call = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await call('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1020, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:7414/?settings=1' });
  await sleep(4000);
  const okTab = await ev(`(()=>{const t=[...document.querySelectorAll('md-primary-tab')].find(e=>e.textContent.includes('OBS'));if(!t)return 'no';t.click();return 'ok'})()`);
  await sleep(1500);
  const clicked = await ev(`(()=>{const b=[...document.querySelectorAll('md-filled-button')].find(e=>e.textContent.includes('生成'));if(!b)return 'no-btn';b.click();return 'ok'})()`);
  await sleep(2500);
  const msg = await ev(`(()=>{const s=[...document.querySelectorAll('.hint')].map(e=>e.textContent).filter(t=>t.includes('已就绪')||t.includes('正在创建'));return s.join(' | ')})()`);
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('tab:', okTab, 'build click:', clicked);
  console.log('msg:', msg);
  ws.close();
  cdp.close();
})();