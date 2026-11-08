import WebSocket from 'ws';
const [type, json] = process.argv.slice(2);
const ws = new WebSocket('ws://127.0.0.1:7412/ws');
ws.on('open', () => ws.send(JSON.stringify({ t: 'cmd', type, payload: JSON.parse(json || '{}'), id: 1 })));
ws.on('message', b => { const m = JSON.parse(b); if (m.t === 'ack' || m.t === 'error') { console.log(JSON.stringify(m).slice(0, 300)); ws.close(); } });
setTimeout(() => { console.log('no-ack (void cmd)'); process.exit(0); }, 1500);
