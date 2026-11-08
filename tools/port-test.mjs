import { startServer, stopServer } from '../server/server.mjs';
import path from 'node:path';
const dataDir = path.join(process.cwd(), 'data-porttest');
const ok = (c, l, e = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (e ? ' :: ' + e : ''));
const a = await startServer({ port: 7317, dataDir });
ok(a.port === 7317, '首个实例占用 7317');
let code = '';
try { await startServer({ port: 7317, dataDir }); } catch (e) { code = e.code || String(e); }
ok(code === 'EADDRINUSE', '同端口启动被拒且不崩溃', code);
const b = await startServer({ port: 7318, dataDir });
ok(b.port === 7318, '回退到 7318 成功', String(b.url));
const health = await (await fetch('http://127.0.0.1:7318/api/health')).json();
ok(health.ok === true, '7318 服务可访问');
stopServer(); await new Promise((r) => setTimeout(r, 300));
process.exit(0);
