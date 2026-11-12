import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const pw = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/obs-studio/plugin_config/obs-websocket/config.json`, 'utf8')).server_password || '';
const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

const ws = new WebSocket('ws://127.0.0.1:4455', { perMessageDeflate: false });
let id = 0; const pending = new Map(); const log = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.op === 0) {
    const a = m.d.authentication || {};
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: b64(b64(pw + (a.salt || '')) + (a.challenge || '')) } }));
    return;
  }
  if (m.op === 2) { ready(); return; }
  if (m.op === 7 && pending.has(m.d.requestId)) { pending.get(m.d.requestId)(m.d); pending.delete(m.d.requestId); }
});
const req = (requestType, requestData = {}) => new Promise((resolve) => {
  const requestId = 'x' + ++id; pending.set(requestId, resolve);
  ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); resolve({ requestStatus: { result: false, comment: 'timeout' } }); } }, 6000);
});
const ok = (r) => !!(r && r.requestStatus && r.requestStatus.result);
const why = (r) => ok(r) ? 'ok' : JSON.stringify(r.requestStatus);

async function ready() {
  const inputs = (await req('GetInputList')).responseData.inputs.map((i) => ({ n: i.inputName, k: i.inputKind }));

  // 1) 去掉刚建的重复桌面源
  if (inputs.some((i) => i.n === 'AUD-DESKTOP')) {
    log.push('删除重复源 AUD-DESKTOP → ' + why(await req('RemoveInput', { inputName: 'AUD-DESKTOP' })));
  }
  // 2) 复用 OBS 自带的“桌面音频”，改名纳入白名单
  if (inputs.some((i) => i.n === '桌面音频')) {
    log.push('桌面音频 → AUD-DESKTOP: ' + why(await req('SetInputName', { inputName: '桌面音频', newInputName: 'AUD-DESKTOP' })));
  }
  log.push('AUD-DESKTOP 监视类型: ' + why(await req('SetInputAudioMonitorType', { inputName: 'AUD-DESKTOP', monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' })));
  log.push('AUD-DESKTOP 取消静音: ' + why(await req('SetInputMute', { inputName: 'AUD-DESKTOP', inputMuted: false })));

  // 3) 重复/无关源静音
  for (const n of ['媒体源', '浏览器', '浏览器 2', '麦克风/Aux']) {
    if (inputs.some((i) => i.n === n)) log.push(`静音 ${n}: ` + why(await req('SetInputMute', { inputName: n, inputMuted: true })));
  }

  // 4) 全局监视设备回读
  const g1 = await req('GetProfileParameter', { parameterCategory: 'Audio', parameterName: 'MonitoringDeviceId' });
  const g2 = await req('GetProfileParameter', { parameterCategory: 'Audio', parameterName: 'MonitoringDeviceName' });
  log.push('监视设备ID: ' + (g1.responseData ? g1.responseData.parameterValue : why(g1)));
  log.push('监视设备名: ' + (g2.responseData ? g2.responseData.parameterValue : why(g2)));

  // 5) 汇总
  const after = (await req('GetInputList')).responseData.inputs.map((i) => i.inputName);
  log.push('输入源: ' + after.join(' / '));
  const mutes = [];
  for (const n of after) {
    const r = await req('GetInputMute', { inputName: n });
    if (r.responseData) mutes.push(`${n}=${r.responseData.inputMuted ? 'muted' : 'unmuted'}`);
  }
  log.push('静音状态: ' + mutes.join(', '));
  console.log(log.join('\n'));
  ws.close(); process.exit(0);
}
ws.on('error', (e) => { console.log('WS错误', e.message); process.exit(1); });
setTimeout(() => { console.log('超时'); process.exit(1); }, 60000);