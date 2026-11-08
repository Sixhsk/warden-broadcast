// 仅用于本地联调：模拟 obs-websocket 5.x 认证与常用请求，不接触真实 OBS
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
const PORT = Number(process.env.MOCK_OBS_PORT || 4460);
const PASSWORD = process.env.MOCK_OBS_PASSWORD || 'testpass';
const SALT = crypto.randomBytes(16).toString('base64');
const CHALLENGE = crypto.randomBytes(16).toString('base64');
const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
const expected = sha(sha(PASSWORD + SALT) + CHALLENGE);
let scenes = ['比赛中', '暂停画面', '解说特写', '结束画面'];
let current = '比赛中';
let streaming = false;
const wss = new WebSocketServer({ port: PORT });
console.log('[mock-obs] listening ws://127.0.0.1:' + PORT + ' password=' + PASSWORD);
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.2', rpcVersion: 1, authentication: { challenge: CHALLENGE, salt: SALT } } }));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.op === 1) {
      if (m.d.authentication !== expected) { ws.close(4009, 'auth failed'); return; }
      ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      return;
    }
    if (m.op !== 6) return;
    const { requestType, requestId } = m.d;
    const reply = (responseData = {}) => ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } }));
    const emit = (eventType, eventData) => ws.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }));
    switch (requestType) {
      case 'GetVersion': return reply({ obsVersion: '32.0.1', obsWebSocketVersion: '5.5.2', rpcVersion: 1, availableRequests: [] });
      case 'GetSceneList': return reply({ currentProgramSceneName: current, scenes: scenes.map((s) => ({ sceneName: s, sceneIndex: scenes.indexOf(s) })).reverse().map((s, i) => ({ ...s, sceneIndex: i })) });
      case 'GetStreamStatus': return reply({ outputActive: streaming, outputReconnecting: false, outputState: streaming ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      case 'SetCurrentProgramScene': {
        const n = m.d.requestData?.sceneName;
        if (!scenes.includes(n)) return ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: false, code: 600, comment: 'no scene' } } }));
        current = n; reply({}); emit('CurrentProgramSceneChanged', { sceneName: n }); return;
      }
      case 'StartStream': streaming = true; reply({}); emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTING' }); return;
      case 'StopStream': streaming = false; reply({}); emit('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }); return;
      default: return ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: false, code: 204, comment: 'unsupported' } } }));
    }
  });
});
