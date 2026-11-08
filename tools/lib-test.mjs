import WebSocket from 'ws';
const PORT = Number(process.env.PORT) || 7414;
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
let id = 0; const pending = new Map(); let snap = null;
const send = (type, payload) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej });
  ws.send(JSON.stringify({ t: 'cmd', type, payload, id: i }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 8000);
});
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'snapshot') snap = m;
  if (m.t === 'ack' && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.res(m.data); }
  if (m.t === 'error') console.log('ERR:', m.message);
});
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const results = [];
const msgOf = (r) => (r && typeof r === 'object' && r.error) ? r.error : r;
const check = (name, cond) => { results.push([name, !!cond]); };
ws.on('open', async () => {
  await new Promise((r) => setTimeout(r, 300));
  const a = await send('asset.upload', { kind: 'avatar', dataUrl: png, thumbDataUrl: png, w: 1, h: 1, name: 'test.png', sha256: 'abc123' });
  check('upload 返回 asset', a?.asset?.id);
  check('第一次 deduped=false', a?.deduped === false);
  const b = await send('asset.upload', { kind: 'avatar', dataUrl: png, thumbDataUrl: png, w: 1, h: 1, name: 'test2.png', sha256: 'abc123' });
  check('同 sha 去重', b?.deduped === true && b.asset.id === a.asset.id);
  const c = await send('asset.upload', { kind: 'background', dataUrl: png, thumbDataUrl: png, w: 1, h: 1, name: 'bg.png', sha256: 'abc123' });
  check('不同 kind 不去重', c?.deduped === false && c.asset.id !== a.asset.id);
  await send('lib.rename', { id: a.asset.id, name: '夜航星-头像' });
  const s1 = snap.state.assets; // 快照会随后更新
  check('重命名写入', msgOf(await send('lib.rename', { id: a.asset.id, name: '夜航星' })) === null);
  await send('player.avatar', { playerId: 'A1', assetId: a.asset.id });
  const r1 = msgOf(await send('lib.remove', { id: a.asset.id }));
  check('被引用时拒绝删除', typeof r1 === 'string' && r1.includes('正被使用'));
  await send('player.avatar', { playerId: 'A1', assetId: null });
  const r2 = msgOf(await send('lib.remove', { id: a.asset.id }));
  check('解除引用后可删', r2 === null);
  const bad = msgOf(await send('lib.dir', { path: 'relative/path' }));
  check('相对路径被拒', typeof bad === 'string');
  const okdir = await send('lib.dir', { path: 'D:/AI Working/app/.libtest' });
  check('绝对路径生效', okdir && okdir.dir && okdir.dir.includes('.libtest'));
  const a2 = await send('asset.upload', { kind: 'avatar', dataUrl: png, thumbDataUrl: png, w: 1, h: 1, name: 'inlib.png', sha256: 'zzz' });
  check('新素材落到自定义目录', !!a2?.asset?.id);
  await send('lib.remove', { id: c.asset.id });
  await send('lib.dir', { path: '' });
  console.log(results.map(([n, ok]) => `${ok ? 'PASS' : 'FAIL'} ${n}`).join('\n'));
  console.log(`${results.filter(([, o]) => o).length}/${results.length} passed`);
  process.exit(results.every(([, o]) => o) ? 0 : 1);
});
