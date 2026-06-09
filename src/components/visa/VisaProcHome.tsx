import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useVisaProcStore } from '@/stores/visaProcStore';
import type { VisaProcIndexEntry } from '@/types';

type Props = {
  list: VisaProcIndexEntry[];
  loading: boolean;
  currentUsername: string;
  onNew: () => void;
  onOpen: (id: string) => void;
};

function fmtDt(s?: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export function VisaProcHome({ list, loading, currentUsername, onNew, onOpen }: Props) {
  const [search, setSearch] = useState('');
  const [delId, setDelId] = useState<string | null>(null);

  const filtered = list.filter((x) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (x.code ?? '').toLowerCase().includes(q) ||
      (x.title ?? '').toLowerCase().includes(q) ||
      (x.country ?? '').toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string) => {
    await useVisaProcStore.getState().delete(id);
    setDelId(null);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField size="small" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm mã, tên hồ sơ, quốc gia..."
          sx={{ maxWidth: 380, flex: 1 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Tạo hồ sơ thủ tục
        </Button>
      </Stack>

      {loading && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>⏳ Đang tải...</Box>
      )}
      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography fontSize={42} sx={{ mb: 1.5 }}>🗂️</Typography>
          <Typography variant="subtitle1" fontWeight={600}>Chưa có hồ sơ nào</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Bấm "Tạo hồ sơ thủ tục" để bắt đầu
          </Typography>
        </Box>
      )}

      {!loading && filtered.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
          {filtered.map((x) => {
            const isOwner = x.createdByUsername === currentUsername;
            return (
              <Paper key={x.id} variant="outlined" onClick={() => onOpen(x.id)}
                sx={{ p: 2, cursor: 'pointer', transition: 'all .2s',
                      '&:hover': { boxShadow: 4, borderColor: 'rgba(20,150,140,0.35)' } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                  <Chip label={x.code || '—'} size="small"
                    sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff',
                          fontWeight: 800, fontSize: 10, fontFamily: 'monospace', height: 22 }} />
                  {isOwner ? (
                    <IconButton size="small" color="error"
                      onClick={(e) => { e.stopPropagation(); setDelId(x.id); }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <Chip label="Cộng tác" size="small"
                      sx={{ bgcolor: 'rgba(20,150,140,0.1)', color: '#0d7a6a',
                            fontWeight: 700, fontSize: 9, height: 20 }} />
                  )}
                </Stack>
                <Typography fontWeight={800} fontSize={15}>
                  {x.title || '(Chưa đặt tên)'}{x.country ? ` · ${x.country}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {x.createdByName ? `Tạo bởi ${x.createdByName}` : ''}
                  {x.linkedQuoteName ? ` · 🔗 ${x.linkedQuoteName}` : ''}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
                  Cập nhật: {fmtDt(x.updatedAt)}{x.updatedBy ? ` · ${x.updatedBy}` : ''}
                </Typography>
              </Paper>
            );
          })}
        </Box>
      )}

      {delId && (
        <Box onClick={() => setDelId(null)}
          sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <Paper onClick={(e) => e.stopPropagation()}
            sx={{ p: 3, maxWidth: 380, textAlign: 'center' }}>
            <Typography fontSize={34} sx={{ mb: 1 }}>🗑️</Typography>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
              Xoá hồ sơ này?
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button fullWidth onClick={() => setDelId(null)}>Huỷ</Button>
              <Button fullWidth variant="contained" color="error"
                onClick={() => void handleDelete(delId)}>
                Xoá
              </Button>
            </Stack>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
