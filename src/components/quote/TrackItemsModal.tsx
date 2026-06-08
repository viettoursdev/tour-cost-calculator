import { useMemo } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Typography,
} from '@mui/material';
import type { CategoryId, PaymentItem } from '@/types';
import { fmtVND } from './calc';

type Group = {
  label: string;
  icon: string;
  color: string;
  items: PaymentItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: PaymentItem[];
  onToggle: (key: string) => void;
};

export function TrackItemsModal({ open, onClose, items, onToggle }: Props) {
  const groups = useMemo(() => {
    const map = new Map<CategoryId, Group>();
    items.forEach((it) => {
      const g = map.get(it.catId) ?? { label: it.catLabel, icon: it.catIcon, color: it.catColor, items: [] };
      g.items.push(it);
      map.set(it.catId, g);
    });
    return Array.from(map.entries());
  }, [items]);

  const trackedCount = items.filter((i) => i.tracked).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>⚙️ Quản lý hạng mục theo dõi</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Chọn các khoản chi phí cần quản lý thanh toán · {trackedCount}/{items.length} đang theo dõi
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ maxHeight: '60vh' }}>
        {items.length === 0 && (
          <Box sx={{ textAlign: 'center', p: 4, color: 'text.disabled' }}>
            Chưa có chi phí nào. Hãy nhập trong tab "Bảng chi phí" trước.
          </Box>
        )}
        {groups.map(([catId, grp]) => {
          const catTracked = grp.items.filter((i) => i.tracked).length;
          const allOn = catTracked === grp.items.length;
          const handleBulk = () => {
            grp.items.forEach((i) => {
              if (allOn ? i.tracked : !i.tracked) onToggle(i.key);
            });
          };
          return (
            <Box key={catId} sx={{ mb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography fontSize={16}>{grp.icon}</Typography>
                <Typography fontWeight={800} sx={{ color: grp.color, flex: 1 }}>{grp.label}</Typography>
                <Typography variant="caption" color="text.disabled">{catTracked}/{grp.items.length}</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color={allOn ? 'error' : 'success'}
                  onClick={handleBulk}
                  sx={{ minWidth: 0, px: 1.5, py: 0.25, fontSize: 11 }}
                >
                  {allOn ? 'Bỏ tất cả' : 'Chọn tất cả'}
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {grp.items.map((it) => (
                  <Box
                    key={it.key}
                    component="label"
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1,
                      borderRadius: 1.5, cursor: 'pointer',
                      bgcolor: it.tracked ? 'rgba(168,230,221,0.18)' : 'rgba(15,58,74,0.03)',
                      border: '1px solid',
                      borderColor: it.tracked ? 'rgba(20,150,140,0.2)' : 'rgba(15,58,74,0.06)',
                    }}
                  >
                    <Checkbox
                      checked={it.tracked}
                      onChange={() => onToggle(it.key)}
                      sx={{ p: 0.5, color: grp.color, '&.Mui-checked': { color: grp.color } }}
                    />
                    <Typography
                      sx={{
                        flex: 1, fontSize: 13,
                        color: it.tracked ? 'text.primary' : 'text.disabled',
                        fontWeight: it.tracked ? 600 : 400,
                      }}
                    >
                      {it.name}
                      {it.custom && (
                        <Chip
                          label="Tự tạo"
                          size="small"
                          sx={{ ml: 1, height: 18, fontSize: 9, fontWeight: 700,
                                bgcolor: 'rgba(245,166,35,0.15)', color: '#d18a13' }}
                        />
                      )}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: 13, color: it.tracked ? grp.color : 'text.disabled' }}>
                      {fmtVND(it.amount)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">Xong</Button>
      </DialogActions>
    </Dialog>
  );
}
