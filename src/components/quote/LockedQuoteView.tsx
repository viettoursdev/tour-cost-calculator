import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useQuoteStore } from '@/stores/quoteStore';
import { openFilePreview } from '@/stores/filePreviewStore';
import { attMeta } from '@/lib/util';
import { LEGACY } from '@/theme';

/**
 * Trang báo giá BỊ KHOÁ — báo giá tạo bằng cách "Upload Excel (chỉ xem)". Không nhập
 * liệu trên app; chỉ xem file Excel gốc. Vẫn lưu cloud được để vào lịch sử báo giá.
 */
export function LockedQuoteView() {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const excelFile = useQuoteStore((s) => s.draft.excelFile);

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 720, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, textAlign: 'center' }}>
        <Box sx={{ width: 56, height: 56, mx: 'auto', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.1)', color: '#7c3aed', mb: 1.5 }}>
          <LockOutlinedIcon sx={{ fontSize: 28 }} />
        </Box>
        <Typography sx={{ fontWeight: 900, fontSize: 19, color: LEGACY.navy }}>{info.name || 'Báo giá (file Excel)'}</Typography>
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${pax} khách`} />
          <Chip size="small" label={`${info.days}N${info.nights}Đ`} />
          {info.startDate && <Chip size="small" label={`KH ${new Date(info.startDate).toLocaleDateString('vi-VN')}`} />}
        </Stack>

        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Báo giá này được tạo từ <strong>file Excel upload</strong> — trang nhập liệu bị khoá, chỉ xem file gốc.
        </Typography>

        {excelFile ? (
          <Box sx={{ mt: 2.5 }}>
            <Button
              variant="contained" size="large" startIcon={<DescriptionOutlinedIcon />}
              onClick={() => openFilePreview({ key: excelFile.key, name: excelFile.name })}
              sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', fontWeight: 800 }}
            >
              Xem báo giá Excel
            </Button>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              📄 {excelFile.name}{attMeta(excelFile) ? ` · ${attMeta(excelFile)}` : ''}
            </Typography>
          </Box>
        ) : (
          <Typography color="error" sx={{ mt: 2 }}>Không tìm thấy file Excel đính kèm.</Typography>
        )}

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 3 }}>
          Bấm “Lưu cloud” trên thanh công cụ để lưu báo giá này vào lịch sử (kèm file Excel).
        </Typography>
      </Paper>
    </Box>
  );
}
