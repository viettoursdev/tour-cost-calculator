import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-clear error after 3s (legacy parity at public/legacy.html:2450).
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 3000);
    return () => clearTimeout(t);
  }, [err]);

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
      <Paper sx={{ p: 4, width: 380 }} component="form" onSubmit={onSubmit}>
        <Box sx={{ textAlign: 'center', mb: 2.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0d7a6a' }}>
            VIETTOURS
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Bảng tính chi phí tour
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
          Đăng nhập hệ thống
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
        {/* Demo credential hint shown only in local dev builds. Production builds
            strip this block at compile time (Vite replaces import.meta.env.DEV
            with `false` and DCE eliminates the unreachable branch). */}
        {import.meta.env.DEV && (
          <Alert severity="info" sx={{ mt: 2.5, fontSize: 12 }}>
            <strong>Tài khoản demo (dev only):</strong> ceo / ceo123 · manager1 / mgr123 · sale1 / sale123
          </Alert>
        )}
      </Paper>
    </Box>
  );
}
