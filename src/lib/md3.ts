/**
 * Material Design 3 动态配色
 *
 * 用官方 material-color-utilities 从「种子色」推导出整套 MD3 色彩角色，
 * 而不是手写一堆近似值。生成结果写成 --md-sys-color-* 变量挂到 :root，
 * 控制台与叠加层共用同一份，因此换主题色时两边同步。
 */
import {
  TonalPalette,
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities';

export type ThemeMode = 'dark' | 'light';

export interface ThemePreset {
  id: string;
  name: string;
  seed: string;
}

/** 预设种子色：都是 MD3 里常用的基调，A/B 队色不随之改变（队色是语义色） */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'indigo', name: '靛蓝', seed: '#4F6BED' },
  { id: 'teal', name: '青碧', seed: '#128A8A' },
  { id: 'amber', name: '琥珀', seed: '#C97A16' },
  { id: 'magenta', name: '品红', seed: '#B0316F' },
  { id: 'forest', name: '森绿', seed: '#3C7A46' },
  { id: 'violet', name: '紫晶', seed: '#7A4FD0' },
];

export const DEFAULT_SEED = THEME_PRESETS[0].seed;

function toneOf(palette: TonalPalette, tone: number): string {
  return hexFromArgb(palette.tone(tone));
}

/** 生成 MD3 色彩角色表（键为 CSS 变量后缀，如 primary / surfaceContainerHigh） */
export function buildScheme(seedHex: string, mode: ThemeMode): Record<string, string> {
  const safeSeed = /^#[0-9a-f]{6}$/i.test(seedHex) ? seedHex : DEFAULT_SEED;
  const theme = themeFromSourceColor(argbFromHex(safeSeed));
  const p = theme.palettes;
  const neutral = p.neutral;
  const neutralVariant = p.neutralVariant;
  const secondary = p.secondary;
  const tertiary = p.tertiary;
  const error = p.error;

  if (mode === 'dark') {
    return {
      primary: toneOf(p.primary, 80),
      onPrimary: toneOf(p.primary, 20),
      primaryContainer: toneOf(p.primary, 30),
      onPrimaryContainer: toneOf(p.primary, 90),
      secondary: toneOf(secondary, 80),
      onSecondary: toneOf(secondary, 20),
      secondaryContainer: toneOf(secondary, 30),
      onSecondaryContainer: toneOf(secondary, 90),
      tertiary: toneOf(tertiary, 80),
      onTertiary: toneOf(tertiary, 20),
      tertiaryContainer: toneOf(tertiary, 30),
      onTertiaryContainer: toneOf(tertiary, 90),
      error: toneOf(error, 80),
      onError: toneOf(error, 20),
      errorContainer: toneOf(error, 30),
      onErrorContainer: toneOf(error, 90),
      surfaceDim: toneOf(neutral, 6),
      surface: toneOf(neutral, 6),
      surfaceBright: toneOf(neutral, 24),
      surfaceContainerLowest: toneOf(neutral, 4),
      surfaceContainerLow: toneOf(neutral, 10),
      surfaceContainer: toneOf(neutral, 12),
      surfaceContainerHigh: toneOf(neutral, 17),
      surfaceContainerHighest: toneOf(neutral, 22),
      onSurface: toneOf(neutral, 90),
      onSurfaceVariant: toneOf(neutralVariant, 80),
      outline: toneOf(neutralVariant, 60),
      outlineVariant: toneOf(neutralVariant, 30),
      inverseSurface: toneOf(neutral, 90),
      inverseOnSurface: toneOf(neutral, 20),
      inversePrimary: toneOf(p.primary, 40),
      scrim: '#000000',
      shadow: '#000000',
    };
  }

  return {
    primary: toneOf(p.primary, 40),
    onPrimary: '#FFFFFF',
    primaryContainer: toneOf(p.primary, 90),
    onPrimaryContainer: toneOf(p.primary, 10),
    secondary: toneOf(secondary, 40),
    onSecondary: '#FFFFFF',
    secondaryContainer: toneOf(secondary, 90),
    onSecondaryContainer: toneOf(secondary, 10),
    tertiary: toneOf(tertiary, 40),
    onTertiary: '#FFFFFF',
    tertiaryContainer: toneOf(tertiary, 90),
    onTertiaryContainer: toneOf(tertiary, 10),
    error: toneOf(error, 40),
    onError: '#FFFFFF',
    errorContainer: toneOf(error, 90),
    onErrorContainer: toneOf(error, 10),
    surfaceDim: toneOf(neutral, 87),
    surface: toneOf(neutral, 98),
    surfaceBright: toneOf(neutral, 98),
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: toneOf(neutral, 96),
    surfaceContainer: toneOf(neutral, 94),
    surfaceContainerHigh: toneOf(neutral, 92),
    surfaceContainerHighest: toneOf(neutral, 90),
    onSurface: toneOf(neutral, 10),
    onSurfaceVariant: toneOf(neutralVariant, 30),
    outline: toneOf(neutralVariant, 50),
    outlineVariant: toneOf(neutralVariant, 80),
    inverseSurface: toneOf(neutral, 20),
    inverseOnSurface: toneOf(neutral, 95),
    inversePrimary: toneOf(p.primary, 80),
    scrim: '#000000',
    shadow: '#000000',
  };
}

export function schemeToCss(scheme: Record<string, string>): string {
  return Object.entries(scheme)
    .map(([k, v]) => `  --md-sys-color-${kebab(k)}: ${v};`)
    .join('\n');
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/** 把配色与模式写入文档，控制台和叠加层都调用它 */
export function applyTheme(seed: string, mode: ThemeMode = 'dark') {
  const scheme = buildScheme(seed, mode);
  const root = document.documentElement;
  root.style.setProperty('color-scheme', mode);
  for (const [k, v] of Object.entries(scheme)) {
    root.style.setProperty(`--md-sys-color-${kebab(k)}`, v);
  }
  root.dataset.mdMode = mode;
  root.dataset.mdSeed = seed;
}

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}