import { useState, type ChangeEvent } from 'react';
import { Box, Button, Chip, Divider, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { openFilePreview } from '@/stores/filePreviewStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { attMeta } from '@/lib/util';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';

/**
 * Trang báo giá BỊ KHOÁ — báo giá tạo bằng "Upload Excel (chỉ xem)". Không nhập liệu
 * trên app; chỉ xem các file Excel đã upload. User có thể UPLOAD THÊM file báo giá
 * (mỗi lần thêm vào lịch sử) và xem lại toàn bộ lịch sử file đã up.
 */
export function LockedQuoteView() {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const excelFiles = useQuoteStore((s) => s.draft.excelFiles);
  const excelFileLegacy = useQuoteStore((s) => s.draft.excelFile);
  const addExcelFile = useQuoteStore((s) => s.addExcelFile);
  const user = useAuthStore((s) => s.currentUser);
  const [busy, setBusy] = useState(false);

  // Lịch sử: mới nhất lên đầu (dữ liệu lưu cũ→mới).
  const files = (excelFiles ?? (excelFileLegacy ? [excelFileLegacy] : [])).slice().reverse();

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const up = await uploadFileToWorker(f);
      addExcelFile({ ...up, uploadedBy: user?.name, uploadedAt: new Date().toISOString() });
      toast('✅ Đã thêm file báo giá Excel — bấm Lưu cloud để lưu.');
    } catch (err) {
      window.alert('❌ Tải file lên lỗi: ' + (err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 720, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}>
        <Stack alignItems="center" textAlign="center">
          <Box sx={{ width: 56, height: 56, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.1)', color: '#7c3aed', mb: 1.5 }}>
            <LockOutlinedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Typography sx={{ fontWeight: 900, fontSize: 19, color: LEGACY.navy }}>{info.name || 'Báo giá (file Excel)'}</Typography>
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${pax} khách`} />
            <Chip size="small" label={`${info.days}N${info.nights}Đ`} />
            {info.startDate && <Chip size="small" label={`KH ${new Date(info.startDate).toLocaleDateString('vi-VN')}`} />}
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            Báo giá này được tạo từ <strong>file Excel upload</strong> — trang nhập liệu bị khoá, chỉ xem file.
          </Typography>
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography fontWeight={800}>Lịch sử file báo giá Excel ({files.length})</Typography>
          <Box sx={{ flex: 1 }} />
          <Button component="label" variant="contained" size="small" disabled={busy} startIcon={<UploadFileIcon />}
            sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', fontWeight: 800 }}>
            {busy ? 'Đang tải lên…' : 'Upload thêm file'}
            <input type="file" hidden accept=".xlsx,.xls,.csv,.tsv" onChange={onPick} />
          </Button>
        </Stack>

        {files.length === 0 ? (
          <Typography color="error" variant="body2">Chưa có file Excel nào.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {files.map((f, i) => (
              <Paper key={f.key} variant="outlined" sx={{ p: 1.25, borderLeft: `4px solid ${i === 0 ? '#7c3aed' : 'rgba(124,58,237,0.3)'}` }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <DescriptionOutlinedIcon sx={{ color: '#1d8348' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontSize={13.5} fontWeight={700} noWrap>
                      {f.name}{i === 0 && files.length > 1 && <Chip size="small" label="mới nhất" sx={{ ml: 0.75, height: 16, fontSize: 10 }} />}
                    </Typography>
                    {attMeta(f) && <Typography variant="caption" color="text.secondary">{attMeta(f)}</Typography>}
                  </Box>
                  <Tooltip title="Xem file">
                    <IconButton size="small" onClick={() => openFilePreview({ key: f.key, name: f.name })} sx={{ color: '#7c3aed' }}>
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2.5, textAlign: 'center' }}>
          Sau khi upload thêm, bấm “Lưu cloud” trên thanh công cụ để lưu lịch sử file.
        </Typography>
      </Paper>
    </Box>
  );
}
