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
  const tabs = document.querySelector('.mtabs');
  const act = document.querySelector('.modal-actions');
  const btn = act?.querySelector('md-filled-button, md-text-button, button');
  const rect = el => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) } : null;
  const seg = [...document.querySelectorAll('md-outlined-segmented-button')].slice(0,4).map(b => ({ label: b.label, sel: b.selected, disabled: b.disabled }));
  return JSON.stringify({ tabs: rect(tabs), tabsCS: tabs ? getComputedStyle(tabs).height : null, act: rect(act), btn: rect(btn), btnTag: btn?.tagName, btnCS: btn ? { w: getComputedStyle(btn).width, minW: getComputedStyle(btn).minWidth, flex: getComputedStyle(btn).flex } : null, seg });
})()`));
ws.close();
