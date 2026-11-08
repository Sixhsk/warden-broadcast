import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7412/ws');
ws.on('message', b => { const m = JSON.parse(b); if (m.t === 'snapshot') { const p = {}; for (const t of ['A','B']) p[t] = m.state.teams[t].players.map(x => `${x.id}:${JSON.stringify(x.nickname)}`); console.log(JSON.stringify(p)); ws.close(); process.exit(0);} });
