import WebSocket from 'ws';
const created = await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent('http://127.0.0.1:7412/?settings=1')}`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', b => { const m = JSON.parse(b); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description) : r.result?.result?.value; };
await new Promise(r => setTimeout(r, 2600));
console.log(await ev(`(() => {
  const f = document.querySelector('md-outlined-text-field.nick');
  const chain = [];
  let n = f;
  while (n && chain.length < 5) { const cs = getComputedStyle(n); chain.push({ tag: n.tagName.toLowerCase(), cls: n.className && n.className.toString ? n.className.toString() : '', h: cs.height, display: cs.display, flex: cs.flex, align: cs.alignItems }); n = n.parentElement; }
  return JSON.stringify(chain);
})()`));
ws.close();
