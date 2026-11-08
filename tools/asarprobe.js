const fs = require('fs');
const p = 'D:/AI Working/app/release/win-unpacked/resources/app.asar';
const out = [];
try { out.push('root: ' + fs.readdirSync(p).join(', ')); } catch (e) { out.push('root ERR ' + e.message); }
try { out.push('dist: ' + fs.readdirSync(p + '/dist').join(', ')); } catch (e) { out.push('dist ERR ' + e.message); }
const idx = p + '/dist/index.html';
out.push('exists(index): ' + fs.existsSync(idx));
try { out.push('stat size: ' + fs.statSync(idx).size); } catch (e) { out.push('stat ERR ' + e.message); }
try {
  const b = fs.readFileSync(idx);
  out.push('read ok bytes: ' + b.length + ' head: ' + b.slice(0, 60).toString().replace(/\s+/g, ' '));
} catch (e) { out.push('read ERR ' + e.message); }
fs.writeFileSync('D:/AI Working/app/.asarprobe.txt', out.join('\n'), 'utf8');
process.exit(0);