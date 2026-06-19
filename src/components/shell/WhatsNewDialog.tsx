import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { WHATS_NEW, type WhatsNewEntry } from '@/lib/whatsNew';
import { LEGACY } from '@/theme';

/** Hiển thị nhật ký "Có gì mới". `entries` mặc định = toàn bộ (khi mở thủ công). */
export function WhatsNewDialog({ open, onClose, entries }: {
  open: boolean;
  onClose: () => void;
  entries?: WhatsNewEntry[];
}) {
  const list = entries ?? WHATS_NEW;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', px: 3, py: 2 }}>
        <Typography variant="h6" fontWeight={900}>✨ Có gì mới</Typography>
        <Typography variant="caption" sx={{ opacity: 0.9 }}>Các tính năng vừa được cập nhật</Typography>
      </Box>
      <DialogContent dividers sx={{ maxHeight: '70vh' }}>
        {list.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Chưa có cập nhật mới.</Typography>
        ) : (
          <Stack spacing={2.5}>
            {list.map((e) => (
              <Box key={e.id}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                  <Typography fontWeight={800} color={LEGACY.navy}>{e.title}</Typography>
                  <Typography variant="caption" color="text.disabled">{e.date}</Typography>
                </Stack>
                <Stack spacing={1.25}>
                  {e.items.map((it, i) => (
                    <Stack key={i} direction="row" spacing={1.25} alignItems="flex-start">
                      <Typography sx={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>{it.icon}</Typography>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>{it.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{it.desc}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={onClose} sx={{ background: LEGACY.headerGradient, fontWeight: 700 }}>Đã hiểu</Button>
      </DialogActions>
    </Dialog>
  );
}
