import { useEffect, useState } from 'react';
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { LOSS_REASONS } from './constants';

type Props = {
  open: boolean;
  /** Lý do đã lưu trước đó (nếu sửa lại) — prefill ô ghi chú. */
  current?: string;
  onClose: () => void;
  /** reason = chuỗi gộp (lý do chính — đối thủ — ghi chú); '' = không nêu lý do. */
  onConfirm: (reason: string) => void;
};

/**
 * Hỏi lý do thua deal có CẤU TRÚC (thay `window.prompt`): chọn 1 lý do chính từ
 * `LOSS_REASONS` (để thống kê win/loss) + ô đối thủ thắng + ghi chú tự do.
 * Cho phép xác nhận khi rỗng (= không nêu lý do, giữ ngữ nghĩa cũ).
 */
export function LossReasonDialog({ open, current, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) { setReason(''); setCompetitor(''); setNote(current ?? ''); }
  }, [open, current]);

  const build = () => {
    const parts: string[] = [];
    if (reason) parts.push(reason);
    if (competitor.trim()) parts.push(`đối thủ: ${competitor.trim()}`);
    if (note.trim()) parts.push(note.trim());
    return parts.join(' — ');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Lý do không thành công</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <div>
            <Typography fontSize={13} fontWeight={700} color="text.secondary" mb={1}>
              Chọn lý do chính (để thống kê)
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {LOSS_REASONS.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  clickable
                  color={reason === r ? 'primary' : 'default'}
                  variant={reason === r ? 'filled' : 'outlined'}
                  onClick={() => setReason((cur) => (cur === r ? '' : r))}
                />
              ))}
            </Stack>
          </div>
          <TextField
            size="small" label="Đối thủ thắng (nếu có)" value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
          />
          <TextField
            size="small" label="Ghi chú thêm (tuỳ chọn)" value={note}
            onChange={(e) => setNote(e.target.value)} multiline rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => onConfirm(build())}>Xác nhận</Button>
      </DialogActions>
    </Dialog>
  );
}
