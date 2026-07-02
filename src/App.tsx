import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Box, CircularProgress, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { buildTheme } from './theme';
import { resolveThemeMode } from './lib/uiPrefs';
import { useUiPrefStore } from './stores/uiPrefStore';
import { MainApp } from './components/shell/MainApp';

const PublicQuoteView = lazy(() => import('./components/public/PublicQuoteView').then((m) => ({ default: m.PublicQuoteView })));
const PublicVisaListView = lazy(() => import('./components/public/PublicVisaListView').then((m) => ({ default: m.PublicVisaListView })));
const PublicWorkflowView = lazy(() => import('./components/public/PublicWorkflowView').then((m) => ({ default: m.PublicWorkflowView })));

const publicFallback = (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0d7a6a' }} /></Box>
);

export default function App() {
  // Trang công khai cho khách (KHÔNG đăng nhập):
  //  ?share=<token> → báo giá · ?visa=<token> → danh sách visa · ?wf=<token> → tiến độ tour.
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get('share');
  const visaToken = params.get('visa');
  const wfToken = params.get('wf');
  const isPublic = !!(shareToken || visaToken || wfToken);

  // Giao diện theo Cài đặt cá nhân (uiPrefStore nạp theo user ở MainApp).
  // Trang công khai LUÔN sáng + mật độ chuẩn — khách hàng không có tùy chọn.
  const prefs = useUiPrefStore((s) => s.prefs);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const mode = isPublic ? 'light' : resolveThemeMode(prefs.mode, systemDark);
  const density = isPublic ? 'comfortable' : prefs.density;
  const theme = useMemo(() => buildTheme(mode, density), [mode, density]);

  // data-theme trên <html> lái toàn bộ CSS variables (LEGACY tokens) sang dark.
  // `vte_theme_last` cho inline script ở index.html paint đúng màu ngay khi reload.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem('vte_theme_last', mode); } catch { /* quota */ }
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {shareToken ? (
        <Suspense fallback={publicFallback}><PublicQuoteView token={shareToken} /></Suspense>
      ) : visaToken ? (
        <Suspense fallback={publicFallback}><PublicVisaListView token={visaToken} /></Suspense>
      ) : wfToken ? (
        <Suspense fallback={publicFallback}><PublicWorkflowView token={wfToken} /></Suspense>
      ) : (
        <MainApp />
      )}
    </ThemeProvider>
  );
}
