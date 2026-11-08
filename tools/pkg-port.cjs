const { startServer, stopServer } = require('D:/AI Working/app/.asarx/dist-server/server.cjs');
const dataDir = 'D:/AI Working/app/data-pkgtest';
const ok = (c, l, e = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (e ? ' :: ' + e : ''));
(async () => {
  const a = await startServer({ port: 7401, dataDir });
  ok(a.port === 7401, '包内服务启动 7401');
  let code = '';
  try { await startServer({ port: 7401, dataDir }); } catch (e) { code = e.code || String(e); }
  ok(code === 'EADDRINUSE', '同端口被拒且进程未崩溃', code);
  const b = await startServer({ port: 7402, dataDir });
  ok(b.port === 7402, '自动回退 7402 成功');
  const h = await (await fetch('http://127.0.0.1:7402/api/health')).json();
  ok(h.ok === true, '回退实例可访问');
  stopServer(); setTimeout(() => process.exit(0), 200);
})();
