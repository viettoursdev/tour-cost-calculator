import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d7a6a' },
    secondary: { main: '#dc3250' },
    background: { default: '#f5f6f8' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
});
