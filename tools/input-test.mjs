import WebSocket from 'ws';
const CDP = 'http://127.0.0.1:9333';
const page = process.argv[2] || 'http://127.0.0.1:7412/?settings=1';
const created = await fetch(`${CDP}/json/new?${encodeURIComponent(page)}`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = new Map();
ws.on('message', b => { const m = JSON.parse(b); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id);} });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);

console.log(await ev(`(async () => {
  const fields = [...document.querySelectorAll('md-outlined-text-field')];
  if (!fields.length) return 'NO_FIELDS ' + document.body.innerHTML.slice(0,120);
  const f = fields[0];
  const set = v => { f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); };
  f.focus();
  set('');
  for (const ch of 'xing') { set(f.value + ch); await new Promise(r => setTimeout(r, 70)); }
  const afterType = f.value;
  await new Promise(r => setTimeout(r, 800));
  const afterEcho = f.value;
  f.blur();
  await new Promise(r => setTimeout(r, 800));
  return JSON.stringify({ count: fields.length, afterType, afterEcho, afterBlur: f.value });
})()`));
ws.close();
