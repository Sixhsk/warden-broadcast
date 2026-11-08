const fs=require('fs');const p='server/server.mjs';
const lines=fs.readFileSync(p,'utf8').split('\n');
if(lines.some(l=>l.includes('mSim'))){console.log('already');process.exit(0)}
const i=lines.findIndex(l=>l.trim().startsWith('const mStream = p.match('));
if(i<0){console.log('anchor not found');process.exit(1)}
const block=[
"    // 模拟画面：给 8 名选手各提供一个浏览器源页面",
"    const mSim = p.match(/^\/sim\/([A-Za-z0-9_-]+)$/);",
"    if (mSim) {",
"      const pl = findPlayer(mSim[1]);",
"      if (!pl) { res.writeHead(404); res.end('no player'); return; }",
"      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });",
"      res.end(simPage(pl));",
"      return;",
"    }",
""
];
lines.splice(i,0,...block);
fs.writeFileSync(p,lines.join('\n'));
console.log('route inserted at line',i);
