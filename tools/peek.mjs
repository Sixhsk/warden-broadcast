import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7412/ws');
const t = setTimeout(() => { console.log('timeout'); process.exit(1); }, 4000);
ws.on('message', b => { const m = JSON.parse(b); if (m.t === 'snapshot') { console.log(JSON.stringify({ event: m.state.event, theme: m.state.theme, currentTeam: m.state.currentTeam })); clearTimeout(t); ws.close(); } });
