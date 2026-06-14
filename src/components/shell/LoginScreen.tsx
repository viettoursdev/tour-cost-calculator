import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuthStore } from '@/stores/authStore';
import { getRememberedEmail, setRememberedEmail } from '@/auth/rememberedEmail';
import { VTE_LOGO } from '@/lib/exports/vteLogo';

const RESEND_SECONDS = 60;

export function LoginScreen() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const pendingCrossDeviceUrl = useAuthStore((s) => s.pendingCrossDeviceUrl);
  const authError = useAuthStore((s) => s.authError);

  const [email, setEmail] = useState(() => getRememberedEmail() ?? '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Auto-clear inline error after 3s (legacy parity).
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 3000);
    return () => clearTimeout(t);
  }, [err]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submitNewLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().requestSignInLink(email.trim());
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
    setCooldown(RESEND_SECONDS);
  }

  async function submitCrossDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn(email.trim());
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
  }

  const containerSx = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'background.default',
  };
  const paperSx = { p: 4, width: 420 };
  const header = (
    <Box sx={{ textAlign: 'center', mb: 2.5 }}>
      <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 40, width: 'auto', mb: 0.75 }} />
      <Typography variant="caption" color="text.secondary" display="block">
        Bảng tính chi phí tour
      </Typography>
    </Box>
  );

  // ── State 3: Cross-device confirmation ──
  if (pendingCrossDeviceUrl) {
    return (
      <Box sx={containerSx}>
        <Paper sx={paperSx} component="form" onSubmit={submitCrossDevice}>
          {header}
          <Typography sx={{ fontSize: 20, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
            Xác nhận đăng nhập
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Bạn vừa bấm vào link đăng nhập từ thiết bị khác. Vui lòng nhập lại email công ty để xác nhận.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Email công ty"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus required autoComplete="email"
              placeholder="vd: sale4@viettours.com.vn"
            />
            {err && <Alert severity="error">{err}</Alert>}
            <Button type="submit" variant="contained" disabled={busy || !email}>
              {busy ? 'Đang xác minh…' : 'Xác nhận'}
            </Button>
            <Button onClick={() => useAuthStore.getState().cancelPendingSignIn()}>
              Huỷ
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ── State 2: Link sent ──
  if (pendingEmail) {
    return (
      <Box sx={containerSx}>
        <Paper sx={paperSx}>
          {header}
          <Typography sx={{ fontSize: 20, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
            Đã gửi link đăng nhập
          </Typography>
          <Alert severity="success" sx={{ mb: 2 }}>
            Đã gửi link đăng nhập đến <strong>{pendingEmail}</strong>. Vui lòng mở email và bấm vào liên kết để hoàn tất.
          </Alert>
          <Stack spacing={1.5}>
            <Button
              variant="outlined"
              disabled={cooldown > 0 || busy}
              onClick={async () => {
                setBusy(true);
                const out = await useAuthStore.getState().requestSignInLink(pendingEmail);
                setBusy(false);
                if (out.ok) setCooldown(RESEND_SECONDS);
                else setErr(out.error);
              }}
            >
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại link'}
            </Button>
            <Button onClick={() => useAuthStore.getState().cancelPendingSignIn()}>
              Đổi email
            </Button>
            {err && <Alert severity="error">{err}</Alert>}
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ── State 1: Email form + DEV-only password panel ──
  return (
    <Box sx={containerSx}>
      <Paper sx={paperSx}>
        {header}
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
          Đăng nhập hệ thống
        </Typography>
        {authError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {authError}
          </Alert>
        )}
        <Box component="form" onSubmit={submitNewLink}>
          <Stack spacing={2}>
            <TextField
              label="Email công ty"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus required autoComplete="email"
              placeholder="vd: sale4@viettours.com.vn"
              helperText="Bạn sẽ nhận được link đăng nhập qua email."
            />
            {err && <Alert severity="error">{err}</Alert>}
            <Button type="submit" variant="contained" disabled={busy || !email}>
              {busy ? 'Đang gửi…' : 'Gửi link đăng nhập'}
            </Button>
          </Stack>
        </Box>
        {import.meta.env.DEV && (
          <Accordion sx={{ mt: 2.5, bgcolor: 'rgba(245,166,35,0.08)' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="caption" fontWeight={700} color="warning.main">
                Đăng nhập bằng mật khẩu (dev only)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="form" onSubmit={submitPassword}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Email công ty"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    size="small"
                    placeholder="vd: ceo@viettours.com.vn"
                    autoComplete="email"
                  />
                  <TextField
                    label="Mật khẩu (Firebase Auth)"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    size="small"
                    autoComplete="current-password"
                  />
                  <Button
                    type="submit"
                    variant="outlined"
                    size="small"
                    disabled={busy || !email || !password}
                  >
                    {busy ? 'Đang đăng nhập…' : 'Đăng nhập (dev)'}
                  </Button>
                  <Alert severity="info" sx={{ fontSize: 11 }}>
                    Tài khoản được tạo trong Firebase Console (Authentication → Users). Khác với cột "Mật khẩu" plaintext cũ — đó là legacy, sẽ xoá ở Phase 4.
                  </Alert>
                </Stack>
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </Paper>
    </Box>
  );
}
