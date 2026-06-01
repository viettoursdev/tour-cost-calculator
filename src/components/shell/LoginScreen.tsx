import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const result = await login(u.trim(), p);
    setBusy(false);
    if (!result.ok) setErr(result.error);
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={onSubmit}>
        <Typography variant="h6" gutterBottom>
          Đăng nhập — Viettours
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Tài khoản"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoFocus
            required
            autoComplete="username"
          />
          <TextField
            label="Mật khẩu"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            required
            autoComplete="current-password"
          />
          {err && <Alert severity="error">{err}</Alert>}
          <Button type="submit" variant="contained" disabled={busy || !u || !p}>
            {busy ? 'Đang xử lý…' : 'Đăng nhập'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
