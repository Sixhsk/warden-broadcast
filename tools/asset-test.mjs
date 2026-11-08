import { WebSocket } from 'ws';
import zlib from 'node:zlib';

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    let crc = 0xffffffff;
    for (const b of td) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const cb = Buffer.alloc(4); cb.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const ws = new WebSocket('ws://127.0.0.1:7317/ws');
let snap = null; const acks = new Map(); let seq = 0;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'snapshot') snap = m; if (m.t === 'ack') acks.get(m.id)?.(m.data); });
const cmd = (type, payload = {}) => new Promise((res) => { const id = 't' + ++seq; acks.set(id, res); ws.send(JSON.stringify({ t: 'cmd', type, payload, id })); });
const go = (type, payload = {}) => ws.send(JSON.stringify({ t: 'cmd', type, payload }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, l, e = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (e ? ' :: ' + e : ''));
await new Promise((r) => ws.on('open', r)); await wait(300);

const bgPng = png(192, 108, [30, 60, 90]);
const bgUrl = 'data:image/png;base64,' + bgPng.toString('base64');
const up = await cmd('asset.upload', { kind: 'background', dataUrl: bgUrl, thumbDataUrl: bgUrl, w: 192, h: 108, source: 'protocol-test' });
ok(!!up?.asset?.id, '背景素材入库', up?.asset?.id);
const assetId = up.asset.id;
const media = await fetch('http://127.0.0.1:7317' + up.asset.url);
ok(media.status === 200 && media.headers.get('content-type') === 'image/png', '素材可通过 /media 访问', up.asset.url + ' ' + media.status);
ok(up.asset.thumbUrl && up.asset.thumbUrl.startsWith('/media/'), '生成缩略图', up.asset.thumbUrl);

go('bg.set', { assetId }); await wait(250);
ok(snap.state.background === assetId, '背景已挂到 state');
go('bg.clear'); await wait(200);
ok(snap.state.background === null, '可恢复默认背景');

const up2 = await cmd('asset.upload', { kind: 'avatar', dataUrl: bgUrl, thumbDataUrl: bgUrl, w: 192, h: 108 });
go('player.avatar', { playerId: 'A1', assetId: up2.asset.id }); await wait(250);
ok(snap.state.teams.A.players[0].avatar === up2.asset.id, '选手头像绑定');
ok(snap.assets[up2.asset.id].url.startsWith('/media/'), '头像 URL 正常');

go('player.update', { playerId: 'A1', patch: { nickname: '测试改名' } }); await wait(250);
ok(snap.state.teams.A.players[0].nickname === '测试改名', '昵称热更新');
go('player.update', { playerId: 'A1', patch: { nickname: '夜航星' } });
go('player.avatar', { playerId: 'A1', assetId: null });
await wait(200);
console.log('done');process.exit(0);
ws.close();
