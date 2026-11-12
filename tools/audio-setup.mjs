import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const cfgPath = `${process.env.APPDATA}/obs-studio/plugin_config/obs-websocket/config.json`;
const pw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).server_password || '';
const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

const CABLE_ID = '{c822fb96-ed43-4f05-8634-39fa509aaec6}';
const CABLE_NAME = 'CABLE Input (VB-Audio Virtual Cable)';

const ws = new WebSocket('ws://127.0.0.1:4455', { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const log = [];

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.op === 0) {
    const { challenge, salt } = m.d.authentication && m.d.authentication.authentication === undefined ? m.d.authentication : {};
    const auth = b64(b64(pw + (m.d.authentication?.salt || '')) + (m.d.authentication?.challenge || ''));
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: auth } }));
    return;
  }
  if (m.op === 2) { ready(); return; }
  if (m.op === 7 && pending.has(m.d.requestId)) {
    pending.get(m.d.requestId)(m.d);
    pending.delete(m.d.requestId);
  }
});

const req = (requestType, requestData = {}) => new Promise((resolve) => {
  const requestId = 'r' + ++id;
  pending.set(requestId, resolve);
  ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); resolve({ requestStatus: { result: false, comment: 'timeout' } }); } }, 6000);
});

const ok = (r) => !!(r && r.requestStatus && r.requestStatus.result);

async function ready() {
  const scenes = await req('GetSceneList');
  const names = (scenes.responseData?.scenes || []).map((s) => s.sceneName);
  const scene = scenes.responseData?.currentProgramSceneName || names[0];
  log.push(`场景: ${names.join(' / ')} | 当前: ${scene}`);

  const inputs = await req('GetInputList');
  const list = (inputs.responseData?.inputs || []).map((i) => i.inputName);
  log.push(`现有输入源: ${list.join(' / ')}`);

  // 1) 桌面音频源
  if (!list.includes('AUD-DESKTOP')) {
    const r = await req('CreateInput', {
      sceneName: scene, inputName: 'AUD-DESKTOP', inputKind: 'wasapi_output_capture',
      inputSettings: { device_id: 'default' }, sceneItemEnabled: true,
    });
    log.push(`创建 AUD-DESKTOP: ${ok(r) ? '成功' : JSON.stringify(r.requestStatus)}`);
  } else {
    log.push('AUD-DESKTOP 已存在');
  }

  // 2) 媒体源：只保留焦点那路不静音（此处先全部静音，焦点由导播台接管）
  const media = list.concat(['AUD-DESKTOP']).filter((n) => /^(SRC|SIM)-/.test(n));
  for (const n of media) {
    const r = await req('SetInputMute', { inputName: n, inputMuted: true });
    if (!ok(r)) log.push(`静音 ${n} 失败: ${JSON.stringify(r.requestStatus)}`);
  }
  log.push(`已静音 ${media.length} 路选手源（焦点状态由导播台同步）`);

  // 3) 监视类型
  const setMon = async (n, type, label) => {
    const r = await req('SetInputAudioMonitorType', { inputName: n, monitorType: type });
    log.push(`${label} ${n} → ${type}: ${ok(r) ? 'ok' : JSON.stringify(r.requestStatus)}`);
  };
  await setMon('AUD-DESKTOP', 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', '桌面音频');
  for (const n of media) await setMon(n, 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', '选手源');

  // 4) 全局监视设备指向 CABLE Input
  const p1 = await req('SetProfileParameter', { parameterCategory: 'Audio', parameterName: 'MonitoringDeviceId', parameterValue: CABLE_ID });
  const p2 = await req('SetProfileParameter', { parameterCategory: 'Audio', parameterName: 'MonitoringDeviceName', parameterValue: CABLE_NAME });
  log.push(`监视设备ID → ${ok(p1) ? 'ok' : JSON.stringify(p1.requestStatus)}`);
  log.push(`监视设备名 → ${ok(p2) ? 'ok' : JSON.stringify(p2.requestStatus)}`);

  // 5) 读回确认
  const mon = await req('GetInputAudioMonitorType', { inputName: 'AUD-DESKTOP' });
  log.push(`回读 AUD-DESKTOP 监视类型: ${JSON.stringify(mon.responseData || mon.requestStatus)}`);

  console.log(log.join('\n'));
  ws.close();
  process.exit(0);
}

ws.on('error', (e) => { console.log('WS错误', e.message); process.exit(1); });
setTimeout(() => { console.log('超时'); process.exit(1); }, 60000);