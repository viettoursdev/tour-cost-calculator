import { Suspense, lazy } from 'react';
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import { MainApp } from './components/shell/MainApp';

const PublicQuoteView = lazy(() => import('./components/public/PublicQuoteView').then((m) => ({ default: m.PublicQuoteView })));

export default function App() {
  // Link chia sẻ báo giá cho khách (?share=<token>) → trang công khai, KHÔNG đăng nhập.
  const shareToken = new URLSearchParams(window.location.search).get('share');
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {shareToken ? (
        <Suspense fallback={<Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0369a1' }} /></Box>}>
          <PublicQuoteView token={shareToken} />
        </Suspense>
      ) : (
        <MainApp />
      )}
    </ThemeProvider>
  );
}
