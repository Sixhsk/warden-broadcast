const fs = require('fs');
const p = 'src/console/App.tsx';
let s = fs.readFileSync(p, 'utf8');

function cut(startMark, endMark, next) {
  const i = s.indexOf(startMark);
  const j = s.indexOf(endMark, i + 1);
  if (i < 0 || j < 0) throw new Error('block not found: ' + startMark.slice(0, 40));
  s = s.slice(0, i) + next + s.slice(j);
}

/* ---------------- 1. 当前队伍与播出焦点：整合存活 / 在线状态 ---------------- */
cut(
  'function SelectCard({ st }: { st: MatchState }) {',
  '/* ---------------------------------------------------------------- 计时卡 */',
  `function SelectCard({ st }: { st: MatchState }) {
  const team = st.teams[st.currentTeam];
  const focus = st.focusPlayerId
    ? Object.values(st.teams).flatMap((t) => t.players).find((p) => p.id === st.focusPlayerId) ?? null
    : null;
  const mismatch = focus && focus.teamId !== st.currentTeam;

  return (
    <Card title="当前队伍与播出焦点" sub="切队伍 · 改状态 · 点选手切画面">
      <div className="team-switch">
        {(['A', 'B'] as TeamId[]).map((tid) => (
          <button
            key={tid}
            type="button"
            className={\`tsw \${tid} \${st.currentTeam === tid ? 'on' : ''}\`}
            onClick={() => send('team.focus', { teamId: tid })}
          >
            <b>{tid}</b>
            <span>{st.teams[tid].name}</span>
          </button>
        ))}
      </div>

      <div className="frows">
        {team.players.map((p) => {
          const offline = p.signal === 'offline';
          const on = p.id === st.focusPlayerId;
          const av = assetUrl(st, p.avatar);
          return (
            <div key={p.id} className={\`frow \${on ? 'on' : ''} \${offline ? 'off' : ''}\`}>
              <button
                type="button"
                className="fshot"
                disabled={offline}
                onClick={() => send('player.focus', { playerId: p.id })}
                title={offline ? '视频源 Offline，不可切换' : '切换为该选手的视频源'}
              >
                {av ? <img src={av} alt="" /> : <span className="num">{p.id.slice(1)}</span>}
              </button>

              <div className="fnameline">
                <button
                  type="button"
                  className="fname-btn"
                  disabled={offline}
                  onClick={() => send('player.focus', { playerId: p.id })}
                  title={offline ? '视频源 Offline，不可切换' : '切换为该选手的视频源'}
                >
                  {p.nickname || '未命名'}
                </button>
                <span className="fid num">{p.id}</span>
                {on && <span className="fnow">播出中</span>}
                {offline && <span className="fhint">Offline · 不可切换</span>}
              </div>

              <div className="fctl">
                <Seg
                  value={p.alive ? 'alive' : 'dead'}
                  options={[
                    { v: 'alive', l: '存活' },
                    { v: 'dead', l: '已淘汰' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { alive: v === 'alive' } })}
                />
                <Seg
                  value={p.signal}
                  options={[
                    { v: 'online', l: '在线' },
                    { v: 'offline', l: 'Offline' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { signal: v } })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="focus-now">
        当前播出：{focus ? \`\${st.teams[focus.teamId].name} · \${focus.nickname}\` : '未选择'}
        {mismatch && <b className="warn"> · 与右栏队伍不一致，叠加层已各自标注</b>}
      </div>
    </Card>
  );
}

`,
);

/* ---------------- 2. 计时卡改名（去掉“正”字） ---------------- */
s = s.replace('      title="比赛正计时"\n      sub="服务端权威时间 · 从 00:00:00 起累计"', '      title="比赛计时"\n      sub="服务端权威时间 · 从 00:00:00 起累计"');
s = s.replace('正计时不设上限，不会自动停止；「开始」从 00:00:00 重新起算，「归零」清空后的下一次开始同样从 0 起。', '计时不设上限，不会自动停止；「开始」从 00:00:00 重新起算，「归零」清空后的下一次开始同样从 0 起。');

/* ---------------- 3. 新增：比赛信息简报卡 + 设置弹窗 ---------------- */
const marker = 'export default function App() {';
const newBlocks = `/* ------------------------------------------------------------ 比赛信息简报 */

function MatchSummary({ st, onOpen }: { st: MatchState; onOpen: () => void }) {
  const casters = st.casters.map((c) => c.name).filter(Boolean).join(' / ') || '未设置';
  return (
    <Card
      title="比赛信息"
      sub="每场比赛设置一次 · 改动实时生效"
      right={<Btn onClick={onOpen}>设置</Btn>}
    >
      <div className="msum">
        <div className="msum-row">
          <span className="msum-k">赛事</span>
          <b className="msum-name">{st.event.name || '未命名赛事'}</b>
        </div>
        <div className="msum-row">
          <span className="msum-k">赛段</span>
          <span>{st.event.stage || '—'}</span>
        </div>
        <div className="msum-row">
          <span className="msum-k">轮次</span>
          <span>{st.event.round || '—'}</span>
        </div>
        <div className="msum-row">
          <span className="msum-k">对阵</span>
          <span className="msum-vs">
            <i className="vt a">A</i>
            {st.teams.A.name}
            <em>vs</em>
            <i className="vt b">B</i>
            {st.teams.B.name}
          </span>
        </div>
        <div className="msum-row">
          <span className="msum-k">解说</span>
          <span>{casters}</span>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 设置弹窗 */

type SettingsTab = 'match' | 'media' | 'obs';

function SettingsModal({ st, obs, onClose }: { st: MatchState; obs: any; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('match');

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>设置</b>
          <span>每场比赛只需设置一次，保存即实时生效，无需重启</span>
          <div className="spacer" />
          <Btn onClick={onClose}>关闭</Btn>
        </div>

        <div className="mtabs">
          {([
            ['match', '比赛信息'],
            ['media', '画面与素材'],
            ['obs', 'OBS 连接'],
          ] as [SettingsTab, string][]).map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        <div className="mbody">
          {tab === 'match' && (
            <>
              <EventCard st={st} />
              <div className="two">
                <TeamCard st={st} teamId="A" />
                <TeamCard st={st} teamId="B" />
              </div>
              <CastersCard st={st} />
            </>
          )}
          {tab === 'media' && <BackgroundCard st={st} />}
          {tab === 'obs' && <ObsCard st={st} obs={obs} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {`;

s = s.replace(marker, newBlocks);

/* ---------------- 4. 主界面重新排布 ---------------- */
const mainStart = "      <main className={st.setupDone ? 'cmain' : 'cmain dim'}>";
const mainEnd = '      </main>';
const i = s.indexOf(mainStart);
const j = s.indexOf(mainEnd, i);
if (i < 0 || j < 0) throw new Error('main block not found');

const newMain = `      <main className={st.setupDone ? 'cmain' : 'cmain dim'}>
        <div className="col-left">
          <MatchSummary st={st} onOpen={() => setSettings(true)} />
          <SelectCard st={st} />
        </div>
        <div className="col-right">
          <TimerCard st={st} />
          <PreviewCard st={st} />
        </div>
      </main>

      {settings && <SettingsModal st={st} obs={obs} onClose={() => setSettings(false)} />}
`;
s = s.slice(0, i) + newMain + s.slice(j + mainEnd.length);

s = s.replace("  const st = snap.state;\n  const obs = snap.obs;", "  const st = snap.state;\n  const obs = snap.obs;\n  const [settings, setSettings] = useState(false);");

fs.writeFileSync(p, s);
console.log('ok');