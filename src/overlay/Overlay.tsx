import { createElement, useEffect, useRef, useState } from 'react';
import '@material/web/progress/circular-progress.js';
import {
  Caster,
  MatchState,
  Player,
  assetUrl,
  fmtHMS,
  playerById,
  elapsedMs,
  serverNow,
  useApp,
  useTick,
} from '../lib/store';
import { DEFAULT_SEED, applyTheme } from '../lib/md3';

const TEAM_ACCENT: Record<'A' | 'B', { accent: string; bright: string; container: string; on: string }> = {
  A: { accent: 'var(--team-a)', bright: 'var(--team-a)', container: 'var(--team-a-container)', on: '#04252a' },
  B: { accent: 'var(--team-b)', bright: 'var(--team-b)', container: 'var(--team-b-container)', on: '#2b1c02' },
};

// OBS 里叠加层必须是「中间透空」的：游戏采集在下面，UI 只压在四周。
// 默认 transparent（画面区完全透明，什么都不画）；带 ?demo=1 才画模拟画面，
// 供控制台预览与录屏演示使用。
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

function TeamStyle({ team }: { team: 'A' | 'B' }) {
  const t = TEAM_ACCENT[team];
  return {
    ['--accent' as any]: t.accent,
    ['--accent-bright' as any]: t.bright,
    ['--accent-container' as any]: t.container,
    ['--on-accent' as any]: t.on,
  } as React.CSSProperties;
}

function Avatar({ url, size, empty = 'NO AVATAR' }: { url: string | null; size: number; empty?: string }) {
  if (!url) {
    return (
      <div className="sav empty" style={{ width: size, height: size }}>
        {empty}
      </div>
    );
  }
  return <img className="sav" src={url} width={size} height={size} alt="" />;
}

/* 切换选手时的转场：主画面居中弹出选手框 + MD3 循环进度，约 3 秒后淡出，用于掩盖拉流重连的延迟 */
function MdRing() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el: any = ref.current;
    if (el) el.indeterminate = true;
  }, []);
  return createElement('md-circular-progress', { ref } as any);
}

/* 心电波形：横向贯穿主画面，作为“信号接入中”的视觉强化 */
const ECG_D = (() => {
  let d = 'M0,60';
  for (let i = 0; i < 6; i++) {
    const x = i * 240;
    d += ` L${x + 118},60 L${x + 138},60 L${x + 148},16 L${x + 160},104 L${x + 172},60 L${x + 240},60`;
  }
  return d;
})();

function EcgLine() {
  return (
    <svg className="switch-ecg" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
      <path className="base" d={ECG_D} />
      <path className="pulse" d={ECG_D} />
    </svg>
  );
}

function SwitchTransition({ state, player }: { state: MatchState; player: Player | null }) {
  const id = state.focusPlayerId || '';
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    // 首次连接（OBS 重新加载浏览器源）不播转场，只有真正切人才播
    if (!ready.current) {
      ready.current = true;
      return;
    }
    setShown(true);
    setLeaving(false);
    const t1 = setTimeout(() => setLeaving(true), 2600);
    const t2 = setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, 3050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [id]);

  if (!shown || !player) return null;
  const av = assetUrl(state, player.avatar);
  const team = state.teams[player.teamId];
  return (
    <div
      className={'switch-mask ' + (leaving ? 'out' : 'in')}
      style={TeamStyle({ team: player.teamId })}
    >
      <EcgLine />
      <div className="switch-card">
        <div className="switch-av">{av ? <img src={av} alt="" /> : <span>{(player.nickname || '?').slice(0, 1)}</span>}</div>
        <div className="switch-meta">
          <div className="switch-team">
            <i className="switch-badge">{player.teamId}</i>
            {team ? team.name : ''}
          </div>
          <div className="switch-name">{player.nickname}</div>
          <div className="switch-hint">
            <MdRing />
            正在连接画面…
          </div>
        </div>
      </div>
    </div>
  );
}

function GameFeed({ state, player, teamName }: { state: MatchState; player: Player | null; teamName: string | null }) {
  // 非 demo 模式：按控制台设定决定画面区底色（纯黑黑场 / 完全透空）
  if (!DEMO) {
    const clear = state.feedBackdrop === 'transparent';
    return <div className={`game ${clear ? 'transparent' : 'black'}`} />;
  }

  const now = new Date(serverNow());
  const tc = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const offline = player && player.signal === 'offline';
  const avatar = player ? assetUrl(state, player.avatar) : null;

  return (
    <div className="game black">
      <div className="feed">
        <div className="grid" />
        <div className="scan" />
        <div className="sweep" />
        <div className="vig" />
      </div>

      {!player && (
        <div className="feed-empty">
          <span>待机 · 尚未选择播出选手</span>
          <b>STANDBY</b>
        </div>
      )}

      {player && offline && (
        <div className="feed-empty">
          <span>{player.nickname} 的视频源处于 Offline</span>
          <b>暂无信号 · NO SIGNAL</b>
        </div>
      )}

      {player && !offline && (
        <div className="feed-center">
          {avatar ? <img className="feed-av" src={avatar} alt="" /> : <div className="feed-av empty">NO AVATAR</div>}
          <div className="feed-name" style={{ color: 'var(--accent-bright)' }}>
            {player.nickname}
          </div>
          <div className="feed-team">
            {teamName} · {player.teamId} 队
          </div>
          <div className="feed-tag">模拟画面 · SIMULATED FEED</div>
        </div>
      )}

      <div className="feed-tc num">
        TC <b>{tc}</b> · 1080p60 · 占位信号
      </div>
      <div className="feed-corner">
        SIMULATED · <span>NOT A REAL PLAYER STREAM</span>
      </div>
    </div>
  );
}

