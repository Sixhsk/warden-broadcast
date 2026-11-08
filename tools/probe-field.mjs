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
  if (!f) return 'no nick field';
  const inner = f.shadowRoot?.querySelector('input');
  const cs = inner ? getComputedStyle(inner) : null;
  const fs = getComputedStyle(f);
  return JSON.stringify({
    hostValue: f.value, innerValue: inner?.value,
    innerColor: cs?.color, innerFontSize: cs?.fontSize, innerOpacity: cs?.opacity,
    hostOpacity: fs.opacity, hostDisplay: fs.display, hostH: fs.height,
    label: f.label, disabled: f.disabled,
    valueAttr: f.getAttribute('value')
  });
})()`));
ws.close();
