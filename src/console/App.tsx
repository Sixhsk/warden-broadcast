import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AssetMeta,
  Caster,
  MatchState,
  Player,
  TeamId,
  assetUrl,
  fmtHMS,
  prepareAvatar,
  prepareBackground,
  elapsedMs,
  send,
  sendAck,
  serverNow,
  thumbUrl,
  useApp,
  useTick,
} from '../lib/store';
import { MdButton, MdDialog, MdField, MdSeg, MdTabs } from './md';
import type { AssetKind, ImportProgress } from '../lib/importer';
import { emptyProgress, importBatch, filesFromZipFile } from '../lib/importer';
import { DEFAULT_SEED, THEME_PRESETS, applyTheme, isHexColor } from '../lib/md3';

/* ------------------------------------------------------------ 基础控件 */

function Card({
  title,
  sub,
  right,
  children,
  className = '',
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="card-right">{right}</div>
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

async function uploadImage(file: File, kind: 'avatar' | 'background' | 'caster'): Promise<AssetMeta> {
  const prep = kind === 'background' ? await prepareBackground(file) : await prepareAvatar(file);
  const res = await sendAck<{ asset: AssetMeta }>('asset.upload', {
    kind,
    dataUrl: prep.dataUrl,
    thumbDataUrl: prep.thumbDataUrl,
    w: prep.w,
    h: prep.h,
    source: prep.sourceLabel,
  });
  return res.asset;
}

function FileButton({
  label,
  accept = 'image/png,image/jpeg,image/webp',
  onFile,
  variant = 'text',
}: {
  label: string;
  accept?: string;
  onFile: (f: File) => void;
  variant?: 'text' | 'outlined' | 'tonal';
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = '';
        }}
      />
      <MdButton variant={variant} onClick={() => ref.current?.click()}>
        {label}
      </MdButton>
    </>
  );
}

/* -------------------------------------------------------------- 赛事信息 */

