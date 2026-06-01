import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List,
  ListItem, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuoteStore } from '@/stores/quoteStore';

export function HistPanel() {
  const snapshots = useQuoteStore((s) => s.snapshots);
  const draftName = useQuoteStore((s) => s.draft.info.name);
  const saveSnapshot = useQuoteStore((s) => s.saveSnapshot);
  const loadSnapshot = useQuoteStore((s) => s.loadSnapshot);
  const deleteSnapshot = useQuoteStore((s) => s.deleteSnapshot);
  const renameSnapshot = useQuoteStore((s) => s.renameSnapshot);

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const openSave = () => { setName(draftName || ''); setSaveOpen(true); };
  const confirmSave = () => {
    saveSnapshot(name);
    setSaveOpen(false);
  };

  const handleLoad = (id: number) => {
    if (!confirm('Tải báo giá đã lưu? Báo giá hiện tại sẽ bị thay thế.')) return;
    loadSnapshot(id);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Xoá báo giá đã lưu này?')) return;
    deleteSnapshot(id);
  };

  const startRename = (id: number, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };
  const commitRename = () => {
    if (editingId !== null) {
      renameSnapshot(editingId, editingName);
      setEditingId(null);
    }
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="overline" color="text.secondary">Lịch sử (local)</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={openSave}>Lưu</Button>
      </Stack>

      {snapshots.length === 0 ? (
        <Typography variant="caption" color="text.secondary">Chưa có báo giá nào được lưu.</Typography>
      ) : (
        <List dense disablePadding>
          {snapshots.map((s) => (
            <ListItem
              key={s.id}
              disableGutters
              secondaryAction={
                <Stack direction="row">
                  <IconButton size="small" onClick={() => handleLoad(s.id)}><FolderOpenIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(s.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              }
            >
              {editingId === s.id ? (
                <TextField
                  autoFocus size="small" fullWidth value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                />
              ) : (
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={600} onDoubleClick={() => startRename(s.id, s.name)} sx={{ cursor: 'text' }}>{s.name}</Typography>}
                  secondary={`${s.savedBy} · ${s.date}`}
                />
              )}
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)}>
        <DialogTitle>Lưu báo giá</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus margin="dense" label="Tên báo giá" fullWidth
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) confirmSave(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Huỷ</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={confirmSave}>Lưu</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
