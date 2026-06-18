import { Box, Dialog, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { workerFileUrl } from '@/lib/aiWorker';
import { fileKind } from '@/lib/fileKind';
import { LEGACY } from '@/theme';

export type PreviewFile = { key?: string; url?: string; name: string; mime?: string };

/** URL nhúng của Microsoft Office Online cho Word/Excel/PowerPoint (cần URL công khai). */
const officeViewer = (url: string) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

/**
 * Khung xem trước dùng chung cho file đã lưu trên cloud:
 *  - ảnh: hiển thị trực tiếp · PDF/text: nhúng inline (file phục vụ public từ Worker)
 *  - Word/Excel/PPT: nhúng qua Microsoft Office Online (file được Microsoft tải để render)
 *  - khác: nút tải về.
 */
export function FilePreviewDialog({ open, onClose, file }: { open: boolean; onClose: () => void; file: PreviewFile | null }) {
  if (!file) return null;
  const url = file.url ?? (file.key ? workerFileUrl(file.key) : '');
  const kind = fileKind(file.name, file.mime);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      slotProps={{ paper: { sx: { height: '90vh', display: 'flex', flexDirection: 'column' } } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, background: LEGACY.headerGradient, color: '#fff' }}>
        <Typography fontWeight={800} noWrap sx={{ flex: 1 }}>{file.name}</Typography>
        <Tooltip title="Mở tab mới"><IconButton size="small" component="a" href={url} target="_blank" rel="noreferrer" sx={{ color: '#fff' }}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Tải về"><IconButton size="small" component="a" href={url} download={file.name} sx={{ color: '#fff' }}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
        <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, bgcolor: '#f1f4f5', display: 'flex' }}>
        {kind === 'image' ? (
          <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Box component="img" src={url} alt={file.name} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </Box>
        ) : kind === 'pdf' || kind === 'text' ? (
          <Box component="iframe" src={url} title={file.name} sx={{ flex: 1, border: 'none', width: '100%', height: '100%' }} />
        ) : kind === 'office' ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box component="iframe" src={officeViewer(url)} title={file.name} sx={{ flex: 1, border: 'none', width: '100%' }} />
            <Typography variant="caption" sx={{ textAlign: 'center', py: 0.5, color: 'text.secondary' }}>
              Xem qua Microsoft Office Online — nếu trống, bấm “Tải về” để mở bằng ứng dụng.
            </Typography>
          </Box>
        ) : (
          <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ flex: 1, color: 'text.secondary' }}>
            <Typography>Không xem trước trực tiếp được loại file này.</Typography>
            <Box component="a" href={url} download={file.name}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: 2, background: LEGACY.headerGradient, color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
              <DownloadIcon fontSize="small" /> Tải về
            </Box>
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}
