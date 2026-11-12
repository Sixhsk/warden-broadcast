import { useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ 类型 */

export type TeamId = 'A' | 'B';
export type Signal = 'online' | 'offline';

export interface Player {
  id: string;
  teamId: TeamId;
  nickname: string;
  avatar: string | null;
  note: string;
  alive: boolean;
  signal: Signal;
  /** B 站直播间号，作为该选手的直播信号源；空串表示未绑定 */
  room?: string;
}

export interface Team {
  id: TeamId;
  name: string;
  players: Player[];
}

export interface Caster {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
}

export interface AssetMeta {
  id: string;
  kind: string;
  mime: string;
  file: string;
  thumb: string | null;
  w: number;
  h: number;
  bytes: number;
  source: string;
  createdAt: number;
  url: string;
  thumbUrl: string;
  /** 素材库：原始文件名（用于搜索与识别） */
  name?: string | null;
  /** 素材库：归一化后字节的 sha256，用于去重 */
  sha256?: string | null;
}

export type TimerPhase = 'idle' | 'running' | 'paused';

/** 正计时状态：服务端只存「已累计毫秒 + 本轮开始时刻」，已过时间由时间戳推算 */
export interface TimerState {
  phase: TimerPhase;
  startedAt: number | null;
  accumulatedMs: number;
  elapsedMs: number;
}

export interface MatchState {
  schema: number;
  event: { name: string; stage: string; round: string };
  teams: Record<TeamId, Team>;
  casters: Caster[];
  currentTeam: TeamId;
  focusPlayerId: string | null;
  setupDone: boolean;
  timer: TimerState;
  /** 画面区底色：black = 无信号时黑场；transparent = 透空给 OBS 下面的游戏采集 */
  feedBackdrop: 'black' | 'transparent';
  /** 主题：种子色 + 明暗模式，两端共用 */
  theme: { seed: string; mode: 'dark' | 'light' };
  background: string | null;
  assets: Record<string, AssetMeta>;
  /** 素材库目录（绝对路径）；null = 跟随数据目录下的 assets/ */
  libDir?: string | null;
  obs: { url: string; srcScene?: string };
}

export interface ObsStatus {
  url: string;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  obsVersion: string | null;
  rpcVersion: number | null;
  scene: string | null;
  scenes: string[];
  streaming: boolean;
  streamState: string;
  srcScene?: string;
  srcSync?: { sceneName: string; target: string | null; changed: number; at: number } | null;
}

export interface LogLine {
  at: number;
  text: string;
}

export interface Snapshot {
  version: number;
  serverTime: number;
  state: MatchState;
  assets: Record<string, AssetMeta>;
  obs: ObsStatus;
  logs?: LogLine[];
}

/* -------------------------------------------------------------- 连接管理 */

type Listener = (snap: Snapshot | null) => void;

const listeners = new Set<Listener>();
const ackWaiters = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let socket: WebSocket | null = null;
let latest: Snapshot | null = null;
let clockOffset = 0;
let connected = false;
let retry = 0;
let ackSeq = 0;
let started = false;

const connListeners = new Set<(c: boolean) => void>();

function setConnected(v: boolean) {
  connected = v;
  for (const l of connListeners) l(v);
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    retry = 0;
    setConnected(true);
    ws.send(JSON.stringify({ t: 'hello' }));
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.t === 'snapshot') {
      // 时钟对表：服务端时间 - 本地时间
      const sample = msg.serverTime - Date.now();
      clockOffset = latest ? clockOffset * 0.6 + sample * 0.4 : sample;
      // 素材表与状态分开传输，必须并回 state，否则 assetUrl() 永远取不到图
      if (msg.assets) msg.state.assets = msg.assets;
      latest = msg;
      for (const l of listeners) l(msg);
    } else if (msg.t === 'ack' && msg.id) {
      const w = ackWaiters.get(msg.id);
      if (w) {
        ackWaiters.delete(msg.id);
        const d = msg.data;
        if (d && typeof d === 'object' && typeof (d as any).error === 'string') {
          w.reject(new Error((d as any).error));
        } else {
          w.resolve(d);
        }
      }
    } else if (msg.t === 'error') {
      if (msg.id) {
        const w = ackWaiters.get(msg.id);
        if (w) {
          ackWaiters.delete(msg.id);
          w.reject(new Error(msg.message));
        }
      }
      for (const l of errorListeners) l(nextError(msg.message));
    } else if (msg.t === 'log') {
      for (const l of logListeners) l(msg.line);
    }
  };

  ws.onclose = () => {
    setConnected(false);
    socket = null;
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 300 * retry);
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
}

export type ErrItem = { id: number; text: string };

const errorListeners = new Set<(m: ErrItem) => void>();
let errSeq = 0;

/** 生成一条带唯一 id 的错误；界面侧按 id 去重并在超时后移除 */
function nextError(text: string): ErrItem {
  return { id: ++errSeq, text };
}

/** 给任何模块用的错误入口（替代 alert） */
export function pushError(text: string) {
  if (!text) return;
  const item = nextError(text);
  for (const l of errorListeners) l(item);
}
const logListeners = new Set<(l: LogLine) => void>();

