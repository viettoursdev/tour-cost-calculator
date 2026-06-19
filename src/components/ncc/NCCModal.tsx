import { useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Paper, Rating, Stack, TextField, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import type { NccRating } from '@/types';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { NameCardScanButton } from '@/components/common/NameCardScanButton';
import { AIPartyImportDialog } from '@/components/common/AIPartyImportDialog';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { ParsedNcc } from '@/lib/partyParse';
import type { NameCardFields } from '@/lib/nameCard';
import { NCC_SECTORS, SECTOR_COLOR, NCC_CONTINENTS, NCC_COUNTRIES, NCC_ALL_COUNTRIES } from './constants';
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
  const { state: form, set: setForm, undo, redo, canUndo, canRedo } = useHistoryState<Ncc>(ncc ?? EMPTY_NCC);
  const [aiOpen, setAiOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [newStars, setNewStars] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  const ratings = form.ratings ?? [];
  const avgStars = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0;
  const addRating = () => {
    if (!newStars || !currentUser) return;
    const r: NccRating = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      by: currentUser.u, byName: currentUser.name, at: new Date().toISOString(),
      stars: newStars, comment: newComment.trim(),
    };
    setForm((p) => ({ ...p, ratings: [r, ...(p.ratings ?? [])] }));
    setNewStars(null); setNewComment('');
  };
  const delRating = (id: string) => setForm((p) => ({ ...p, ratings: (p.ratings ?? []).filter((r) => r.id !== id) }));
  useUndoRedoShortcuts(undo, redo, canEdit);

  const setF = <K extends keyof Ncc>(k: K, v: Ncc[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

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

  const applyNameCard = (f: NameCardFields) =>
    setForm((p) => {
      const next = { ...p };
      // Tên NCC ưu tiên tên công ty; chỉ điền khi đang trống.
      if (!next.name.trim()) next.name = f.company || f.name || '';
      if (!next.location?.trim() && f.address) next.location = f.address;
      // Người liên hệ: điền vào contact trống đầu tiên, nếu không có thì thêm mới.
      const c: NccContact = {
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
      // MST không có field riêng ở NCC → ghi vào note.
      if (f.taxCode) next.note = next.note ? `${next.note} · MST: ${f.taxCode}` : `MST: ${f.taxCode}`;
      return next;
    });

  const applyAI = (p: ParsedNcc) => setForm((f) => {
    const kept = f.contacts.filter((c) => c.name || c.phone || c.email || c.position);
    const added: NccContact[] = (p.contacts ?? []).map((c) => ({ name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', position: c.position ?? '' }));
    const merged = [...kept, ...added];
    return {
      ...f,
      ...(p.name ? { name: p.name } : {}),
      ...(p.location ? { location: p.location } : {}),
      ...(p.note ? { note: f.note ? `${f.note}\n${p.note}` : p.note } : {}),
      sectors: Array.from(new Set([...(f.sectors ?? []), ...(p.sectors ?? [])])),
      contacts: merged.length ? merged : f.contacts,
    };
  });

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
              <Button size="small" variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setAiOpen(true)}
                sx={{ borderColor: '#7c3aed', color: '#7c3aed' }}>
                AI nhập & phân tích
              </Button>
              <Typography variant="caption" color="text.secondary">
                Ảnh danh thiếp (quét nhanh) hoặc dán văn bản/hồ sơ → AI điền & nhận định.
              </Typography>
            </Box>
          )}

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

          {/* Sectors — chọn nhanh từ dropdown (gõ thêm được) */}
          <Autocomplete
            multiple
            freeSolo
            size="small"
            disabled={!canEdit}
            options={NCC_SECTORS}
            value={form.sectors}
            onChange={(_, v) => setF('sectors', v as string[])}
            renderTags={(value, getTagProps) =>
              value.map((s, i) => {
                const color = SECTOR_COLOR[s] ?? '#7f8c8d';
                return <Chip {...getTagProps({ index: i })} key={s} label={s} size="small" sx={{ bgcolor: color, color: '#fff', fontWeight: 600, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.8)' } }} />;
              })
            }
            renderInput={(params) => (
              <TextField {...params} label="Lĩnh vực dịch vụ *" placeholder="Chọn hoặc gõ lĩnh vực…"
                error={canEdit && form.sectors.length === 0}
                helperText={canEdit && form.sectors.length === 0 ? 'Chọn ít nhất 1 lĩnh vực' : ''} />
            )}
          />

          {/* Châu lục + Quốc gia */}
          <Stack direction="row" spacing={1.5}>
            <TextField select fullWidth label="Châu lục" value={form.continent ?? ''} disabled={!canEdit}
              onChange={(e) => setForm((p) => ({ ...p, continent: e.target.value, country: '' }))}>
              <MenuItem value=""><em>—</em></MenuItem>
              {NCC_CONTINENTS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Quốc gia" value={form.country ?? ''} disabled={!canEdit}
              onChange={(e) => setF('country', e.target.value)}>
              <MenuItem value=""><em>—</em></MenuItem>
              {(form.continent ? (NCC_COUNTRIES[form.continent] ?? []) : NCC_ALL_COUNTRIES).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>

          {/* Location */}
          <TextField
            label="Địa điểm / Thành phố"
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

          {/* Đánh giá dịch vụ (log người + thời gian) */}
          <Divider textAlign="left">
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ⭐ Đánh giá dịch vụ{ratings.length > 0 ? ` · TB ${avgStars.toFixed(1)}/5 (${ratings.length})` : ''}
            </Typography>
          </Divider>
          {canEdit && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Rating value={newStars} onChange={(_, v) => setNewStars(v)} />
              <TextField size="small" placeholder="Nhận xét dịch vụ (tuỳ chọn)…" value={newComment}
                onChange={(e) => setNewComment(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
              <Button variant="outlined" onClick={addRating} disabled={!newStars}>Thêm đánh giá</Button>
            </Stack>
          )}
          {ratings.length === 0 ? (
            <Typography variant="caption" color="text.disabled">Chưa có đánh giá.</Typography>
          ) : (
            <Stack spacing={0.75}>
              {ratings.map((r) => (
                <Box key={r.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Rating value={r.stars} readOnly size="small" />
                    <Typography variant="caption" fontWeight={700}>{r.byName}</Typography>
                    <Typography variant="caption" color="text.disabled">{new Date(r.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Typography>
                    <Box sx={{ flex: 1 }} />
                    {canEdit && r.by === currentUser?.u && (
                      <IconButton size="small" color="error" onClick={() => delRating(r.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    )}
                  </Stack>
                  {r.comment && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{r.comment}</Typography>}
                </Box>
              ))}
            </Stack>
          )}
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
      <AIPartyImportDialog open={aiOpen} kind="ncc" onClose={() => setAiOpen(false)} onApply={(p) => applyAI(p as ParsedNcc)} />
    </Dialog>
  );
}
