import { createTheme, type Theme } from '@mui/material/styles';
import type { Density, ResolvedThemeMode } from '@/lib/uiPrefs';

/**
 * Shared legacy (public/legacy.html) visual tokens, reused across the quote UI.
 *
 * Các giá trị là CSS variables (định nghĩa ở `global.css`) để dark mode đổi màu
 * TOÀN BỘ điểm dùng chỉ bằng thuộc tính `data-theme` trên <html> — 122 chỗ dùng
 * LEGACY trong components tự ăn theo, không phải sửa từng nơi.
 * KHÔNG dùng các token này trong ngữ cảnh ngoài CSS (canvas/PDF export) —
 * exports có bảng màu riêng ở `src/lib/exports/brand.ts`.
 */
export const LEGACY = {
  /** Signature teal header / primary-button gradient. */
  headerGradient: 'var(--vte-header-gradient)',
  /** Page background — exact legacy body gradient (soft teal/mint). */
  pageBg: 'var(--vte-page-bg)',
  /** Translucent "glass" surface used for cards/toolbars on the mint page. */
  glassBg: 'var(--vte-glass-bg)',
  navy: 'var(--vte-navy)',
  teal: 'var(--vte-teal)',
  tealLight: 'var(--vte-teal-light)',
  gold: 'var(--vte-gold)',
} as const;

/**
 * Theme MUI theo tùy chọn cá nhân (Cài đặt cá nhân → Giao diện).
 * `mode` là mode ĐÃ RESOLVE ('system' được quy về light/dark ở App.tsx).
 * `density: 'compact'` thu nhỏ chữ + padding bảng để nhìn được nhiều dòng hơn.
 */
export function buildTheme(mode: ResolvedThemeMode, density: Density): Theme {
  const dark = mode === 'dark';
  const compact = density === 'compact';
  return createTheme({
    palette: dark
      ? {
          mode: 'dark',
          primary: { main: '#1cb59d' },
          secondary: { main: '#e0566f' },
          background: { default: '#0e1614', paper: '#17211e' },
          text: { primary: '#dfeae7', secondary: 'rgba(223,234,231,0.68)' },
          divider: 'rgba(223,234,231,0.14)',
        }
      : {
          mode: 'light',
          primary: { main: '#0d7a6a' },
          secondary: { main: '#dc3250' },
          background: { default: '#f5f6f8' },
          text: { primary: '#0f3a4a' },
        },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      h6: { fontWeight: 700 },
      ...(compact ? { fontSize: 13 } : {}),
    },
    shape: { borderRadius: 8 },
    components: {
      // Legacy-style toggle: round white thumb, solid grey track (off) /
      // solid teal track (on) — applied to every MUI Switch in the app.
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            color: '#fff',
            '&.Mui-checked': { color: '#fff' },
            '&.Mui-checked + .MuiSwitch-track': {
              backgroundColor: dark ? '#1cb59d' : '#0d7a6a',
              opacity: 1,
            },
          },
          thumb: { boxShadow: '0 1px 3px rgba(0,0,0,0.25)' },
          track: {
            backgroundColor: dark ? 'rgba(223,234,231,0.3)' : 'rgba(15,58,74,0.25)',
            opacity: 1,
          },
        },
      },
      ...(compact
        ? { MuiTableCell: { styleOverrides: { root: { padding: '4px 8px' } } } }
        : {}),
    },
  });
}
