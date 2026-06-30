import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import { useQuoteStore } from '@/stores/quoteStore';
import {
  sbGetQuoteProject, sbGetDMCQuoteProject, sbDeleteQuoteVersion, sbRenameQuoteVersion,
} from '@/lib/supabase';
import { toast } from '@/stores/toastStore';
import { computeTotals, fmtVND } from './calc';
import { LEGACY } from '@/theme';
import type { QuoteVersion } from '@/types';

type Props = { open: boolean; onClose: () => void; cloudId?: string; isDmc?: boolean };

/**
 * Lịch sử phiên bản của báo giá (mỗi lần Lưu cloud = 1 phiên bản, giữ tối đa 30 bản
 * gần nhất). Cho phép XEM & KHÔI PHỤC một phiên bản cũ (lưu lại sẽ tạo thành phiên
 * bản mới — không ghi đè lịch sử), ĐỔI TÊN (ghi chú) và XOÁ bản lưu cũ không cần.
 * Mặc định dùng báo giá ĐANG MỞ; truyền `cloudId` để mở cho một báo giá BẤT KỲ
 * (vd từ dòng Lịch sử báo giá).
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
  const [busyNo, setBusyNo] = useState<number | null>(null);
  // Đổi tên: versionNo đang sửa + giá trị nháp.
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (!open || !cloudId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setEditingNo(null);
    (async () => {
      try {
        const proj = isDmc ? await sbGetDMCQuoteProject(cloudId) : await sbGetQuoteProject(cloudId);
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

  const handleDelete = async (v: QuoteVersion) => {
    if (!cloudId) return;
    if (!window.confirm(
      `Xoá "${v.note || `Phiên bản ${v.versionNo}`}" (${new Date(v.savedAt).toLocaleString('vi-VN')})?\n\n`
      + 'Bản lưu này sẽ bị xoá vĩnh viễn khỏi lịch sử. Báo giá hiện tại KHÔNG đổi.',
    )) return;
    setBusyNo(v.versionNo);
    setError(null);
    try {
      await sbDeleteQuoteVersion(cloudId, v.versionNo, undefined);
      setVersions((prev) => prev.filter((x) => x.versionNo !== v.versionNo));
      toast(`🗑️ Đã xoá Phiên bản ${v.versionNo}.`);
    } catch (e) {
      setError((e as Error).message || 'Không xoá được phiên bản');
    } finally {
      setBusyNo(null);
    }
  };

  const startEdit = (v: QuoteVersion) => {
    setEditingNo(v.versionNo);
    setEditText(v.note || `Phiên bản ${v.versionNo}`);
  };

  const saveEdit = async (v: QuoteVersion) => {
    if (!cloudId) return;
    const note = editText.trim();
    setBusyNo(v.versionNo);
    setError(null);
    try {
      await sbRenameQuoteVersion(cloudId, v.versionNo, note, undefined);
      setVersions((prev) => prev.map((x) => (x.versionNo === v.versionNo ? { ...x, note } : x)));
      setEditingNo(null);
      toast(`✏️ Đã đổi tên Phiên bản ${v.versionNo}.`);
    } catch (e) {
      setError((e as Error).message || 'Không đổi được tên phiên bản');
    } finally {
      setBusyNo(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, background: LEGACY.headerGradient, color: '#fff' }}>
        <Box sx={{ flex: 1 }}>
          🕘 Lịch sử phiên bản báo giá
          <Typography variant="caption" display="block" sx={{ opacity: 0.85 }}>
            Mỗi lần lưu cloud là một phiên bản · giữ tối đa 30 bản gần nhất
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
          <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>
        ) : null}
        {cloudId && !loading && versions.length === 0 && !error ? (
          <Alert severity="info">Chưa có phiên bản nào được ghi.</Alert>
        ) : cloudId && !loading ? (
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {versions.map((v, i) => {
              const total = (() => { try { return computeTotals(v.state).grandTotal; } catch { return null; } })();
              const editing = editingNo === v.versionNo;
              const busy = busyNo === v.versionNo;
              return (
                <Stack
                  key={v.versionNo}
                  direction="row" alignItems="center" spacing={1.5}
                  sx={{
                    border: '1px solid rgba(20,150,140,0.25)', borderRadius: 2, px: 1.5, py: 1,
                    bgcolor: i === 0 ? 'rgba(168,230,221,0.18)' : 'transparent',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <Chip
                    size="small"
                    label={i === 0 ? `Bản ${v.versionNo} · mới nhất` : `Bản ${v.versionNo}`}
                    color={i === 0 ? 'success' : 'default'}
                    sx={{ fontWeight: 700, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {editing ? (
                      <TextField
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(v); }
                          if (e.key === 'Escape') setEditingNo(null);
                        }}
                        size="small" fullWidth autoFocus disabled={busy}
                        placeholder={`Phiên bản ${v.versionNo}`}
                        InputProps={{ sx: { fontSize: 14, fontWeight: 600 } }}
                      />
                    ) : (
                      <Typography variant="body2" fontWeight={600} noWrap>{v.note || `Phiên bản ${v.versionNo}`}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {new Date(v.savedAt).toLocaleString('vi-VN')} · {v.savedBy}
                      {total != null ? ` · ${fmtVND(total)}` : ''}
                    </Typography>
                  </Box>
                  {editing ? (
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip title="Lưu tên">
                        <span>
                          <IconButton size="small" color="success" onClick={() => saveEdit(v)} disabled={busy}>
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Button size="small" onClick={() => setEditingNo(null)} disabled={busy}>Huỷ</Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <Tooltip title="Đổi tên bản lưu">
                        <span>
                          <IconButton size="small" onClick={() => startEdit(v)} disabled={busy}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Khôi phục phiên bản này">
                        <span>
                          <IconButton
                            size="small" color="primary" onClick={() => handleRestore(v)} disabled={busy}
                            sx={{ border: '1px solid', borderColor: 'rgba(20,150,140,0.5)', borderRadius: 1.5 }}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Xoá bản lưu này">
                        <span>
                          <IconButton size="small" color="error" onClick={() => handleDelete(v)} disabled={busy}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
