import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, InputAdornment, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { canViewAll } from '@/auth/ROLES';
import { filterRank } from '@/lib/search';

async function openLinkedQuote(cloudId: string): Promise<void> {
  if (!window.confirm('Rời phần chương trình để mở báo giá liên kết? Thay đổi chưa lưu có thể mất.')) return;
  const r = await useQuoteStore.getState().loadCloud(cloudId);
  if (!r.ok) window.alert('⚠ ' + r.error);
}

type Props = {
  onNew: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
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

export function ItineraryHome({ onNew, onOpen, onBack }: Props) {
  const list = useItineraryStore((s) => s.list);
  const loading = useItineraryStore((s) => s.loading);
  const currentUser = useAuthStore((s) => s.currentUser);
  // Operations trở lên xem toàn bộ; dưới ngưỡng chỉ thấy chương trình do mình tạo.
  const viewAll = !!currentUser && canViewAll(currentUser.role, 'itinerary');
  const [search, setSearch] = useState('');
  const [delId, setDelId] = useState<string | null>(null);

  const base = list.filter((x) => viewAll || x.createdBy === currentUser?.name);
  const filtered = filterRank(base, search, (x) => `${x.code ?? ''} ${x.title ?? ''} ${x.destination ?? ''} ${x.linkedQuoteName ?? ''}`);

  const handleDelete = async (id: string) => {
    await useItineraryStore.getState().delete(id);
    setDelId(null);
  };

  return (
    <Box sx={{ minHeight: '100%' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>🗺️ Chương trình tour</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {loading ? 'Đang tải...' : `${list.length} chương trình · đồng bộ Cloud`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="inherit" startIcon={<AddIcon />} onClick={onNew}
              sx={{ bgcolor: '#fff', color: '#0d7a6a', fontWeight: 800, '&:hover': { bgcolor: '#f4fefa' } }}>
              Tạo chương trình
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<ArrowBackIcon />} onClick={onBack}>
              Quay lại
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm mã, tên, điểm đến..."
          size="small"
          sx={{ mb: 2.5, maxWidth: 420, width: '100%' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          }}
        />

        {loading && (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
            ⏳ Đang tải...
          </Box>
        )}

        {!loading && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
            <Typography fontSize={40} sx={{ mb: 1.5 }}>🗺️</Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              {list.length === 0 ? 'Chưa có chương trình nào' : 'Không tìm thấy'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Bấm "Tạo chương trình" để bắt đầu
            </Typography>
          </Box>
        )}

        {!loading && filtered.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
            {filtered.map((x) => (
              <Paper
                key={x.id}
                variant="outlined"
                onClick={() => onOpen(x.id)}
                sx={{
                  p: 2, cursor: 'pointer', transition: 'all .2s',
                  '&:hover': { boxShadow: 4, borderColor: 'rgba(20,150,140,0.35)' },
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                  <Chip
                    label={x.code || '—'}
                    size="small"
                    sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff',
                          fontWeight: 800, fontSize: 10, fontFamily: 'monospace', height: 22 }}
                  />
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => { e.stopPropagation(); setDelId(x.id); }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Typography fontWeight={800} fontSize={15}>
                  {x.destination || x.title || '(Chưa đặt tên)'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {x.days}N{x.nights}Đ
                </Typography>
                {x.linkedQuoteId && (
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      size="small" color="primary" variant="outlined" clickable
                      label={`🔗 ${x.linkedQuoteName || 'Báo giá'}`}
                      onClick={(e) => { e.stopPropagation(); void openLinkedQuote(x.linkedQuoteId!); }}
                    />
                  </Box>
                )}
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
                  Cập nhật: {fmtDt(x.updatedAt)}{x.updatedBy ? ` · ${x.updatedBy}` : ''}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}

        {delId && (
          <Box
            onClick={() => setDelId(null)}
            sx={{
              position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
            }}
          >
            <Paper
              onClick={(e) => e.stopPropagation()}
              sx={{ p: 3, maxWidth: 380, textAlign: 'center' }}
            >
              <Typography fontSize={34} sx={{ mb: 1 }}>🗑️</Typography>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
                Xoá chương trình này?
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth onClick={() => setDelId(null)}>Huỷ</Button>
                <Button fullWidth variant="contained" color="error" onClick={() => void handleDelete(delId)}>
                  Xoá
                </Button>
              </Stack>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
}
