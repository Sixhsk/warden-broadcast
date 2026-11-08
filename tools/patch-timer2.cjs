const fs = require('fs');

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(`${file}: missing >>> ${a.slice(0, 60)}`);
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

/* ---------------- store.ts ---------------- */
patch('src/lib/store.ts', [
  [
    `export type TimerPhase = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  phase: TimerPhase;
  durationMs: number;
  endsAt: number | null;
  remainingMs: number;
}`,
    `export type TimerPhase = 'idle' | 'running' | 'paused';

/** 正计时状态：服务端只存「已累计毫秒 + 本轮开始时刻」，已过时间由时间戳推算 */
export interface TimerState {
  phase: TimerPhase;
  startedAt: number | null;
  accumulatedMs: number;
  elapsedMs: number;
}`,
  ],
  [
    `/** 计时剩余毫秒（服务端权威时间戳换算） */
export function remainingMs(timer: TimerState | undefined | null, now: number) {
  if (!timer) return 0;
  if (timer.phase === 'running' && typeof timer.endsAt === 'number') {
    return Math.max(0, timer.endsAt - now);
  }
  return Math.max(0, timer.remainingMs || 0);
}`,
    `/** 已进行毫秒（正计时，服务端时间戳换算，不在本地逐秒累加） */
export function elapsedMs(timer: TimerState | undefined | null, now: number) {
  if (!timer) return 0;
  const acc = Math.max(0, timer.accumulatedMs || 0);
  if (timer.phase === 'running' && typeof timer.startedAt === 'number') {
    return acc + Math.max(0, now - timer.startedAt);
  }
  return acc;
}`,
  ],
]);

/* ---------------- overlay ---------------- */
patch('src/overlay/Overlay.tsx', [
  ['  remainingMs,', '  elapsedMs,'],
  [
    `function Timer({ state, running }: { state: MatchState; running: boolean }) {
  const t = state.timer;
  const left = remainingMs(t, serverNow());
  const duration = Math.max(1, t.durationMs);
  const pct = Math.min(100, Math.max(0, (left / duration) * 100));
  const label =
    t.phase === 'running' ? '计时中' : t.phase === 'paused' ? '已暂停' : t.phase === 'finished' ? '已结束' : '待开始';
  return (
    <div className={\`timer \${t.phase}\`}>
      <div className="tlabel">
        比赛倒计时 <em>· {label}</em>
      </div>
      <div className="tdigits num">{fmtHMS(left)}</div>
      <div className="tbar">
        <i style={{ width: pct + '%' }} />
      </div>
      <div className="tmeta">设定时长 {fmtHMS(duration)}</div>
    </div>
  );
}`,
    `function Timer({ state }: { state: MatchState }) {
  const t = state.timer;
  const passed = elapsedMs(t, serverNow());
  const label = t.phase === 'running' ? '计时中' : t.phase === 'paused' ? '已暂停' : '待开始';
  return (
    <div className={\`timer \${t.phase}\`}>
      <div className="tlabel">
        比赛已进行 <em>· {label}</em>
      </div>
      <div className="tdigits num">{fmtHMS(passed)}</div>
      <div className="tbar">
        <i style={{ width: t.phase === 'running' ? '100%' : '0%' }} className={\`pulse-\${t.phase}\`} />
      </div>
      <div className="tmeta">正计时 · 从 00:00:00 起累计</div>
    </div>
  );
}`,
  ],
]);