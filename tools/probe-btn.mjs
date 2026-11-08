import WebSocket from 'ws';
const created = await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent('http://127.0.0.1:7412/?settings=1'), { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', b => { const m = JSON.parse(b); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description) : r.result?.result?.value; };
await new Promise(r => setTimeout(r, 2800));
console.log(await ev(`(() => {
  const b = document.querySelector('.modal-actions md-filled-button');
  const cs = getComputedStyle(b);
  const sh = b.shadowRoot;
  const label = sh?.querySelector('.label, .button .label, span.label');
  return JSON.stringify({
    whiteSpace: cs.whiteSpace, display: cs.display, width: cs.width,
    scrollW: b.scrollWidth, clientW: b.clientWidth,
    hasShadow: !!sh, styleCount: sh ? sh.adoptedStyleSheets.length : 0,
    parts: sh ? [...sh.querySelectorAll('*')].slice(0,8).map(e => e.tagName + '.' + e.className) : null,
    innerText: b.textContent
  });
})()`));
ws.close();
