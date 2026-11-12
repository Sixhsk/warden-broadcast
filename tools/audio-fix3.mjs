import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const pw = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/obs-studio/plugin_config/obs-websocket/config.json`, 'utf8')).server_password || '';
const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');
const ws = new WebSocket('ws://127.0.0.1:4455', { perMessageDeflate: false });
let id = 0; const pending = new Map(); const out = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.op === 0) { const a = m.d.authentication || {}; ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: b64(b64(pw + (a.salt || '')) + (a.challenge || '')) } })); return; }
  if (m.op === 2) { ready(); return; }
  if (m.op === 7 && pending.has(m.d.requestId)) { pending.get(m.d.requestId)(m.d); pending.delete(m.d.requestId); }
});
const req = (t, d = {}) => new Promise((r) => { const rid = 'y' + ++id; pending.set(rid, r); ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: rid, requestData: d } })); setTimeout(() => { if (pending.has(rid)) { pending.delete(rid); r({ requestStatus: { result: false, comment: 'timeout' } }); } }, 6000); });
const ok = (r) => !!(r && r.requestStatus && r.requestStatus.result);

async function ready() {
  // 保证只有 AUD-DESKTOP 这一路在采桌面
  out.push('静音 桌面音频(重复采集): ' + (ok(await req('SetInputMute', { inputName: '桌面音频', inputMuted: true })) ? 'ok' : 'fail'));
  out.push('AUD-DESKTOP 取消静音: ' + (ok(await req('SetInputMute', { inputName: 'AUD-DESKTOP', inputMuted: false })) ? 'ok' : 'fail'));
  const mon = await req('GetInputAudioMonitorType', { inputName: 'AUD-DESKTOP' });
  out.push('AUD-DESKTOP 监视: ' + (mon.responseData ? mon.responseData.monitorType : '未知'));
  const vol = await req('GetInputVolume', { inputName: 'AUD-DESKTOP' });
  if (vol.responseData) out.push(`AUD-DESKTOP 音量: ${vol.responseData.inputVolumeDb.toFixed(1)} dB`);
  for (const n of ['SRC-A1', 'SRC-A2', 'SRC-B1']) {
    const m = await req('GetInputAudioMonitorType', { inputName: n });
    out.push(`${n} 监视: ` + (m.responseData ? m.responseData.monitorType : '未知'));
  }
  console.log(out.join('\n'));
  ws.close(); process.exit(0);
}
ws.on('error', (e) => { console.log('WS错误', e.message); process.exit(1); });
setTimeout(() => { console.log('超时'); process.exit(1); }, 40000);