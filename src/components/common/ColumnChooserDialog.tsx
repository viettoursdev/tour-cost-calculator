import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { TableColPref } from '@/lib/tableColumnPrefs';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Cột CHỌN ĐƯỢC, đúng thứ tự đang hiển thị (không gồm cột khoá). */
  columns: { key: string; label: string }[];
  /** Nhãn các cột khoá luôn hiển thị (chỉ để hiện chú thích). */
  lockedLabels?: string[];
  hidden: Set<string>;
  /** Gọi mỗi thao tác (tự lưu như các modal tùy chỉnh khác). */
  onChange: (pref: TableColPref) => void;
  onReset: () => void;
};

/**
 * Hộp thoại chọn CỘT HIỂN THỊ dùng chung cho các bảng lớn (UI kiểu VisaExportDialog):
 * tick ẩn/hiện + mũi tên đổi thứ tự, lưu theo user qua `tableColPrefStore`.
 */
export function ColumnChooserDialog({
  open, onClose, title, columns, lockedLabels, hidden, onChange, onReset,
}: Props) {
  const order = columns.map((c) => c.key);
  const emit = (nextOrder: string[], nextHidden: Set<string>) =>
    onChange({ order: nextOrder, hidden: [...nextHidden] });

  const toggle = (k: string) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k); else next.add(k);
    emit(order, next);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[idx], next[j]] = [next[j], next[idx]];
    emit(next, hidden);
  };

  const shownCount = order.filter((k) => !hidden.has(k)).length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        {title ?? 'Cột hiển thị'}
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>
          Tick để ẩn/hiện, mũi tên đổi thứ tự — tự lưu cho riêng bạn, đồng bộ mọi thiết bị.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {!!lockedLabels?.length && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.75 }}>
            🔒 Luôn hiển thị: {lockedLabels.join(' · ')}
          </Typography>
        )}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, maxHeight: 360, overflowY: 'auto' }}>
          {columns.map((c, idx) => {
            const on = !hidden.has(c.key);
            return (
              <Stack key={c.key} direction="row" alignItems="center" spacing={0.5}
                sx={{ px: 1, py: 0.25, borderBottom: idx < columns.length - 1 ? '1px solid' : 'none', borderColor: 'divider', bgcolor: on ? 'transparent' : 'action.hover' }}>
                <Checkbox size="small" checked={on} onChange={() => toggle(c.key)} sx={{ p: 0.5 }}
                  disabled={on && shownCount <= 1} />
                <Typography variant="body2" sx={{ flex: 1, fontWeight: on ? 600 : 400, color: on ? 'text.primary' : 'text.disabled' }}>
                  {c.label}
                </Typography>
                <IconButton size="small" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUpwardIcon fontSize="inherit" />
                </IconButton>
                <IconButton size="small" disabled={idx === columns.length - 1} onClick={() => move(idx, 1)}>
                  <ArrowDownwardIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
        <Button onClick={onReset} startIcon={<RestartAltIcon />} color="inherit" size="small">
          Khôi phục mặc định
        </Button>
        <Button onClick={onClose} variant="contained" size="small">Xong</Button>
      </DialogActions>
    </Dialog>
  );
}
