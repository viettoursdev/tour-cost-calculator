import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { CUSTOMER_SOURCES, CUSTOMER_TAGS } from './constants';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { NameCardScanButton } from '@/components/common/NameCardScanButton';
import type { NameCardFields } from '@/lib/nameCard';
import type { Customer, CustomerContact } from '@/types';

const EMPTY_CONTACT: CustomerContact = { name: '', phone: '', email: '', position: '' };

const EMPTY_CUSTOMER: Customer = {
  id: '',
  name: '',
  type: 'company',
  address: '',
  taxCode: '',
  contacts: [{ ...EMPTY_CONTACT }],
  note: '',
  createdAt: '',
  createdBy: '',
};

type Props = {
  customer: Customer | null;
  canEdit: boolean;
  onSave: (form: Customer) => void;
  onClose: () => void;
};

export function CustomerModal({ customer, canEdit, onSave, onClose }: Props) {
  const { state: form, set: setForm, undo, redo, canUndo, canRedo } = useHistoryState<Customer>(customer ?? EMPTY_CUSTOMER);
  useUndoRedoShortcuts(undo, redo, canEdit);

  const setF = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setContact = (i: number, k: keyof CustomerContact, v: string) =>
    setForm((p) => {
      const contacts = [...p.contacts];
      contacts[i] = { ...contacts[i], [k]: v };
      return { ...p, contacts };
    });

  const addContact = () =>
    setForm((p) => ({ ...p, contacts: [...p.contacts, { ...EMPTY_CONTACT }] }));

  const delContact = (i: number) =>
    setForm((p) => ({ ...p, contacts: p.contacts.filter((_, j) => j !== i) }));

  const applyNameCard = (f: NameCardFields) =>
    setForm((p) => {
      const next = { ...p };
      if (!next.name.trim()) next.name = f.company || f.name || '';
      if (!next.address?.trim() && f.address) next.address = f.address;
      if (!next.taxCode?.trim() && f.taxCode) next.taxCode = f.taxCode;
      const c: CustomerContact = {
        name: f.name || '',
        phone: f.phone || '',
        email: f.email || '',
        position: f.position || '',
      };
      if (c.name || c.phone || c.email || c.position) {
        const contacts = [...next.contacts];
        const idx = contacts.findIndex((x) => !x.name && !x.phone && !x.email && !x.position);
        if (idx >= 0) contacts[idx] = c;
        else contacts.push(c);
        next.contacts = contacts;
      }
      return next;
    });

  const handleSave = () => {
    if (!form.name.trim()) {
      window.alert('Vui lòng nhập tên khách hàng');
      return;
    }
    onSave(form);
  };

  const title = customer
    ? canEdit
      ? '✏️ Sửa khách hàng'
      : '👀 Xem khách hàng'
    : '➕ Thêm khách hàng mới';

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{title}</Box>
        {canEdit && <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Quét name card */}
          {canEdit && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                p: 1,
                borderRadius: 1,
                border: '1px dashed',
                borderColor: 'divider',
              }}
            >
              <NameCardScanButton onScanned={applyNameCard} />
              <Typography variant="caption" color="text.secondary">
                Đính kèm ảnh danh thiếp — hệ thống tự nhận diện & điền các trường.
              </Typography>
            </Box>
          )}

          {/* Type toggle */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Loại
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={form.type}
              onChange={(_, v) => v && canEdit && setF('type', v as Customer['type'])}
              sx={{ mt: 1 }}
            >
              <ToggleButton value="company" disabled={!canEdit}>🏢 Công ty</ToggleButton>
              <ToggleButton value="individual" disabled={!canEdit}>👤 Cá nhân</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Name */}
          <TextField
            label={`Tên ${form.type === 'company' ? 'công ty' : 'cá nhân'} *`}
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            placeholder={form.type === 'company' ? 'VD: Công ty TNHH ABC...' : 'VD: Nguyễn Văn A...'}
            required
            disabled={!canEdit}
            error={canEdit && !form.name.trim()}
          />

          {/* Address + tax code */}
          <TextField
            label="Địa chỉ"
            value={form.address ?? ''}
            onChange={(e) => setF('address', e.target.value)}
            placeholder="Số nhà, đường, quận/huyện, tỉnh/thành..."
            disabled={!canEdit}
            multiline
          />
          <TextField
            label="Mã số thuế"
            value={form.taxCode ?? ''}
            onChange={(e) => setF('taxCode', e.target.value)}
            placeholder="VD: 0312345678"
            disabled={!canEdit}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Autocomplete
              freeSolo options={CUSTOMER_SOURCES} value={form.source ?? ''} disabled={!canEdit}
              onChange={(_, v) => setF('source', v ?? '')}
              onInputChange={(_, v) => setF('source', v)}
              renderInput={(params) => <TextField {...params} label="Nguồn khách" placeholder="Giới thiệu / Web…" />}
            />
            <Autocomplete
              multiple freeSolo options={CUSTOMER_TAGS} value={form.tags ?? []} disabled={!canEdit}
              onChange={(_, v) => setF('tags', v as string[])}
              renderInput={(params) => <TextField {...params} label="Phân loại (tags)" placeholder="VIP…" />}
            />
          </Box>

          {/* Contacts */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
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
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 1,
                    }}
                  >
                    <TextField size="small" label="Họ tên" value={c.name}
                      onChange={(e) => setContact(i, 'name', e.target.value)}
                      disabled={!canEdit} />
                    <TextField size="small" label="Chức vụ" value={c.position}
                      onChange={(e) => setContact(i, 'position', e.target.value)}
                      disabled={!canEdit} />
                    <TextField size="small" label="Số điện thoại" value={c.phone}
                      onChange={(e) => setContact(i, 'phone', e.target.value)}
                      disabled={!canEdit} />
                    <TextField size="small" label="Email" value={c.email}
                      onChange={(e) => setContact(i, 'email', e.target.value)}
                      disabled={!canEdit} />
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
            placeholder="Ghi chú thêm..."
            disabled={!canEdit}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        {canEdit && (
          <Button
            variant="contained"
            disabled={!form.name.trim()}
            onClick={handleSave}
          >
            💾 Lưu khách hàng
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
