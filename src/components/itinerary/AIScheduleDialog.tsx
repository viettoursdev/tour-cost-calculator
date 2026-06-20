import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { AiButton } from '@/components/common/AiButton';
import { generateSchedule, genToDays, type GenDay } from './aiSchedule';
import type { Day } from '@/types';

/** AI dựng nhanh khung lịch trình từ mô tả ngắn → áp dụng vào schedule. */
export function AIScheduleDialog({ open, onClose, defaultDestination, defaultDays, hasSchedule, onApply }: {
  open: boolean;
  onClose: () => void;
  defaultDestination: string;
  defaultDays: number;
  hasSchedule: boolean;
  onApply: (days: Day[], mode: 'replace' | 'append') => void;
}) {
  const [destination, setDestination] = useState(defaultDestination);
  const [days, setDays] = useState(defaultDays || 4);
  const [style, setStyle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenDay[] | null>(null);

  const run = () => {
    setBusy(true); setError(null); setResult(null);
    generateSchedule({ destination, days, style })
      .then(setResult)
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };
  const apply = (mode: 'replace' | 'append') => {
    if (!result) return;
    onApply(genToDays(result, mode === 'append' ? defaultDays + 1 : 1), mode);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>✨ AI dựng nhanh lịch trình</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
          <TextField label="Điểm đến" size="small" fullWidth value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="VD: Đà Nẵng – Hội An" />
          <TextField label="Số ngày" type="number" size="small" value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, +e.target.value || 1)))} sx={{ width: 110 }} />
        </Stack>
        <TextField label="Phong cách (tuỳ chọn)" size="small" fullWidth value={style} onChange={(e) => setStyle(e.target.value)}
          placeholder="VD: nghỉ dưỡng / khám phá / MICE / ẩm thực…" sx={{ mb: 1.5 }} />
        <AiButton onClick={run} disabled={busy || !destination.trim()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {busy ? 'Đang dựng…' : result ? 'Dựng lại' : 'Dựng khung lịch trình'}
        </AiButton>

        {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run}>Thử lại</Button>}>{error}</Alert>}

        {result && !busy && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">XEM TRƯỚC {result.length} NGÀY (chỉnh lại sau khi áp dụng):</Typography>
            <Stack spacing={1} sx={{ mt: 0.75, maxHeight: 300, overflowY: 'auto' }}>
              {result.map((d, i) => (
                <Box key={i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
                  <Typography variant="body2" fontWeight={800}>Ngày {i + 1}: {d.title || '(chưa có tiêu đề)'}</Typography>
                  {d.activities.map((a, j) => (
                    <Typography key={j} variant="body2" color="text.secondary" sx={{ pl: 1 }}>{a.time ? `${a.time} — ` : '• '}{a.text}</Typography>
                  ))}
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>⚠ Khung do AI tạo — hãy kiểm tra & chỉnh lại trước khi gửi khách.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Đóng</Button>
        {result && hasSchedule && <Button onClick={() => apply('append')}>Thêm vào cuối</Button>}
        {result && (
          <Button variant="contained" onClick={() => apply('replace')} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            {hasSchedule ? 'Thay toàn bộ' : 'Áp dụng'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
