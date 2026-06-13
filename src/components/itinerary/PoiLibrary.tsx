import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { usePoiStore } from '@/stores/poiStore';
import { filterRank } from '@/lib/search';
import type { PoiEntry, User } from '@/types';

type Props = { user: User; onBack: () => void };

function blank(): PoiEntry {
  return { id: '', place: '', destination: '', commentary: '' };
}

export function PoiLibrary({ user, onBack }: Props) {
  const pois = usePoiStore((s) => s.pois);
  const loading = usePoiStore((s) => s.loading);
  const save = usePoiStore((s) => s.save);
  const remove = usePoiStore((s) => s.remove);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PoiEntry | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterRank(pois, search, (p) => `${p.place} ${p.destination ?? ''} ${p.commentary}`),
    [pois, search],
  );

  const onSave = async () => {
    if (!editing) return;
    if (!editing.place.trim() || !editing.commentary.trim()) { window.alert('⚠ Nhập địa điểm và nội dung thuyết minh.'); return; }
    await save(editing);
    setEditing(null);
  };

  return (
    <Box sx={{ minHeight: '100%' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>📚 Thư viện thuyết minh điểm tham quan</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {loading ? 'Đang tải…' : `${pois.length} thuyết minh · dùng chung · gợi ý khi soạn lịch trình`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="inherit" startIcon={<AddIcon />} onClick={() => setEditing(blank())}
              sx={{ bgcolor: '#fff', color: '#0d7a6a', fontWeight: 800, '&:hover': { bgcolor: '#f4fefa' } }}>
              Thêm thuyết minh
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<ArrowBackIcon />} onClick={onBack}>Quay lại</Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
        <TextField
          size="small" fullWidth value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm địa điểm / điểm đến / nội dung… (gõ không dấu cũng được)"
          sx={{ mb: 2.5, maxWidth: 480 }}
        />

        {!loading && filtered.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
            {pois.length === 0 ? 'Chưa có thuyết minh nào. Import lịch trình hoặc bấm “Thêm thuyết minh”.' : 'Không tìm thấy.'}
          </Paper>
        ) : (
          <Stack spacing={1.25}>
            {filtered.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                      <Typography fontWeight={800} fontSize={15}>{p.place}</Typography>
                      {p.destination && <Chip size="small" variant="outlined" label={`🌐 ${p.destination}`} />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{p.commentary}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Sửa"><IconButton size="small" color="primary" onClick={() => setEditing(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={delId === p.id ? 'Bấm lần nữa để xoá' : 'Xoá'}>
                      <IconButton size="small" color="error"
                        onClick={() => (delId === p.id ? (void remove(p.id), setDelId(null)) : setDelId(p.id))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      {editing && (
        <Dialog open onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
          <DialogTitle>{editing.id ? 'Sửa thuyết minh' : 'Thêm thuyết minh'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Địa điểm" required fullWidth value={editing.place}
                  onChange={(e) => setEditing({ ...editing, place: e.target.value })} placeholder="VD: Bà Nà Hills" />
                <TextField label="Điểm đến" sx={{ minWidth: 180 }} value={editing.destination ?? ''}
                  onChange={(e) => setEditing({ ...editing, destination: e.target.value })} placeholder="VD: Đà Nẵng" />
              </Stack>
              <TextField label="Nội dung thuyết minh" required multiline minRows={4} value={editing.commentary}
                onChange={(e) => setEditing({ ...editing, commentary: e.target.value })}
                placeholder="Mô tả/thuyết minh về địa điểm để HDV sử dụng…" />
              <Typography variant="caption" color="text.disabled">Tạo bởi: {editing.createdBy || user.name}</Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditing(null)} color="inherit">Huỷ</Button>
            <Button onClick={() => void onSave()} variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
