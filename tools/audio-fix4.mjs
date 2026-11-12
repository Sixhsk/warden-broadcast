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
const req = (t, d = {}) => new Promise((r) => { const rid = 'z' + ++id; pending.set(rid, r); ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: rid, requestData: d } })); setTimeout(() => { if (pending.has(rid)) { pending.delete(rid); r({ requestStatus: { result: false, comment: 'timeout' } }); } }, 6000); });
const ok = (r) => !!(r && r.requestStatus && r.requestStatus.result);
const names = async () => (await req('GetInputList')).responseData.inputs.map((i) => i.inputName);

async function ready() {
  let list = await names();
  out.push('当前输入源: ' + list.join(' / '));

  if (!list.includes('AUD-DESKTOP')) {
    const src = list.includes('桌面音频') ? '桌面音频' : (await (async () => {
      const r = await req('CreateInput', { sceneName: '比赛画面', inputName: 'AUD-BOOT', inputKind: 'wasapi_output_capture', inputSettings: { device_id: 'default' }, sceneItemEnabled: true });
      return ok(r) ? 'AUD-BOOT' : null;
    })());
    if (src) {
      const r = await req('SetInputName', { inputName: src, newInputName: 'AUD-DESKTOP' });
      out.push(`改名 ${src} → AUD-DESKTOP: ` + (ok(r) ? 'ok' : JSON.stringify(r.requestStatus)));
    }
  }

  out.push('取消静音: ' + (ok(await req('SetInputMute', { inputName: 'AUD-DESKTOP', inputMuted: false })) ? 'ok' : 'fail'));
  out.push('设监视: ' + (ok(await req('SetInputAudioMonitorType', { inputName: 'AUD-DESKTOP', monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' })) ? 'ok' : 'fail'));

  const mu = await req('GetInputMute', { inputName: 'AUD-DESKTOP' });
  const mo = await req('GetInputAudioMonitorType', { inputName: 'AUD-DESKTOP' });
  const vol = await req('GetInputVolume', { inputName: 'AUD-DESKTOP' });
  out.push('回读-AUD-DESKTOP: ' + JSON.stringify({
    muted: mu.responseData?.inputMuted, monitor: mo.responseData?.monitorType,
    db: vol.responseData ? Number(vol.responseData.inputVolumeDb.toFixed(1)) : null,
  }));

  list = await names();
  out.push('最终输入源: ' + list.join(' / '));

  // 焦点源：暂定 A1 出声，其余静音（导播台接管后会自动同步）
  for (const n of list.filter((x) => /^(SRC|SIM)-/.test(x))) {
    await req('SetInputMute', { inputName: n, inputMuted: n !== 'SRC-A1' });
  }
  const st = [];
  for (const n of list.filter((x) => /^(SRC|SIM)-|^AUD-/.test(x))) {
    const m = await req('GetInputMute', { inputName: n });
    st.push(`${n}=${m.responseData?.inputMuted ? 'muted' : 'UNMUTED'}`);
  }
  out.push('音频状态: ' + st.join(', '));
  console.log(out.join('\n'));
  ws.close(); process.exit(0);
}
ws.on('error', (e) => { console.log('WS错误', e.message); process.exit(1); });
setTimeout(() => { console.log('超时'); process.exit(1); }, 40000);