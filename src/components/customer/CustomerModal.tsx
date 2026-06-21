import { useState, type ChangeEvent } from 'react';
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { AiButton } from '@/components/common/AiButton';
import { CUSTOMER_SOURCES, CUSTOMER_TAGS } from './constants';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { NameCardScanButton } from '@/components/common/NameCardScanButton';
import { AIPartyImportDialog } from '@/components/common/AIPartyImportDialog';
import { useAuthStore } from '@/stores/authStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { attMeta } from '@/lib/util';
import type { NameCardFields } from '@/lib/nameCard';
import type { ParsedCustomer } from '@/lib/partyParse';
import type { BankInfo, Customer, CustomerContact } from '@/types';

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
  const [aiOpen, setAiOpen] = useState(false);
  useUndoRedoShortcuts(undo, redo, canEdit);

  const applyAI = (p: ParsedCustomer) => setForm((f) => {
    const kept = f.contacts.filter((c) => c.name || c.phone || c.email || c.position);
    const added: CustomerContact[] = (p.contacts ?? []).map((c) => ({ name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', position: c.position ?? '' }));
    const merged = [...kept, ...added];
    return {
      ...f,
      ...(p.name ? { name: p.name } : {}),
      ...(p.type ? { type: p.type } : {}),
      ...(p.address ? { address: p.address } : {}),
      ...(p.taxCode ? { taxCode: p.taxCode } : {}),
      ...(p.source ? { source: p.source } : {}),
      ...(p.note ? { note: f.note ? `${f.note}\n${p.note}` : p.note } : {}),
      tags: Array.from(new Set([...(f.tags ?? []), ...(p.tags ?? [])])),
      contacts: merged.length ? merged : f.contacts,
    };
  });

  const setF = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const setRefundBank = (patch: Partial<BankInfo>) =>
    setForm((p) => ({ ...p, refundBank: { ...(p.refundBank ?? {}), ...patch } }));

  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [fileBusy, setFileBusy] = useState(false);
  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setFileBusy(true);
    try {
      const at = new Date().toISOString();
      const up = (await Promise.all(files.map((f) => uploadFileToWorker(f)))).map((u) => ({ ...u, uploadedBy: currentUser?.name, uploadedAt: at }));
      setForm((p) => ({ ...p, files: [...(p.files ?? []), ...up] }));
    } catch (err) { window.alert('❌ Tải file lỗi: ' + (err as Error).message); }
    finally { setFileBusy(false); }
  };
  const removeFile = (key: string) => setForm((p) => ({ ...p, files: (p.files ?? []).filter((f) => f.key !== key) }));

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
              <AiButton size="small" onClick={() => setAiOpen(true)}>
                AI nhập & phân tích
              </AiButton>
              <Typography variant="caption" color="text.secondary">
                Ảnh danh thiếp (quét nhanh) hoặc dán văn bản/hồ sơ → AI điền & nhận định.
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

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
            <TextField select label="Sales phụ trách" value={form.ownerU ?? ''} disabled={!canEdit}
              onChange={(e) => { const u = users.find((x) => x.u === e.target.value); setForm((p) => ({ ...p, ownerU: u?.u, ownerName: u?.name })); }}>
              <MenuItem value=""><em>—</em></MenuItem>
              {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name} ({u.role})</MenuItem>)}
            </TextField>
            <TextField label="Kênh ưa thích" value={form.preferredChannel ?? ''} onChange={(e) => setF('preferredChannel', e.target.value)} disabled={!canEdit} placeholder="Zalo / Email / Điện thoại" />
            {form.type === 'individual' && (
              <TextField label="Sinh nhật" type="date" value={form.birthday ?? ''} onChange={(e) => setF('birthday', e.target.value)} disabled={!canEdit} InputLabelProps={{ shrink: true }} />
            )}
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
                    <TextField size="small" label="Sinh nhật" type="date" value={c.birthday ?? ''}
                      onChange={(e) => setContact(i, 'birthday', e.target.value)}
                      disabled={!canEdit} InputLabelProps={{ shrink: true }} />
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Box>

          {/* Điều khoản thanh toán / công nợ */}
          <Divider textAlign="left"><Typography variant="caption" fontWeight={800} color="text.secondary">THANH TOÁN / CÔNG NỢ (tuỳ chọn)</Typography></Divider>
          <Stack direction="row" spacing={1.5}>
            <TextField fullWidth label="Điều khoản thanh toán" value={form.paymentTerms ?? ''} onChange={(e) => setF('paymentTerms', e.target.value)} disabled={!canEdit} placeholder="VD: cọc 50%, còn lại trước khởi hành 7 ngày" />
            <TextField label="Hạn mức công nợ (VND)" type="number" value={form.creditLimit ?? ''} onChange={(e) => setF('creditLimit', e.target.value ? Number(e.target.value) : undefined)} disabled={!canEdit} sx={{ width: 190 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField fullWidth label="TK hoàn tiền — Chủ TK" value={form.refundBank?.accountName ?? ''} onChange={(e) => setRefundBank({ accountName: e.target.value })} disabled={!canEdit} />
            <TextField fullWidth label="Số TK" value={form.refundBank?.accountNo ?? ''} onChange={(e) => setRefundBank({ accountNo: e.target.value })} disabled={!canEdit} />
            <TextField fullWidth label="Ngân hàng" value={form.refundBank?.bankName ?? ''} onChange={(e) => setRefundBank({ bankName: e.target.value })} disabled={!canEdit} />
          </Stack>

          {/* File đính kèm */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>File đính kèm</Typography>
              {canEdit && (
                <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={fileBusy}>
                  {fileBusy ? 'Đang tải…' : 'Tải file'}
                  <input type="file" hidden multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => void onPickFiles(e)} />
                </Button>
              )}
            </Stack>
            {(form.files ?? []).length === 0 ? (
              <Typography variant="caption" color="text.disabled">Hợp đồng khách, ĐKKD, giấy tờ doanh nghiệp…</Typography>
            ) : (
              <Stack spacing={0.5}>
                {(form.files ?? []).map((f) => (
                  <Stack key={f.key} direction="row" alignItems="center" spacing={1}>
                    <Box component="button" type="button" onClick={() => openFilePreview({ key: f.key, name: f.name })}
                      sx={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', bgcolor: 'transparent', cursor: 'pointer', p: 0, fontSize: 13, fontWeight: 600, color: '#0d7a6a', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
                      📎 {f.name}{attMeta(f) ? ` · ${attMeta(f)}` : ''}
                    </Box>
                    {canEdit && <Button size="small" color="error" onClick={() => removeFile(f.key)}>Gỡ</Button>}
                  </Stack>
                ))}
              </Stack>
            )}
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
      <AIPartyImportDialog open={aiOpen} kind="customer" onClose={() => setAiOpen(false)} onApply={(p) => applyAI(p as ParsedCustomer)} />
    </Dialog>
  );
}
