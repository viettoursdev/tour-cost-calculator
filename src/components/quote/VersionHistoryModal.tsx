import { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import { useQuoteStore } from '@/stores/quoteStore';
import { fbGetQuoteProject, fbGetDMCQuoteProject } from '@/lib/dataBackend';
import { toast } from '@/stores/toastStore';
import { computeTotals, fmtVND } from './calc';
import { LEGACY } from '@/theme';
import type { QuoteVersion } from '@/types';

type Props = { open: boolean; onClose: () => void; cloudId?: string; isDmc?: boolean };

/**
 * Lịch sử phiên bản của báo giá (mỗi lần Lưu cloud = 1 phiên bản, giữ tối đa 20 bản
 * gần nhất). Cho phép xem & KHÔI PHỤC một phiên bản cũ — lưu lại sẽ tạo thành phiên
 * bản mới (không ghi đè lịch sử). Mặc định dùng báo giá ĐANG MỞ; truyền `cloudId`
 * để mở cho một báo giá BẤT KỲ (vd từ dòng Lịch sử báo giá).
 */
export function VersionHistoryModal({ open, onClose, cloudId: propCloudId, isDmc: propIsDmc }: Props) {
  const draftCloudId = useQuoteStore((s) => s.draft.currentQuoteId);
  const draftIsDmc = useQuoteStore((s) => s.draft.template === 'dmc');
  const cloudId = propCloudId ?? draftCloudId;
  const isDmc = propIsDmc ?? draftIsDmc;
  const restoreVersionState = useQuoteStore((s) => s.restoreVersionState);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<QuoteVersion[]>([]);

  useEffect(() => {
    if (!open || !cloudId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const proj = isDmc ? await fbGetDMCQuoteProject(cloudId) : await fbGetQuoteProject(cloudId);
        if (!alive) return;
        setVersions([...(proj?.versions ?? [])].sort((a, b) => b.versionNo - a.versionNo));
      } catch (e) {
        if (alive) setError((e as Error).message || 'Không tải được lịch sử phiên bản');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, cloudId, isDmc]);

  const handleRestore = (v: QuoteVersion) => {
    if (!window.confirm(
      `Khôi phục "Phiên bản ${v.versionNo}" (${new Date(v.savedAt).toLocaleString('vi-VN')})?\n\n`
      + 'Nội dung báo giá hiện tại sẽ được thay bằng phiên bản này. Thay đổi chưa lưu sẽ mất; '
      + 'lưu lại sẽ tạo thành một phiên bản mới (không ghi đè các bản cũ).',
    )) return;
    restoreVersionState(v.state);
    onClose();
    toast(`↩️ Đã khôi phục Phiên bản ${v.versionNo} vào báo giá. Nhớ bấm Lưu để ghi thành bản mới.`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, background: LEGACY.headerGradient, color: '#fff' }}>
        <Box sx={{ flex: 1 }}>
          🕘 Lịch sử phiên bản báo giá
          <Typography variant="caption" display="block" sx={{ opacity: 0.85 }}>
            Mỗi lần lưu cloud là một phiên bản · giữ tối đa 20 bản gần nhất
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!cloudId ? (
          <Alert severity="info">Báo giá chưa được lưu lên cloud lần nào — chưa có lịch sử phiên bản.</Alert>
        ) : loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={28} /></Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : versions.length === 0 ? (
          <Alert severity="info">Chưa có phiên bản nào được ghi.</Alert>
        ) : (
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {versions.map((v, i) => {
              const total = (() => { try { return computeTotals(v.state).grandTotal; } catch { return null; } })();
              return (
                <Stack
                  key={v.versionNo}
                  direction="row" alignItems="center" spacing={1.5}
                  sx={{
                    border: '1px solid rgba(20,150,140,0.25)', borderRadius: 2, px: 1.5, py: 1,
                    bgcolor: i === 0 ? 'rgba(168,230,221,0.18)' : 'transparent',
                  }}
                >
                  <Chip
                    size="small"
                    label={i === 0 ? `Bản ${v.versionNo} · mới nhất` : `Bản ${v.versionNo}`}
                    color={i === 0 ? 'success' : 'default'}
                    sx={{ fontWeight: 700, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{v.note || `Phiên bản ${v.versionNo}`}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {new Date(v.savedAt).toLocaleString('vi-VN')} · {v.savedBy}
                      {total != null ? ` · ${fmtVND(total)}` : ''}
                    </Typography>
                  </Box>
                  <Tooltip title="Khôi phục phiên bản này">
                    <IconButton
                      size="small" color="primary" onClick={() => handleRestore(v)}
                      sx={{ flexShrink: 0, border: '1px solid', borderColor: 'rgba(20,150,140,0.5)', borderRadius: 1.5 }}
                    >
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
