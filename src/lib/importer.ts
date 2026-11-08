import { unzipSync } from 'fflate';
import { prepareAvatar, prepareBackground, sendAck } from './store';

export type AssetKind = 'avatar' | 'background';

export interface ImportProgress {
  total: number;
  done: number;
  ok: number;
  dedup: number;
  skip: number;
  current: string;
  notes: string[];
  running: boolean;
}

export const emptyProgress = (): ImportProgress => ({
  total: 0, done: 0, ok: 0, dedup: 0, skip: 0, current: '', notes: [], running: false
});

const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_ZIP_BYTES = 400 * 1024 * 1024;
const MAX_ENTRIES = 500;

/** 读前 12 字节判魔数，挡掉改扩展名的非图片与 HEIC */
async function sniff(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('89504e47')) return 'png';
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (head.length >= 12) {
    const riff = String.fromCharCode(...head.slice(0, 4));
    const webp = String.fromCharCode(...head.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
  }
  if (hex.startsWith('47494638')) return 'gif';
  if (hex.startsWith('6674797068656963') || hex.startsWith('667479706d696631')) return 'heic';
  return null;
}

function baseName(p: string): string {
  const s = p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'image';
  return s.replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 60);
}

async function sha256OfDataUrl(dataUrl: string): Promise<string> {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function uploadOne(file: File, kind: AssetKind, name: string, p: ImportProgress): Promise<'ok' | 'dedup' | 'skip'> {
  const t = await sniff(file);
  if (t === 'heic') {
    p.skip++; p.notes.push(`${name}：HEIC 不支持，请先导出为 JPG`);
    return 'skip';
  }
  if (!t) {
    p.skip++; p.notes.push(`${name}：不是可识别的图片`);
    return 'skip';
  }
  if (file.size > MAX_FILE) {
    p.skip++; p.notes.push(`${name}：超过 25 MB`);
    return 'skip';
  }
  const prep = kind === 'avatar' ? await prepareAvatar(file) : await prepareBackground(file);
  const sha256 = await sha256OfDataUrl(prep.dataUrl);
  const r: any = await sendAck('asset.upload', {
    kind,
    dataUrl: prep.dataUrl,
    thumbDataUrl: prep.thumbDataUrl,
    w: prep.w,
    h: prep.h,
    name,
    sha256,
    source: '素材库导入'
  });
  const d = (r && r.data) || r || {};
  return d.deduped ? 'dedup' : 'ok';
}

/** 逐张导入（并发 2），每张完成后回调进度 */
export async function importBatch(
  files: File[],
  kind: AssetKind,
  onProgress: (p: ImportProgress) => void,
  signal?: { aborted: boolean }
): Promise<ImportProgress> {
  const list = files.slice(0, MAX_FILES);
  const p = emptyProgress();
  p.total = list.length;
  p.running = true;
  if (files.length > MAX_FILES) p.notes.push(`一次最多导入 ${MAX_FILES} 张，已截断`);
  onProgress({ ...p });

  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      if (signal?.aborted) return;
      const file = list[cursor++];
      p.current = file.name;
      try {
        const res = await uploadOne(file, kind, baseName(file.name), p);
        if (res === 'ok') p.ok++;
        else if (res === 'dedup') p.dedup++;
      } catch (err: any) {
        p.skip++;
        p.notes.push(`${baseName(file.name)}：${err?.message || '导入失败'}`);
      }
      p.done++;
      onProgress({ ...p });
    }
  };
  await Promise.all([worker(), worker()]);
  p.running = false;
  p.current = '';
  onProgress({ ...p });
  return p;
}

/** 从 zip 里取图片，返回 File 列表（不落盘，纯内存解压） */
export async function filesFromZip(zip: File): Promise<{ files: File[]; skipped: string[] }> {
  const skipped: string[] = [];
  if (zip.size > MAX_ZIP_BYTES) throw new Error('压缩包超过 400 MB');
  const buf = new Uint8Array(await zip.arrayBuffer());
  const entries = unzipSync(buf, { filter: (f: any) => f.size > 0 } as any);
  const names = Object.keys(entries);
  if (names.length > MAX_ENTRIES) throw new Error(`压缩包条目过多（${names.length} > ${MAX_ENTRIES}）`);
  const out: File[] = [];
  for (const raw of names) {
    const clean = raw.replace(/\\/g, '/');
    if (clean.endsWith('/')) continue;
    const nm = baseName(clean);
    if (!IMG_EXT.test(nm) || nm.startsWith('._')) { skipped.push(nm); continue; }
    const bytes = entries[raw];
    if (bytes.length > MAX_FILE) { skipped.push(nm + '（过大）'); continue; }
    const copy = new Uint8Array(bytes);
    out.push(new File([copy.buffer as ArrayBuffer], nm, { type: 'application/octet-stream' }));
  }
  return { files: out, skipped };
}

export async function filesFromZipFile(file: File): Promise<File[]> {
  const { files } = await filesFromZip(file);
  return files;
}

export const IMPORT_LIMITS = { MAX_FILE, MAX_FILES, MAX_ZIP_BYTES, MAX_ENTRIES };