function Slot({ state, p, focused }: { state: MatchState; p: Player; focused: boolean }) {
  const av = assetUrl(state, p.avatar);
  const offline = p.signal === 'offline';
  const cls = ['slot', focused ? 'on' : '', offline ? 'off' : ''].join(' ').trim();
  return (
    <div className={cls}>
      {focused && !offline && <div className="now">当前播出</div>}
      <Avatar url={av} size={96} />
      <div className="sbody">
        <div className="sname">{p.nickname}</div>
        <div className="chips">
          <span className={p.alive ? 'chip alive' : 'chip dead'}>
            <i />
            {p.alive ? '存活' : '已淘汰'}
          </span>
          <span className={offline ? 'chip offline' : 'chip online'}>
            <i />
            {offline ? 'Offline' : 'Online'}
          </span>
        </div>
      </div>
      <div className="idx">槽位 {p.id.slice(1).padStart(2, '0')}</div>
    </div>
  );
}

function Casters({ state }: { state: MatchState }) {
  return (
    <div className="casters">
      {state.casters.map((c: Caster) => {
        const av = assetUrl(state, c.avatar);
        return (
          <div className="caster" key={c.id}>
            {av ? (
              <img className="cav" src={av} alt="" />
            ) : (
              <div className="cav empty" style={{ width: 66, height: 66 }}>
                NO IMG
              </div>
            )}
            <div>
              <div className="cname">{c.name}</div>
              <div className="crole">{c.role || '解说'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Timer({ state }: { state: MatchState }) {
  const t = state.timer;
  const passed = elapsedMs(t, serverNow());
  const label = t.phase === 'running' ? '计时中' : t.phase === 'paused' ? '已暂停' : '待开始';
  return (
    <div className={`timer ${t.phase}`}>
      <div className="tlabel">
        比赛已进行 <em>· {label}</em>
      </div>
      <div className="tdigits num">{fmtHMS(passed)}</div>
      <div className="tbar">
        <i style={{ width: t.phase === 'running' ? '100%' : '0%' }} className={`pulse-${t.phase}`} />
      </div>
      <div className="tmeta">正计时 · 从 00:00:00 起累计</div>
    </div>
  );
}

export default function Overlay() {
  const { snap } = useApp();
  const [scale, setScale] = useState(1);
  const running = snap?.state.timer.phase === 'running';
  useTick(running, 200);

  const seed = snap?.state?.theme?.seed || DEFAULT_SEED;
  const mode = (snap?.state?.theme?.mode || 'dark') as 'dark' | 'light';

  // 主题跟随服务端：控制台换色后叠加层重算色板，无需刷新
  useEffect(() => {
    applyTheme(seed, mode);
  }, [seed, mode]);

  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  if (!snap) {
    return (
      <div className="stage-wrap">
        <div className="boot">正在连接本地服务…</div>
      </div>
    );
  }

  const st = snap.state;
  const team = st.teams[st.currentTeam];
  const focus = playerById(st, st.focusPlayerId);
  const focusTeam = focus ? st.teams[focus.teamId] : null;
  const mismatch = !!(focus && focusTeam && focus.teamId !== st.currentTeam);
  const bg = st.background ? snap.assets[st.background]?.url : null;

  return (
    <div className="stage-wrap">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        {bg && <img className="bg" src={bg} alt="" />}
        {bg && <div className="bg-scrim" />}

        <div className="top">
          <div className="bar" />
          <div className="name">{st.event.name}</div>
          <div className="meta">
            {st.event.stage}
            {st.event.round ? ' · ' + st.event.round : ''}
          </div>
          <div className="spacer" />
          <div className="live-chip">
            <i />
            直播中
          </div>
        </div>

        <GameFeed state={st} player={focus} teamName={focusTeam?.name ?? null} />
        <SwitchTransition state={st} player={focus} />

        <div className="side" style={TeamStyle({ team: st.currentTeam })}>
          <div className="side-hd">
            <div className="badge">{st.currentTeam}</div>
            <div>
              <div className="tname">{team.name}</div>
              <div className="tsub">
                当前队伍 · {team.players.length} 名选手
              </div>
            </div>
          </div>
          <div className="slots">
            {team.players.map((p: Player) => (
              <Slot key={p.id} state={st} p={p} focused={p.id === st.focusPlayerId} />
            ))}
          </div>
          {mismatch && focusTeam && (
            <div className="side-note">
              画面正在播出 <b>{focusTeam.name}</b> · {focus?.nickname}
              <br />
              右栏仍显示 {team.name}。切换队伍后即可对齐。
            </div>
          )}
        </div>

        <div className="band">
          <Casters state={st} />
          <div className="band-divider" />
          <Timer state={st} />
        </div>
      </div>
    </div>
  );
}