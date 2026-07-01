import { Suspense, lazy } from 'react';
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
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
