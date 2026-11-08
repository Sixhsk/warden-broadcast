import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7412/ws');
ws.on('message', b => { const m = JSON.parse(b); if (m.t === 'snapshot') {
  const out = {}; for (const t of ['A','B']) out[t] = m.state.teams[t].players.map(p => `${p.id}:${p.alive?'A':'D'}/${p.signal}`);
  console.log(JSON.stringify(out)); ws.close(); process.exit(0); } });
