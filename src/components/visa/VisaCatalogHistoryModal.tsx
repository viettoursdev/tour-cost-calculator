import {
  Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import type { VisaProduct } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onRestore: (products: VisaProduct[]) => void;
};

/** Lịch sử các bản lưu của bảng giá visa — xem người lưu/thời gian & khôi phục. */
export function VisaCatalogHistoryModal({ open, onClose, onRestore }: Props) {
  const versions = useVisaProductsStore((s) => s.versions);

  const handleRestore = (p: VisaProduct[], no: number) => {
    if (!window.confirm(`Khôi phục bảng giá visa về phiên bản #${no}? Bản hiện tại sẽ được lưu thành 1 phiên bản mới.`)) return;
    onRestore(p.map((x) => ({ ...x })));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        🕐 Lịch sử bảng giá visa
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {versions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.disabled' }}>
            <Typography fontSize={36} sx={{ mb: 1 }}>🗂️</Typography>
            <Typography variant="body2">Chưa có phiên bản nào được lưu.</Typography>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {versions.map((v) => (
              <Box
                key={v.versionNo}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  border: '1px solid rgba(20,150,140,0.2)', borderRadius: 1.5, p: 1.5,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={800} sx={{ color: '#0d7a6a' }}>
                    Phiên bản #{v.versionNo}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 600 }}>
                      {v.products.length} sản phẩm
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {new Date(v.savedAt).toLocaleString('vi-VN')} · {v.savedBy || 'không rõ'}
                  </Typography>
                </Box>
                <Button
                  size="small" variant="outlined" startIcon={<RestoreIcon />}
                  onClick={() => handleRestore(v.products, v.versionNo)}
                >
                  Khôi phục
                </Button>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
