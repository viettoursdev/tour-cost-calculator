import { createTheme } from '@mui/material/styles';

/** Shared legacy (public/legacy.html) visual tokens, reused across the quote UI. */
export const LEGACY = {
  /** Signature teal header / primary-button gradient. */
  headerGradient: 'linear-gradient(135deg,#0d7a6a,#14a08c)',
  /** Deep teal page background (legacy hero gradient) — dark enough that white
   *  "glass" cards stand out clearly on top. */
  pageBg: 'linear-gradient(135deg,#0a5c50 0%,#0d7a6a 50%,#14a08c 100%)',
  /** Translucent "glass" surface used for cards/toolbars on the mint page. */
  glassBg: 'rgba(255,255,255,0.92)',
  navy: '#0f3a4a',
  teal: '#0d7a6a',
  tealLight: '#14a08c',
  gold: '#ffe082',
} as const;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d7a6a' },
    secondary: { main: '#dc3250' },
    background: { default: '#f5f6f8' },
    text: { primary: LEGACY.navy },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
});
