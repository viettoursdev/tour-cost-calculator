import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Radio, RadioGroup, Typography,
} from '@mui/material';
import MergeTypeIcon from '@mui/icons-material/MergeType';

export type MergeItem = {
  id: string;
  name: string;
  /** Dòng mô tả phụ (vd: "3 liên hệ · 2 lần chăm sóc"). */
  detail: string;
  /** Dòng meta phụ (vd: "Tạo bởi …"). */
  meta?: string;
};

/**
 * Hộp thoại gộp nhiều bản trùng thành 1. Người dùng chọn 1 bản giữ làm "bản chính";
 * các trường cơ bản lấy theo bản chính, còn liên hệ/ghi chú/lịch sử của tất cả được gộp lại.
 * Logic gộp thực tế nằm trong store (`merge`), component này chỉ chọn `primaryId`.
 */
export function MergeDialog({
  open, title, kindLabel, items, onClose, onConfirm,
}: {
  open: boolean;
  title: string;
  kindLabel: string; // "khách hàng" | "nhà cung cấp"
  items: MergeItem[];
  onClose: () => void;
  onConfirm: (primaryId: string) => void;
}) {
  const [picked, setPicked] = useState(items[0]?.id ?? '');
  const primaryId = items.some((i) => i.id === picked) ? picked : (items[0]?.id ?? '');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Gộp <strong>{items.length} {kindLabel}</strong> thành 1. Các trường cơ bản (tên,
          địa chỉ…) lấy từ <strong>bản chính</strong>; <strong>liên hệ, ghi chú, lịch sử</strong>{' '}
          của tất cả được gộp lại. Các bản còn lại sẽ bị <strong>xoá</strong> — không hoàn tác được.
        </Alert>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          Giữ bản nào làm bản chính?
        </Typography>
        <RadioGroup value={primaryId} onChange={(e) => setPicked(e.target.value)}>
          {items.map((it) => (
            <FormControlLabel
              key={it.id}
              value={it.id}
              control={<Radio size="small" />}
              sx={{
                alignItems: 'flex-start', mt: 1, mr: 0, p: 1, borderRadius: 1.5,
                border: '1px solid', borderColor: primaryId === it.id ? 'primary.main' : 'divider',
                bgcolor: primaryId === it.id ? 'action.selected' : 'transparent',
              }}
              label={
                <Box sx={{ pt: 0.25 }}>
                  <Typography fontWeight={700} variant="body2">{it.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {it.detail}
                  </Typography>
                  {it.meta && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                      {it.meta}
                    </Typography>
                  )}
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button
          variant="contained"
          startIcon={<MergeTypeIcon />}
          disabled={!primaryId || items.length < 2}
          onClick={() => onConfirm(primaryId)}
        >
          Gộp {items.length} bản
        </Button>
      </DialogActions>
    </Dialog>
  );
}
