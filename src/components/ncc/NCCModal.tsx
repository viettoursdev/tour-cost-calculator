import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { NCC_SECTORS, SECTOR_COLOR } from './constants';
import type { Ncc, NccContact } from '@/types';

const EMPTY_CONTACT: NccContact = { name: '', phone: '', email: '', position: '' };

const EMPTY_NCC: Ncc = {
  id: '',
  name: '',
  sectors: [],
  location: '',
  contacts: [{ ...EMPTY_CONTACT }],
  note: '',
  createdAt: '',
  createdBy: '',
};

type Props = {
  ncc: Ncc | null;
  canEdit: boolean;
  onSave: (form: Ncc) => void;
  onClose: () => void;
};

export function NCCModal({ ncc, canEdit, onSave, onClose }: Props) {
  const [form, setForm] = useState<Ncc>(ncc ?? EMPTY_NCC);

  const setF = <K extends keyof Ncc>(k: K, v: Ncc[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const toggleSector = (s: string) =>
    setF(
      'sectors',
      form.sectors.includes(s)
        ? form.sectors.filter((x) => x !== s)
        : [...form.sectors, s],
    );

  const setContact = (i: number, k: keyof NccContact, v: string) =>
    setForm((p) => {
      const contacts = [...p.contacts];
      contacts[i] = { ...contacts[i], [k]: v };
      return { ...p, contacts };
    });

  const addContact = () =>
    setForm((p) => ({ ...p, contacts: [...p.contacts, { ...EMPTY_CONTACT }] }));

  const delContact = (i: number) =>
    setForm((p) => ({ ...p, contacts: p.contacts.filter((_, j) => j !== i) }));

  const handleSave = () => {
    if (!form.name.trim()) {
      window.alert('Vui lòng nhập tên NCC');
      return;
    }
    if (form.sectors.length === 0) {
      window.alert('Vui lòng chọn ít nhất 1 lĩnh vực');
      return;
    }
    onSave(form);
  };

  const title = ncc
    ? canEdit ? '✏️ Sửa NCC' : '👀 Xem NCC'
    : '➕ Thêm NCC mới';

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Name */}
          <TextField
            label="Tên NCC *"
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            placeholder="VD: Sheraton Saigon Hotel..."
            required
            disabled={!canEdit}
            error={canEdit && !form.name.trim()}
          />

          {/* Sectors */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={700}
              sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}
            >
              Lĩnh vực dịch vụ *
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {NCC_SECTORS.map((s) => {
                const active = form.sectors.includes(s);
                const color = SECTOR_COLOR[s] ?? '#7f8c8d';
                return (
                  <Box
                    key={s}
                    component="button"
                    onClick={() => canEdit && toggleSector(s)}
                    disabled={!canEdit}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: canEdit ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                      border: `1.5px solid ${color}`,
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : color,
                      transition: 'all 0.15s',
                      '&:disabled': { opacity: 0.6, cursor: 'default' },
                    }}
                  >
                    {s}
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Location */}
          <TextField
            label="Địa điểm"
            value={form.location}
            onChange={(e) => setF('location', e.target.value)}
            placeholder="VD: TP. Hồ Chí Minh, Đà Nẵng..."
            disabled={!canEdit}
          />

          {/* Contacts */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
              >
                Người liên hệ
              </Typography>
              {canEdit && (
                <Button size="small" startIcon={<AddIcon />} onClick={addContact}>
                  Thêm contact
                </Button>
              )}
            </Stack>
            <Stack spacing={1}>
              {form.contacts.map((c, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" color="primary" fontWeight={700}>
                      Contact {i + 1}
                    </Typography>
                    {canEdit && form.contacts.length > 1 && (
                      <IconButton size="small" color="error" onClick={() => delContact(i)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <TextField size="small" label="Họ tên" value={c.name}
                      onChange={(e) => setContact(i, 'name', e.target.value)} disabled={!canEdit} />
                    <TextField size="small" label="Chức vụ" value={c.position}
                      onChange={(e) => setContact(i, 'position', e.target.value)} disabled={!canEdit} />
                    <TextField size="small" label="Số điện thoại" value={c.phone}
                      onChange={(e) => setContact(i, 'phone', e.target.value)} disabled={!canEdit} />
                    <TextField size="small" label="Email" value={c.email}
                      onChange={(e) => setContact(i, 'email', e.target.value)} disabled={!canEdit} />
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Box>

          {/* Note */}
          <TextField
            label="Ghi chú"
            multiline
            rows={3}
            value={form.note}
            onChange={(e) => setF('note', e.target.value)}
            placeholder="Ghi chú thêm về NCC..."
            disabled={!canEdit}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        {canEdit && (
          <Button
            variant="contained"
            disabled={!form.name.trim() || form.sectors.length === 0}
            onClick={handleSave}
          >
            💾 Lưu NCC
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
