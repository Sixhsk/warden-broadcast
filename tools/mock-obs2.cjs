// 轻量 obs-websocket 5.x 模拟器：支持媒体源创建与场景项显隐，暴露 /state 供断言
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.MOCK_PORT || 4460);
const PASSWORD = process.env.MOCK_PASS || 'pw';
const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

const state = {
  scenes: ['比赛画面', '解说特写'],
  current: '比赛画面',
  inputs: {},      // name -> { kind, settings }
  items: {},       // scene -> [{ sceneItemId, sourceName, sceneItemEnabled }]
  seq: 100,
  transforms: {},
  streaming: false,
  log: [],
};
for (const s of state.scenes) state.items[s] = [];

const wss = new WebSocketServer({ port: PORT });
console.log('mock-obs listening', PORT);

wss.on('connection', (ws) => {
  const challenge = crypto.randomBytes(12).toString('base64');
  const salt = crypto.randomBytes(9).toString('base64');
  let authed = false;
  ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.2', rpcVersion: 1, authentication: { challenge, salt } } }));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.op === 1) {
      const expect = sha(sha(PASSWORD + salt) + challenge);
      if (m.d?.authentication !== expect) {
        state.log.push('auth-fail');
        return ws.close(4009, 'auth failed');
      }
      authed = true;
      state.log.push('auth-ok');
      return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    }
    if (m.op !== 6 || !authed) return;
    const { requestType, requestId, requestData = {} } = m.d;
    const reply = (data = {}) => ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData: data } }));
    const fail = (comment) => ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: false, code: 600, comment } } }));
    const sceneItems = (name) => (state.items[name] = state.items[name] || []);

    switch (requestType) {
      case 'GetVersion':
        return reply({ obsVersion: '32.0.1', obsWebSocketVersion: '5.5.2', rpcVersion: 1, availableRequests: [] });
      case 'GetSceneList':
        return reply({
          currentProgramSceneName: state.current,
          scenes: state.scenes.map((s, i) => ({ sceneName: s, sceneIndex: i })).reverse().map((s, i) => ({ ...s, sceneIndex: i })),
        });
      case 'CreateScene':
        if (!state.scenes.includes(requestData.sceneName)) {
          state.scenes.push(requestData.sceneName);
          state.items[requestData.sceneName] = [];
        }
        return reply({ sceneName: requestData.sceneName });
      case 'GetInputSettings':
        if (!state.inputs[requestData.inputName]) return fail('no input');
        return reply({ inputKind: state.inputs[requestData.inputName].kind, inputSettings: state.inputs[requestData.inputName].settings });
      case 'CreateInput': {
        const { inputName, inputKind, inputSettings, sceneName, sceneItemEnabled } = requestData;
        if (state.inputs[inputName]) return fail('exists');
        state.inputs[inputName] = { kind: inputKind, settings: inputSettings || {} };
        const list = sceneItems(sceneName);
        list.push({ sceneItemId: ++state.seq, sourceName: inputName, sceneItemEnabled: !!sceneItemEnabled });
        return reply({ sceneItemId: state.seq });
      }
      case 'SetInputSettings':
        if (!state.inputs[requestData.inputName]) return fail('no input');
        state.inputs[requestData.inputName].settings = requestData.inputSettings || {};
        return reply({});
      case 'GetSceneItemId': {
        const it = sceneItems(requestData.sceneName).find((i) => i.sourceName === requestData.sourceName);
        if (!it) return fail('no item');
        return reply({ sceneItemId: it.sceneItemId });
      }
      case 'CreateSceneItem': {
        const list = sceneItems(requestData.sceneName);
        const it = { sceneItemId: ++state.seq, sourceName: requestData.sourceName, sceneItemEnabled: !!requestData.sceneItemEnabled };
        list.push(it);
        return reply({ sceneItemId: it.sceneItemId });
      }
      case 'SetSceneItemTransform': {
        const it = sceneItems(requestData.sceneName).find((i) => i.sceneItemId === requestData.sceneItemId);
        if (it) { state.transforms[it.sourceName] = requestData.sceneItemTransform; state.log.push('tf:' + it.sourceName); } else { state.log.push('tf-miss:' + JSON.stringify(requestData).slice(0, 120)); }
        return reply({});
      }
      case 'SetSceneItemIndex':
        return reply({});
      case 'GetSceneItemList': {
        const list = sceneItems(requestData.sceneName);
        return reply({ sceneItems: list.map((i) => ({ ...i })) });
      }
      case 'SetSceneItemEnabled': {
        const it = sceneItems(requestData.sceneName).find((i) => i.sceneItemId === requestData.sceneItemId);
        if (!it) return fail('no item');
        it.sceneItemEnabled = !!requestData.sceneItemEnabled;
        return reply({});
      }
      case 'SetCurrentProgramScene': {
        if (!state.scenes.includes(requestData.sceneName)) return fail('no scene');
        state.current = requestData.sceneName;
        ws.send(JSON.stringify({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventIntent: 4, eventData: { sceneName: state.current } } }));
        return reply({});
      }
      case 'GetStreamStatus':
        return reply({ outputActive: state.streaming, outputReconnecting: false, outputState: state.streaming ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      case 'StartStream':
        state.streaming = true; reply({});
        return ws.send(JSON.stringify({ op: 5, d: { eventType: 'StreamStateChanged', eventIntent: 1, eventData: { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' } } }));
      case 'StopStream':
        state.streaming = false; reply({});
        return ws.send(JSON.stringify({ op: 5, d: { eventType: 'StreamStateChanged', eventIntent: 1, eventData: { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' } } }));
      default:
        return fail('unsupported:' + requestType);
    }
  });
});

http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ...state, enabled: Object.fromEntries(Object.entries(state.items).map(([k, v]) => [k, v.map((i) => ({ sourceName: i.sourceName, on: i.sceneItemEnabled }))])) }, null, 2));
}).listen(PORT + 1, () => console.log('mock state http', PORT + 1));