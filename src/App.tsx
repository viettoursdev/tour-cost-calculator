import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import { MainApp } from './components/shell/MainApp';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainApp />
    </ThemeProvider>
  );
}
