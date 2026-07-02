/**
 * Tùy chọn GIAO DIỆN theo từng user (Cài đặt cá nhân): chế độ sáng/tối + mật độ.
 * Logic thuần — store lưu/đồng bộ ở `src/stores/uiPrefStore.ts`.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export interface UiPrefs {
  /** Chế độ màu: sáng / tối / theo hệ điều hành. */
  mode: ThemeMode;
  /** Mật độ hiển thị: thoải mái (mặc định) / gọn (chữ nhỏ + bảng sít hơn). */
  density: Density;
}

export const DEFAULT_UI_PREFS: UiPrefs = { mode: 'light', density: 'comfortable' };

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

/** Chuẩn hoá blob thô (localStorage/cloud, có thể cũ/sai hình dạng) về UiPrefs hợp lệ. */
export function normalizeUiPrefs(raw: unknown): UiPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_UI_PREFS };
  const o = raw as Record<string, unknown>;
  const mode = MODES.includes(o.mode as ThemeMode) ? (o.mode as ThemeMode) : DEFAULT_UI_PREFS.mode;
  const density = DENSITIES.includes(o.density as Density)
    ? (o.density as Density)
    : DEFAULT_UI_PREFS.density;
  return { mode, density };
}

/** Quy 'system' về light/dark theo prefers-color-scheme của máy. */
export function resolveThemeMode(mode: ThemeMode, systemDark: boolean): ResolvedThemeMode {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** Tùy chọn khác mặc định? (chỉ đẩy cloud lần đầu khi user THẬT SỰ đã chỉnh gì đó). */
export function isDefaultUiPrefs(p: UiPrefs): boolean {
  return p.mode === DEFAULT_UI_PREFS.mode && p.density === DEFAULT_UI_PREFS.density;
}