export function ensureConnected() {
  if (!started) {
    started = true;
    connect();
  }
}

export function send(type: string, payload: Record<string, unknown> = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ t: 'cmd', type, payload }));
}

export function sendAck<T = any>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('服务未连接'));
    const id = 'c' + ++ackSeq;
    ackWaiters.set(id, { resolve, reject });
    socket.send(JSON.stringify({ t: 'cmd', type, payload, id }));
    setTimeout(() => {
      if (ackWaiters.has(id)) {
        ackWaiters.delete(id);
        reject(new Error('请求超时：' + type));
      }
    }, 8000);
  });
}

/* ------------------------------------------------------------------ Hook */

export function useApp() {
  const [snap, setSnap] = useState<Snapshot | null>(latest);
  const [conn, setConn] = useState(connected);
  const [errors, setErrors] = useState<ErrItem[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    ensureConnected();
    listeners.add(setSnap);
    connListeners.add(setConn);
    const onErr = (m: ErrItem) => {
      setErrors((prev) => {
        if (prev.some((e) => e.id === m.id)) return prev;
        return [...prev.slice(-2), m];
      });
      // 5 秒后自动关闭，避免提示长期挂在主界面上
      const t = window.setTimeout(() => {
        setErrors((prev) => prev.filter((e) => e.id !== m.id));
      }, 5000);
      timers.current.push(t);
    };
    errorListeners.add(onErr);
    return () => {
      listeners.delete(setSnap);
      connListeners.delete(setConn);
      errorListeners.delete(onErr);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  const dismissError = (id?: number) =>
    setErrors((prev) => (typeof id === 'number' ? prev.filter((e) => e.id !== id) : []));

  return { snap, connected: conn, errors, dismissError };
}

export function serverNow() {
  return Date.now() + clockOffset;
}

/** 已进行毫秒（正计时，服务端时间戳换算，不在本地逐秒累加） */
export function elapsedMs(timer: TimerState | undefined | null, now: number) {
  if (!timer) return 0;
  const acc = Math.max(0, timer.accumulatedMs || 0);
  if (timer.phase === 'running' && typeof timer.startedAt === 'number') {
    return acc + Math.max(0, now - timer.startedAt);
  }
  return acc;
}

export function fmtHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 以固定频率刷新，用于计时显示 */
export function useTick(active: boolean, intervalMs = 200) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
}

/* -------------------------------------------------------------- 查询工具 */

export function playerById(state: MatchState | undefined, id: string | null | undefined): Player | null {
  if (!state || !id) return null;
  for (const t of ['A', 'B'] as TeamId[]) {
    const p = state.teams[t]?.players.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

export function teamOfPlayer(state: MatchState | undefined, id: string | null | undefined): Team | null {
  const p = playerById(state, id);
  return p && state ? state.teams[p.teamId] ?? null : null;
}

export function allPlayers(state: MatchState | undefined): Player[] {
  if (!state) return [];
  return [...state.teams.A.players, ...state.teams.B.players];
}

export function assetUrl(state: MatchState | undefined, id: string | null | undefined) {
  if (!state || !id) return null;
  return state.assets[id]?.url ?? null;
}

export function thumbUrl(state: MatchState | undefined, id: string | null | undefined) {
  if (!state || !id) return null;
  const a = state.assets[id];
  return a ? a.thumbUrl || a.url : null;
}

/* ------------------------------------------------------------ 图片处理 */

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解码失败：' + file.name));
    };
    img.src = url;
  });
}

function drawCover(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, mime: string, quality?: number) {
  const data = canvas.toDataURL(mime, quality);
  // 浏览器不支持该格式时会退回 image/png
  return data;
}

export interface PreparedImage {
  dataUrl: string;
  thumbDataUrl: string;
  w: number;
  h: number;
  sourceLabel: string;
}

/** 头像：居中裁切为 1:1，输出 256×256（保留透明通道） */
export async function prepareAvatar(file: File): Promise<PreparedImage> {
  const img = await loadImageFile(file);
  const main = drawCover(img, 256, 256);
  const thumb = drawCover(img, 96, 96);
  return {
    dataUrl: encode(main, 'image/png'),
    thumbDataUrl: encode(thumb, 'image/png'),
    w: img.naturalWidth,
    h: img.naturalHeight,
    sourceLabel: file.name,
  };
}

/** 背景：按 16:9 填充到 1920×1080，WebP 压缩；不保留透明（背景不需要） */
export async function prepareBackground(file: File): Promise<PreparedImage> {
  const img = await loadImageFile(file);
  const main = drawCover(img, 1920, 1080);
  const thumb = drawCover(img, 320, 180);
  const dataUrl = encode(main, 'image/webp', 0.86);
  const thumbDataUrl = encode(thumb, 'image/webp', 0.8);
  return {
    dataUrl: dataUrl.startsWith('data:image/webp') ? dataUrl : encode(main, 'image/jpeg', 0.88),
    thumbDataUrl,
    w: img.naturalWidth,
    h: img.naturalHeight,
    sourceLabel: file.name,
  };
}

export function kb(bytes: number) {
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
}

export function useNow(active: boolean) {
  const now = useMemo(() => serverNow(), [active, Math.floor(Date.now() / 500)]);
  return now;
}