function EventCard({ st }: { st: MatchState }) {
  return (
    <Card title="赛事信息" sub="显示在叠加层顶带">
      <div className="grid3">
        <MdField
          label="赛事名称"
          value={st.event.name}
          maxLength={80}
          onCommit={(v) => send('event.set', { name: v })}
        />
        <MdField label="赛段" value={st.event.stage} maxLength={60} onCommit={(v) => send('event.set', { stage: v })} />
        <MdField
          label="轮次 / 对阵"
          value={st.event.round}
          maxLength={60}
          onCommit={(v) => send('event.set', { round: v })}
        />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 选手行 */

type PickerRequest = { kind: 'avatar' | 'background'; title: string; onPick: (id: string | null) => void };

function openPicker(req: PickerRequest) {
  window.dispatchEvent(new CustomEvent('wb-picker', { detail: req }));
}

function libItems(st: MatchState, kind: 'avatar' | 'background'): AssetMeta[] {
  return Object.values(st.assets)
    .filter((a) => (kind === 'avatar' ? a.kind !== 'background' : a.kind === 'background'))
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
}

function LibGrid({
  items,
  onPick,
  onDelete,
  onRename,
  showNull
}: {
  items: AssetMeta[];
  onPick?: (id: string | null) => void;
  onDelete?: (a: AssetMeta) => void;
  onRename?: (a: AssetMeta) => void;
  showNull?: boolean;
}) {
  return (
    <div className="libgrid">
      {showNull && (
        <button type="button" className="libcell ph" onClick={() => onPick?.(null)} title="使用占位图">
          <span className="phmark">PH</span>
          <em>占位</em>
        </button>
      )}
      {items.map((a) => (
        <div className="libcell" key={a.id} title={a.name || a.id}>
          <button type="button" className="libpick" onClick={() => onPick?.(a.id)}>
            <img src={a.thumbUrl || a.url} alt="" />
          </button>
          {onRename && (
            <button type="button" className="libmini" onClick={() => onRename(a)} title="重命名">
              ✎
            </button>
          )}
          {onDelete && (
            <button type="button" className="libmini del" onClick={() => onDelete(a)} title="删除">
              ✕
            </button>
          )}
          <span className="libname">{a.name || a.id}</span>
        </div>
      ))}
      {!items.length && <p className="libempty">还没有素材，先导入图片或压缩包。</p>}
    </div>
  );
}

function ImportBar({
  kind,
  prog,
  onStart
}: {
  kind: AssetKind;
  prog: ImportProgress;
  onStart: (files: File[], kind: AssetKind) => void;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="libbar">
        <MdButton variant="filled" onClick={() => imgRef.current?.click()}>
          导入图片
        </MdButton>
        <MdButton variant="outlined" onClick={() => zipRef.current?.click()}>
          导入压缩包
        </MdButton>
        <span className="libcount">支持 PNG / JPG / WebP，单张 ≤25 MB，一次 ≤200 张</span>
        <input
          ref={imgRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            e.target.value = '';
            if (fs.length) onStart(fs, kind);
          }}
        />
        <input
          ref={zipRef}
          type="file"
          accept=".zip"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0] as File | undefined;
            e.target.value = '';
            if (!f) return;
            try {
              const files = await filesFromZipFile(f);
              if (!files.length) {
                alert('压缩包里没有找到可用的图片');
                return;
              }
              onStart(files, kind);
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        />
      </div>
      {(prog.running || prog.total > 0) && (
        <div className="libprog">
          <md-linear-progress
            value={prog.total ? prog.done / prog.total : 0}
            style={{ width: '100%' }}
          />
          <span>
            {prog.running ? '导入中' : '已完成'} {prog.done}/{prog.total} · 成功 {prog.ok} · 去重 {prog.dedup} · 跳过{' '}
            {prog.skip}
            {prog.current ? ` · ${prog.current}` : ''}
          </span>
        </div>
      )}
      {!!prog.notes.length && (
        <ul className="libnotes">
          {prog.notes.slice(-5).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function AssetPicker({ st, req, onClose }: { st: MatchState; req: PickerRequest; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [prog, setProg] = useState<ImportProgress>(emptyProgress());
  const items = libItems(st, req.kind).filter((a) =>
    q ? (a.name || '').toLowerCase().includes(q.toLowerCase()) : true
  );
  const start = (files: File[], kind: AssetKind) => {
    importBatch(files, kind, setProg).catch(() => {});
  };
  return (
    <div className="pickmask" onClick={onClose}>
      <div className="picksheet" onClick={(e) => e.stopPropagation()}>
        <header className="pickhead">
          <h3>{req.title}</h3>
          <MdField label="搜索素材" value={q} onValue={setQ} maxLength={40} />
        </header>
        <ImportBar kind={req.kind} prog={prog} onStart={start} />
        <div className="pickbody">
          <LibGrid
            items={items}
            showNull
            onPick={(id) => {
              req.onPick(id);
              onClose();
            }}
          />
        </div>
        <footer className="pickfoot">
          <span className="libcount">
            共 {items.length} 张 · 选「占位」表示不用头像，画面上显示 PH 占位图
          </span>
          <MdButton variant="text" onClick={onClose}>
            取消
          </MdButton>
        </footer>
      </div>
    </div>
  );
}

function LibraryCard({ st }: { st: MatchState }) {
  const [q, setQ] = useState('');
  const [prog, setProg] = useState<ImportProgress>(emptyProgress());
  const [dir, setDir] = useState(st.libDir || '');
  useEffect(() => setDir(st.libDir || ''), [st.libDir]);
  const items = libItems(st, 'avatar').filter((a) =>
    q ? (a.name || '').toLowerCase().includes(q.toLowerCase()) : true
  );
  const totalMb = (Object.values(st.assets).reduce((n, a) => n + (a.bytes || 0), 0) / 1048576).toFixed(1);

  const start = (files: File[], kind: AssetKind) => {
    importBatch(files, kind, setProg).catch(() => {});
  };

  const del = async (a: AssetMeta) => {
    if (!confirm(`删除「${a.name || a.id}」？被使用的素材不能删除。`)) return;
    try {
      await sendAck('lib.remove', { id: a.id });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const rename = async (a: AssetMeta) => {
    const nm = prompt('重命名素材', a.name || '');
    if (!nm) return;
    try {
      await sendAck('lib.rename', { id: a.id, name: nm });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <Card title="素材库" sub={`头像与背景共用 · 共 ${Object.keys(st.assets).length} 项 · ${totalMb} MB`}>
      <div className="libbar">
        <MdField
          label="素材目录"
          value={dir}
          maxLength={200}
          supportingText="留空 = 跟随数据目录；填写绝对路径可多份安装共用同一批图"
          className="libdir"
          onCommit={(v) => {
            send('lib.dir', { path: v.trim() });
          }}
        />
        <MdButton variant="outlined" onClick={() => send('lib.reveal')}>
          打开文件夹
        </MdButton>
      </div>
      <ImportBar kind="avatar" prog={prog} onStart={start} />
      <div className="libbar">
        <MdField label="搜索" value={q} onValue={setQ} maxLength={40} />
        <span className="libcount">
          {Number(totalMb) > 1024 ? '素材库超过 1 GB，建议清理' : Number(totalMb) > 500 ? '素材库超过 500 MB，注意清理' : '容量正常'}
        </span>
      </div>
      <LibGrid items={items} onDelete={del} onRename={rename} />
    </Card>
  );
}

function PlayerRow({ st, p }: { st: MatchState; p: Player }) {
  const av = assetUrl(st, p.avatar);
  const offline = p.signal === 'offline';

  return (
    <div className={`prow ${offline ? 'off' : ''}`}>
      <div className="pav">
        {av ? <img src={av} alt="" /> : <span>无头像</span>}
        <button
          type="button"
          className="pavpick"
          onClick={() =>
            openPicker({
              kind: 'avatar',
              title: `选择头像 · ${p.nickname}`,
              onPick: (id) => send('player.avatar', { playerId: p.id, assetId: id })
            })
          }
        >
          换图
        </button>
      </div>

      <div className="pmain">
        <div className="pline">
          <MdField
            label="选手昵称"
            value={p.nickname}
            maxLength={24}
            className="nick"
            onCommit={(v) => send('player.update', { playerId: p.id, patch: { nickname: v } })}
          />
          <span className="pid num">{p.id}</span>
        </div>
        <div className="pline">
          <MdSeg
            value={p.alive ? 'alive' : 'dead'}
            options={[
              { v: 'alive', l: '存活' },
              { v: 'dead', l: '已淘汰' },
            ]}
            onChange={(v) => send('player.update', { playerId: p.id, patch: { alive: v === 'alive' } })}
          />
          <MdSeg
            value={p.signal}
            options={[
              { v: 'online', l: 'Online' },
              { v: 'offline', l: 'Offline' },
            ]}
            onChange={(v) => send('player.update', { playerId: p.id, patch: { signal: v } })}
          />
          {offline && <span className="hint warn">不可切换为焦点</span>}
        </div>
        <MdField
          label="可选说明（主玩职业 / 备注）"
          value={p.note || ''}
          maxLength={120}
          onCommit={(v) => send('player.update', { playerId: p.id, patch: { note: v } })}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 队伍卡 */

function TeamCard({ st, teamId }: { st: MatchState; teamId: TeamId }) {
  const team = st.teams[teamId];
  return (
    <Card
      title={`${teamId} 队`}
      sub="固定 4 名选手 · 队名只用文字"
      right={<span className={`vt ${teamId.toLowerCase()}`}>{teamId}</span>}
    >
      <MdField
        label="队名（纯文字）"
        value={team.name}
        maxLength={40}
        onCommit={(v) => send('team.rename', { teamId, name: v })}
      />
      <div className="prows">
        {team.players.map((p) => (
          <PlayerRow key={p.id} st={st} p={p} />
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 解说卡 */

function CastersCard({ st }: { st: MatchState }) {
  return (
    <Card
      title="解说"
      sub="1–2 名，显示在左下解说栏"
      right={
        st.casters.length < 2 ? (
          <MdButton variant="tonal" onClick={() => send('caster.add')}>
            增加解说
          </MdButton>
        ) : (
          <span className="hint">已达上限</span>
        )
      }
    >
      <div className="casters-edit">
        {st.casters.map((c: Caster) => {
          const av = assetUrl(st, c.avatar);
          return (
            <div className="crow" key={c.id}>
              <div className="cav">
                {av ? <img src={av} alt="" /> : <span>无图</span>}
                <button
                  type="button"
                  className="pavpick"
                  onClick={() =>
                    openPicker({
                      kind: 'avatar',
                      title: `选择头像 · ${c.name}`,
                      onPick: (id) => send('caster.update', { casterId: c.id, patch: { avatar: id } })
                    })
                  }
                >
                  换图
                </button>
              </div>
              <div className="cfields">
                <MdField
                  label="解说姓名"
                  value={c.name}
                  maxLength={24}
                  onCommit={(v) => send('caster.update', { casterId: c.id, patch: { name: v } })}
                />
                <MdField
                  label="角色 / 说明"
                  value={c.role}
                  maxLength={24}
                  onCommit={(v) => send('caster.update', { casterId: c.id, patch: { role: v } })}
                />
              </div>
              {st.casters.length > 1 && (
                <MdButton variant="text" onClick={() => send('caster.remove', { casterId: c.id })}>
                  移除
                </MdButton>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 背景卡 */

function BackgroundCard({ st }: { st: MatchState }) {
  const cur = st.background ? st.assets[st.background] : null;
  return (
    <Card
      title="背景图"
      sub="叠加层底层素材，不影响控件与信息布局"
      right={
        <div className="card-right">
          <FileButton
            variant="tonal"
            label={cur ? '更换背景' : '导入背景'}
            onFile={async (f) => {
              try {
                const a = await uploadImage(f, 'background');
                send('bg.set', { assetId: a.id });
              } catch (err) {
                alert((err as Error).message);
              }
            }}
          />
          {cur && (
            <MdButton variant="text" onClick={() => send('bg.clear')}>
              恢复默认
            </MdButton>
          )}
        </div>
      }
    >
      <div className="bg-preview">
        {cur ? <img src={cur.thumbUrl || cur.url} alt="" /> : <div className="bg-empty">默认无背景 · 深色终端底</div>}
      </div>
      {cur && (
        <div className="hint num">
          原图 {cur.w}×{cur.h} · 已适配 1920×1080 · {Math.round(cur.bytes / 1024)} KB · 来源 {cur.source}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- 主题色 */

function ThemeCard({ st }: { st: MatchState }) {
  const seed = st.theme?.seed || DEFAULT_SEED;
  const mode = st.theme?.mode || 'dark';
  const [custom, setCustom] = useState(seed);

  return (
    <Card
      title="主题色"
      sub="Material 3 会按种子色重新推导整套色板 · 同步到叠加层"
      right={
        <MdButton variant="text" onClick={() => send('theme.set', { seed: DEFAULT_SEED, mode: 'dark' })}>
          复位
        </MdButton>
      }
    >
      <div className="swatches">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.seed}
            type="button"
            title={p.name}
            aria-label={p.name}
            className={`swatch ${seed.toLowerCase() === p.seed.toLowerCase() ? 'on' : ''}`}
            style={{ background: p.seed }}
            onClick={() => send('theme.set', { seed: p.seed })}
          />
        ))}
        <label className="swatch custom" title="自定义颜色">
          <span style={{ background: custom }} />
          <input
            type="color"
            value={custom}
            onChange={(e) => {
              const v = e.target.value;
              setCustom(v);
              if (isHexColor(v)) send('theme.set', { seed: v });
            }}
          />
        </label>
      </div>

      <div className="row-gap">
        <span className="hint">明暗</span>
        <MdSeg
          value={mode}
          options={[
            { v: 'dark', l: '深色' },
            { v: 'light', l: '浅色' },
          ]}
          onChange={(v) => send('theme.set', { mode: v })}
        />
        <span className="hint num">种子 {seed.toUpperCase()}</span>
      </div>

      <div className="theme-roles">
        {[
          ['--md-sys-color-primary', 'primary'],
          ['--md-sys-color-primary-container', 'primary container'],
          ['--md-sys-color-secondary-container', 'secondary container'],
          ['--md-sys-color-tertiary-container', 'tertiary container'],
          ['--md-sys-color-surface-container-high', 'surface high'],
          ['--md-sys-color-error', 'error'],
        ].map(([v, l]) => (
          <span key={v} className="role" title={l}>
            <i style={{ background: `var(${v})` }} />
            {l}
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ 队伍/选手控制 */

function SelectCard({ st }: { st: MatchState }) {
  const team = st.teams[st.currentTeam];
  const focus = st.focusPlayerId
    ? Object.values(st.teams)
        .flatMap((t) => t.players)
        .find((p) => p.id === st.focusPlayerId) ?? null
    : null;
  const mismatch = focus && focus.teamId !== st.currentTeam;

  return (
    <Card title="当前队伍与播出焦点" sub="切队伍 · 改状态 · 点卡片任意位置切画面">
      <div className="team-switch">
        {(['A', 'B'] as TeamId[]).map((tid) => {
          const on = st.currentTeam === tid;
          return (
            <MdButton
              key={tid}
              variant={on ? 'tonal' : 'outlined'}
              className={`tbtn ${tid.toLowerCase()}`}
              onClick={() => send('team.focus', { teamId: tid })}
            >
              <span className="tbtn-row">
                <span className="tbtn-id">{tid}</span>
                <span className="tbtn-name">{st.teams[tid].name}</span>
              </span>
            </MdButton>
          );
        })}
      </div>

      <div className={`frows t-${st.currentTeam}`}>
        {team.players.map((p) => {
          const offline = p.signal === 'offline';
          const on = p.id === st.focusPlayerId;
          const av = assetUrl(st, p.avatar);
          return (
            <div
              key={p.id}
              className={`frow ${on ? 'on' : ''} ${offline ? 'off' : ''}`}
              role="button"
              tabIndex={offline ? -1 : 0}
              aria-pressed={on}
              aria-disabled={offline}
              title={offline ? '视频源 Offline，不可切换' : '点击卡片任意位置切换到该选手画面'}
              onClick={() => {
                if (!offline) send('player.focus', { playerId: p.id });
              }}
              onKeyDown={(e) => {
                if (offline) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  send('player.focus', { playerId: p.id });
                }
              }}
            >
              <div className="fshot">{av ? <img src={av} alt="" /> : <span className="num">{p.id.slice(1)}</span>}</div>

              <div className="fnameline">
                <span className="fname-text">{p.nickname || '未命名'}</span>
                <span className="fid num">{p.id}</span>
                {on && <span className="fnow">播出中</span>}
                {offline && <span className="fhint">Offline · 不可切换</span>}
              </div>

              {/* 状态开关：独立交互区，点它不会切换画面 */}
              <div className="fctl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <MdSeg
                  value={p.alive ? 'alive' : 'dead'}
                  options={[
                    { v: 'alive', l: '存活' },
                    { v: 'dead', l: '已淘汰' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { alive: v === 'alive' } })}
                />
                <MdSeg
                  value={p.signal}
                  options={[
                    { v: 'online', l: 'Online' },
                    { v: 'offline', l: 'Offline' },
                  ]}
                  onChange={(v) => send('player.update', { playerId: p.id, patch: { signal: v } })}
                />
              </div>
              {p.note && <span className="fnote">{p.note}</span>}
            </div>
          );
        })}
      </div>

      <div className="hint">
        当前播出：{focus ? `${st.teams[focus.teamId].name} · ${focus.nickname}` : '未选择'}
        {mismatch && <b className="warn"> · 与右栏队伍不一致，叠加层已各自标注</b>}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 计时卡 */

function TimerCard({ st }: { st: MatchState }) {
  const t = st.timer;
  useTick(t.phase === 'running', 250);
  const passed = elapsedMs(t, serverNow());

  return (
    <Card
      title="比赛计时"
      sub="服务端权威时间 · 从 00:00:00 起累计"
      right={
        <span className={`phase ${t.phase}`}>
          {({ idle: '待开始', running: '计时中', paused: '已暂停' } as Record<string, string>)[t.phase]}
        </span>
      }
    >
      <div className="timer-display num">{fmtHMS(passed)}</div>

      <div className="row-gap">
        <MdButton variant="filled" onClick={() => send('timer.cmd', { cmd: 'start' })} disabled={t.phase === 'running'}>
          开始
        </MdButton>
        <MdButton variant="tonal" onClick={() => send('timer.cmd', { cmd: 'pause' })} disabled={t.phase !== 'running'}>
          暂停
        </MdButton>
        <MdButton variant="tonal" onClick={() => send('timer.cmd', { cmd: 'resume' })} disabled={t.phase !== 'paused'}>
          继续
        </MdButton>
        <MdButton variant="text" onClick={() => send('timer.cmd', { cmd: 'reset' })}>
          归零
        </MdButton>
      </div>
      <div className="hint">
        计时不设上限、不会自动停止；「开始」从 00:00:00 重新起算，「归零」清空后的下一次开始同样从 0 起。
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ OBS */

function ObsCard({ st, obs }: { st: MatchState; obs: any }) {
  const [url, setUrl] = useState(obs?.url || st.obs.url || 'ws://127.0.0.1:4455');
  const [pwd, setPwd] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [scene, setScene] = useState(st.obs.srcScene || '比赛画面');
  const [msg, setMsg] = useState('');

  const statusText = obs?.connected ? (obs.streaming ? '推流中' : '已连接') : obs?.connecting ? '连接中…' : '未连接';

  return (
    <Card
      title="OBS 控制"
      sub="本机 OBS WebSocket（OBS 32.0.1 / 端口 4455）"
      right={<span className={`obs-status ${obs?.connected ? (obs.streaming ? 'live' : 'ok') : 'off'}`}>{statusText}</span>}
    >
      <div className="obs-row">
        <MdField
          label="WebSocket 地址"
          value={url}
          onValue={setUrl}
          onCommit={setUrl}
          placeholder="ws://127.0.0.1:4455"
          mono
        />
        <MdField
          label="密码（仅本机内存，不落盘）"
          value={pwd}
          type="password"
          onValue={setPwd}
          placeholder="OBS → 工具 → WebSocket 服务器设置"
        />
        <div className="row-gap obs-actions">
          {!obs?.connected ? (
            <MdButton
              variant="filled"
              disabled={obs?.connecting}
              onClick={() => {
                send('obs.config', { url });
                send('obs.connect', { url, password: pwd });
              }}
            >
              连接 OBS
            </MdButton>
          ) : (
            <MdButton variant="outlined" onClick={() => send('obs.disconnect')}>
              断开
            </MdButton>
          )}
        </div>
      </div>

      {obs?.error && <div className="obs-error">{obs.error}</div>}

      {!obs?.connected && (
        <div className="hint">
          <b>启用步骤</b>：OBS → 工具 → WebSocket 服务器设置 → 勾选「启用 WebSocket 服务器」→ 端口保持 4455 →
          设置或复制密码 → 确定。本程序不会自动开启服务，也不会关闭认证。
        </div>
      )}

      {obs?.connected && (
        <>
          <div className="hint">场景</div>
          <div className="scene-list">
            {obs.scenes?.length ? (
              obs.scenes.map((s: string) => (
                <button
                  key={s}
                  type="button"
                  className={`scene ${obs.scene === s ? 'on' : ''}`}
                  onClick={() => send('obs.scene', { scene: s })}
                >
                  {s}
                </button>
              ))
            ) : (
              <span className="hint">未读取到场景</span>
            )}
          </div>

          <div className="row-gap">
            {!obs.streaming ? (
              <MdButton variant="filled" onClick={() => send('obs.stream', { action: 'start' })}>
                开始推流
              </MdButton>
            ) : confirmStop ? (
              <>
                <MdButton
                  variant="filled"
                  onClick={() => {
                    send('obs.stream', { action: 'stop' });
                    setConfirmStop(false);
                  }}
                >
                  确认停止推流
                </MdButton>
                <MdButton variant="text" onClick={() => setConfirmStop(false)}>
                  取消
                </MdButton>
              </>
            ) : (
              <MdButton variant="outlined" onClick={() => setConfirmStop(true)}>
                停止推流
              </MdButton>
            )}
            <span className="hint num">
              OBS {obs.obsVersion || '—'} · RPC {obs.rpcVersion ?? '—'}
            </span>
          </div>

          <div className="hint" style={{ marginTop: 14 }}>
            选手媒体源（8 路 · 焦点切换时自动显隐）
          </div>
          <div className="row-gap">
            <MdField
              label="媒体源所在场景"
              value={scene}
              onValue={setScene}
              onCommit={setScene}
              placeholder="比赛画面"
            />
            <MdButton
              variant="filled"
              style={{ width: 196 }}
              onClick={async () => {
                setMsg('正在创建…');
                const r: any = await sendAck('obs.build', { scene });
                const d = (r && r.data) || r || {};
                if (r?.t === 'error') setMsg(r.message);
                else {
                  const made = (d.sources || []).filter((s: any) => s.inputName).length;
                  setMsg(`已就绪 ${made} 路 · 当前播出 ${d.sync?.target || '无（未绑定房间号）'}`);
                }
              }}
            >
              生成 / 更新 8 路媒体源
            </MdButton>
            <MdButton
              variant="outlined"
              style={{ width: 132 }}
              onClick={async () => {
                const r: any = await sendAck('obs.sync', {});
                const d = (r && r.data) || r || {};
                setMsg(r?.t === 'error' ? r.message : `已对齐：${d.target || '无播出源'}`);
              }}
            >
              重新对齐焦点
            </MdButton>
            <MdButton
              variant="outlined"
              style={{ width: '150px' }}
              title="给 8 名选手各建一个模拟画面源（浏览器源），用于没有真实推流时验证建源、切人与构图"
              onClick={async () => {
                const r: any = await sendAck('obs.sim', { mode: 'add' });
                const d = (r && r.data) || r || {};
                setMsg(r?.t === 'error' ? r.message : `模拟源：新建 ${d.created} · 复用 ${d.updated} · 播出 ${d.focus?.target || '无'}`);
              }}
            >
              生成模拟源
            </MdButton>
            <MdButton
              variant="text"
              style={{ width: '104px' }}
              onClick={async () => {
                const r: any = await sendAck('obs.sim', { mode: 'remove' });
                const d = (r && r.data) || r || {};
                setMsg(r?.t === 'error' ? r.message : `已移除模拟源 ${d.removed} 路`);
              }}
            >
              移除模拟源
            </MdButton>
            {msg && <span className="hint">{msg}</span>}
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- 预览卡 */

function StreamCard({ st }: { st: MatchState }) {
  const [list, setList] = useState<any[]>([]);
  const [port, setPort] = useState(7317);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/streams', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        setList(j.streams || []);
        if (j.port) setPort(j.port);
      } catch {
        /* 服务未就绪时静默 */
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const byId = new Map<string, any>(list.map((s) => [s.playerId, s]));

  const copy = async (id: string) => {
    const url = `http://127.0.0.1:${port}/stream/${id}.flv`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* 剪贴板被拒时忽略 */
    }
  };

  return (
    <Card
      title="直播信号源"
      sub="填 B 站直播间号 · 从 /stream/&lt;选手&gt;.flv 拉流给 OBS 媒体源"
    >
      {(['A', 'B'] as TeamId[]).map((tid) => (
        <div className="sgroup" key={tid}>
          <div className="sgroup-h">
            <span className={`sbadge ${tid.toLowerCase()}`}>{tid}</span>
            <span>{st.teams[tid].name}</span>
          </div>
          {st.teams[tid].players.map((p) => {
            const s = byId.get(p.id);
            const room = (p as any).room || '';
            const state = !room
              ? 'none'
              : s?.error
              ? 'err'
              : s?.active
              ? 'live'
              : s?.roomLive === true
              ? 'ready'
              : s?.roomLive === false
              ? 'off'
              : 'checking';
            const label =
              state === 'live'
                ? '在播'
                : state === 'ready'
                ? '直播中'
                : state === 'off'
                ? '未开播'
                : state === 'err'
                ? '异常'
                : state === 'checking'
                ? '检测中'
                : '未绑定';
            const tip =
              state === 'live'
                ? 'OBS 正在拉流'
                : state === 'ready'
                ? '房间在直播，但还没有客户端拉流'
                : state === 'off'
                ? '房间当前未开播'
                : s?.error || '';
            return (
              <div className="srow" key={p.id}>
                <span className="sid num">{p.id}</span>
                <span className="sname">{p.nickname}</span>
                <MdField
                  className="sroom"
                  value={room}
                  placeholder="房间号"
                  onCommit={(v) => send('player.room', { playerId: p.id, room: v })}
                />
                <span className={`schip ${state}`} title={tip}>{label}</span>
                <MdButton
                  variant="text"
                  className="scopy"
                  disabled={!room}
                  onClick={() => copy(p.id)}
                >
                  {copied === p.id ? '已复制' : '复制地址'}
                </MdButton>
              </div>
            );
          })}
        </div>
      ))}
      <p className="muted">
        签名每 60 分钟过期，服务端会在到期前自动断开让 OBS 重连并重新取地址；地址固定为
        <code>http://127.0.0.1:{port}/stream/&lt;选手&gt;.flv</code>。
      </p>
    </Card>
  );
}

function PreviewCard({ st }: { st: MatchState }) {
  const base = typeof location !== 'undefined' ? location.origin : 'http://127.0.0.1:7317';
  const ovUrl = `${base}/overlay.html`;
  const demoUrl = `${ovUrl}?demo=1`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ovUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      title="直播叠加层"
      sub="OBS 浏览器源用这一页；预览内是模拟画面"
      right={
        <a className="link" href={demoUrl} target="_blank" rel="noreferrer">
          预览新窗口 ↗
        </a>
      }
    >
      <div className="ov-url">
        <span className="ov-k">浏览器源 URL</span>
        <code>{ovUrl}</code>
        <MdButton variant="text" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </MdButton>
      </div>
      <div className="ov-url">
        <span className="ov-k">画面底色</span>
        <MdSeg
          value={st.feedBackdrop || 'black'}
          options={[
            { v: 'black', l: '纯黑黑场' },
            { v: 'transparent', l: '完全透明' },
          ]}
          onChange={(v) => send('feed.backdrop', { value: v })}
        />
      </div>
      <div className="preview-box">
        <iframe src={demoUrl} title="overlay preview" />
      </div>
      <div className="hint">
        OBS → 来源 → <b>+</b> → <b>浏览器</b>：宽 <b>1920</b>、高 <b>1080</b>、FPS 60，粘贴上面的地址。底色「纯黑黑场」时画面区不透明；要露出下面的游戏采集，切「完全透明」。
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- 向导 */

function Wizard({ st }: { st: MatchState }) {
  const [step, setStep] = useState(0);
  const steps = ['赛事', 'A 队', 'B 队', '解说', '计时与主题'];

  return (
    <div className="wizard-mask">
      <div className="wizard">
        <div className="wz-head">
          <div>
            <h1>直播初始化</h1>
            <p>按步骤录入赛事信息，完成前可随时修改</p>
          </div>
        </div>

        <div className="wz-steps">
          {steps.map((s, i) => (
            <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              {i + 1}. {s}
            </span>
          ))}
        </div>

        <div className="wz-body">
          {step === 0 && <EventCard st={st} />}
          {step === 1 && <TeamCard st={st} teamId="A" />}
          {step === 2 && <TeamCard st={st} teamId="B" />}
          {step === 3 && <CastersCard st={st} />}
          {step === 4 && (
            <div className="wz-duo">
              <TimerCard st={st} />
              <ThemeCard st={st} />
            </div>
          )}
        </div>

        <div className="wz-foot">
          <span className="hint">所有修改实时生效，叠加层无需刷新</span>
          <div className="row-gap">
            <MdButton variant="text" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              上一步
            </MdButton>
            {step < steps.length - 1 ? (
              <MdButton variant="filled" onClick={() => setStep((s) => s + 1)}>
                下一步
              </MdButton>
            ) : (
              <MdButton variant="filled" onClick={() => send('setup.done')}>
                完成并进入控制台
              </MdButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 比赛信息简报 */

function MatchSummary({ st, onOpen }: { st: MatchState; onOpen: () => void }) {
  const casters = st.casters.map((c) => c.name).filter(Boolean).join(' / ') || '未设置';
  return (
    <Card
      title="比赛信息"
      sub="每场比赛设置一次 · 改动实时生效"
      right={
        <MdButton variant="tonal" onClick={onOpen}>
          设置
        </MdButton>
      }
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

const TAB_KEYS = ['比赛信息', '直播信号源', '画面与素材', '主题色', 'OBS 连接'];

function SettingsModal({ st, obs, onClose }: { st: MatchState; obs: any; onClose: () => void }) {
  const [tab, setTab] = useState(0);

  return (
    <MdDialog open onClose={onClose}>
      <div className="modal-title">
        <span>设置</span>
        <MdButton variant="text" onClick={onClose}>
          关闭
        </MdButton>
      </div>
      <div className="modal-sub">每场比赛只需设置一次，改动即时生效，无需重启</div>

      <MdTabs tabs={TAB_KEYS} index={tab} onChange={setTab} className="mtabs" />

      <div className="mbody">
        {tab === 0 && (
          <>
            <EventCard st={st} />
            <div className="mrow">
              <TeamCard st={st} teamId="A" />
              <TeamCard st={st} teamId="B" />
            </div>
            <CastersCard st={st} />
          </>
        )}
        {tab === 1 && <StreamCard st={st} />}
        {tab === 2 && (
          <>
            <BackgroundCard st={st} />
            <LibraryCard st={st} />
          </>
        )}
        {tab === 3 && <ThemeCard st={st} />}
        {tab === 4 && <ObsCard st={st} obs={obs} />}
      </div>

      <div className="modal-actions">
        <MdButton variant="filled" onClick={onClose}>
          完成
        </MdButton>
      </div>
    </MdDialog>
  );
}

/* ------------------------------------------------------------------ App */

export default function App() {
  const { snap, connected, errors } = useApp();
  const [settings, setSettings] = useState(() => new URLSearchParams(location.search).has('settings'));
  const [picker, setPicker] = useState<PickerRequest | null>(null);

  useEffect(() => {
    const h = (e: Event) => setPicker(((e as CustomEvent).detail as PickerRequest) || null);
    window.addEventListener('wb-picker', h as EventListener);
    return () => window.removeEventListener('wb-picker', h as EventListener);
  }, []);

  const seed = snap?.state?.theme?.seed || DEFAULT_SEED;
  const mode = (snap?.state?.theme?.mode || 'dark') as 'dark' | 'light';

  // 主题跟随服务端状态：种子色或明暗变化时整体重算色板
  useEffect(() => {
    applyTheme(seed, mode);
  }, [seed, mode]);

  const st = snap?.state;
  const obs = snap?.obs;

  if (!snap || !st) {
    return <div className="boot-full">正在连接本地服务…</div>;
  }

  return (
    <div className="console">
      <header className="cbar">
        <div className="brand">
          <span className="dot" />
          卫戍协议 · 导播控制台
          <em>WARDEN BROADCAST</em>
        </div>
        <div className="spacer" />
        <span className={`conn ${connected ? 'ok' : 'bad'}`}>{connected ? '服务已连接' : '服务断开，正在重连'}</span>
        <span className="ver num">v{snap.version}</span>
      </header>

      {errors.length > 0 && <div className="toast">{errors[errors.length - 1]}</div>}

      <main className="cmain">
        <div className="col-left">
          <MatchSummary st={st} onOpen={() => setSettings(true)} />
          <SelectCard st={st} />
        </div>
        <div className="col-right">
          <TimerCard st={st} />
          <PreviewCard st={st} />
        </div>
      </main>

      {picker && <AssetPicker st={st} req={picker} onClose={() => setPicker(null)} />}
      {settings && <SettingsModal st={st} obs={obs} onClose={() => setSettings(false)} />}
      {!st.setupDone && <Wizard st={st} />}
    </div>
  );
}