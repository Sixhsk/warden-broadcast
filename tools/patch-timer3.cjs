const fs = require('fs');
const p = 'src/console/App.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replace('  remainingMs,', '  elapsedMs,');

const startMark = 'function TimerCard({ st }: { st: MatchState }) {';
const endMark = '/* ------------------------------------------------------------------ OBS */';
const i = s.indexOf(startMark);
const j = s.indexOf(endMark, i);
if (i < 0 || j < 0) throw new Error('TimerCard block not found');

const block = `function TimerCard({ st }: { st: MatchState }) {
  const t = st.timer;
  useTick(t.phase === 'running', 250);
  const passed = elapsedMs(t, serverNow());

  return (
    <Card
      title="比赛正计时"
      sub="服务端权威时间 · 从 00:00:00 起累计"
      right={<span className={\`phase \${t.phase}\`}>{({ idle: '待开始', running: '计时中', paused: '已暂停' } as any)[t.phase]}</span>}
    >
      <div className="timer-display num">{fmtHMS(passed)}</div>

      <div className="row-gap">
        <Btn kind="solid" onClick={() => send('timer.cmd', { cmd: 'start' })} disabled={t.phase === 'running'}>
          开始
        </Btn>
        <Btn onClick={() => send('timer.cmd', { cmd: 'pause' })} disabled={t.phase !== 'running'}>
          暂停
        </Btn>
        <Btn onClick={() => send('timer.cmd', { cmd: 'resume' })} disabled={t.phase !== 'paused'}>
          继续
        </Btn>
        <Btn danger onClick={() => send('timer.cmd', { cmd: 'reset' })}>
          归零
        </Btn>
      </div>
      <div className="hint">
        正计时不设上限，不会自动停止；「开始」从 00:00:00 重新起算，「归零」清空后的下一次开始同样从 0 起。
      </div>
    </Card>
  );
}

`;

s = s.slice(0, i) + block + s.slice(j);
fs.writeFileSync(p, s);
console.log('ok, remainingMs refs:', (s.match(/remainingMs/g) || []).length);