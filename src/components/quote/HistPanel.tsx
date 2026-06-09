import { useState } from 'react';
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuoteStore } from '@/stores/quoteStore';
import { LEGACY } from '@/theme';

export function HistPanel() {
  const snapshots = useQuoteStore((s) => s.snapshots);
  const draftName = useQuoteStore((s) => s.draft.info.name);
  const saveSnapshot = useQuoteStore((s) => s.saveSnapshot);
  const loadSnapshot = useQuoteStore((s) => s.loadSnapshot);
  const deleteSnapshot = useQuoteStore((s) => s.deleteSnapshot);
  const renameSnapshot = useQuoteStore((s) => s.renameSnapshot);

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const openSave = () => { setName(draftName || ''); setSaving(true); };
  const confirmSave = () => {
    if (!name.trim()) return;
    saveSnapshot(name);
    setSaving(false);
  };

  const handleLoad = (id: number) => {
    if (!confirm('Tải báo giá đã lưu? Báo giá hiện tại sẽ bị thay thế.')) return;
    loadSnapshot(id);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Xoá báo giá đã lưu này?')) return;
    deleteSnapshot(id);
  };

  const commitRename = () => {
    if (editingId !== null) {
      renameSnapshot(editingId, editingName);
      setEditingId(null);
    }
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5, mt: 2.5 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{ fontSize: 18 }}>🗂️</Box>
          <Typography fontWeight={700} fontSize={15} sx={{ color: LEGACY.navy }}>
            Lịch sử báo giá (Local)
          </Typography>
          <Box
            sx={{
              background: 'rgba(20,150,140,0.1)', border: '1px solid rgba(20,150,140,0.3)',
              borderRadius: 2.5, px: 1.25, py: 0.25, fontSize: 12, fontWeight: 600, color: LEGACY.teal,
            }}
          >
            {snapshots.length} báo giá
          </Box>
        </Stack>
        <Button
          size="small"
          onClick={() => (saving ? setSaving(false) : openSave())}
          sx={{
            fontWeight: 800, px: 2,
            ...(saving
              ? { color: '#dc3250', background: 'rgba(220,50,80,0.1)', '&:hover': { background: 'rgba(220,50,80,0.18)' } }
              : { color: '#fff', background: LEGACY.headerGradient, '&:hover': { background: LEGACY.headerGradient, filter: 'brightness(1.05)' } }),
          }}
        >
          {saving ? '✕ Huỷ' : '💾 Lưu báo giá hiện tại'}
        </Button>
      </Stack>

      {/* Inline save */}
      {saving && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.75 }}>
          <TextField
            autoFocus size="small" fullWidth value={name}
            placeholder="Tên báo giá (VD: Nhật 5N4Đ 20pax)..."
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmSave(); }}
          />
          <Button
            variant="contained" disabled={!name.trim()} onClick={confirmSave}
            sx={{ fontWeight: 800, background: LEGACY.headerGradient }}
          >
            Lưu
          </Button>
        </Stack>
      )}

      {/* List */}
      <Box sx={{ mt: 2 }}>
        {snapshots.length === 0 ? (
          <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 13, textAlign: 'center', py: 2.75 }}>
            Chưa lưu báo giá nào
          </Typography>
        ) : (
          <Stack spacing={1}>
            {snapshots.map((s) => (
              <Stack
                key={s.id}
                direction="row" justifyContent="space-between" alignItems="center" gap={1}
                onClick={() => editingId !== s.id && handleLoad(s.id)}
                sx={{
                  px: 1.75, py: 1.25, borderRadius: 1.5, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(20,150,140,0.12)',
                  transition: 'background .15s, border-color .15s',
                  '&:hover': { background: 'rgba(168,230,221,0.18)', borderColor: 'rgba(20,150,140,0.3)' },
                }}
              >
                {editingId === s.id ? (
                  <TextField
                    autoFocus size="small" fullWidth value={editingName}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      fontWeight={700} fontSize={14} noWrap sx={{ color: LEGACY.navy }}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditingName(s.name); }}
                    >
                      {s.name}
                    </Typography>
                    <Typography fontSize={12} sx={{ color: 'rgba(15,58,74,0.45)', mt: 0.25 }}>
                      {s.date} · bởi {s.savedBy}
                    </Typography>
                  </Box>
                )}
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                  <Box
                    sx={{
                      color: LEGACY.teal, fontSize: 12, fontWeight: 600,
                      background: 'rgba(20,150,140,0.1)', border: '1px solid rgba(20,150,140,0.3)',
                      borderRadius: 1, px: 1.25, py: 0.5,
                    }}
                  >
                    Tải lại
                  </Box>
                  <IconButton
                    size="small" sx={{ color: 'rgba(220,50,80,0.5)' }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
