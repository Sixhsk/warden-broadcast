// Try several VDO.Ninja viewer URL variants and report whether the join menu still shows.
import { WebSocket } from 'ws';

const ID = process.argv[2] || 'WBTEST9';
const variants = [
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay`,
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay&viewonly`,
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay&solo`,
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay&autostart`,
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay&start`,
  `view=${ID}&room=WARDEN&cleanoutput&noheader&autoplay&view=1`,
];

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find(t => t.type === 'page' && !t.url.includes('chrome-extension'));
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
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });

for (const q of variants) {
  const url = `https://vdo.ninja/?${q}`;
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 6000));
  const info = await evalJs(`JSON.stringify({ menu: document.body.innerText.includes('Join Room'), vids: [...document.querySelectorAll('video')].map(v=>v.readyState+':'+v.videoWidth), text: document.body.innerText.replace(/\\s+/g,' ').slice(0,70) })`);
  console.log(q, '=>', info);
}
ws.close();