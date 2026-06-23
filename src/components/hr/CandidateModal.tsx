import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, MenuItem, Rating, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonRemoveAlt1Icon from '@mui/icons-material/PersonRemoveAlt1';
import { DEPARTMENTS } from '@/auth/departments';
import { fmtDate } from '@/lib/dateUtils';
import {
  CANDIDATE_STAGE_LABEL, CANDIDATE_STAGE_ORDER, type CandidateNote, type CandidateStage,
  type HrCandidate, type HrJobPosting,
} from '@/types';

const rid = () => 'cn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const blank = (): HrCandidate => ({
  id: '', fullName: '', phone: '', email: '', source: '', position: '', department: '',
  stage: 'new', notes: '', interviewNotes: [], createdAt: '', createdBy: '',
});

type Props = {
  candidate: HrCandidate | null;
  postings: HrJobPosting[];
  canEdit: boolean;
  reviewerName?: string;
  onClose: () => void;
  onSave: (c: HrCandidate) => void;
  onConvert: (c: HrCandidate) => void;   // "Nhận việc" → tạo hồ sơ NV
  onDelete?: (c: HrCandidate) => void;
};

export function CandidateModal({ candidate, postings, canEdit, reviewerName, onClose, onSave, onConvert, onDelete }: Props) {
  const [form, setForm] = useState<HrCandidate>(() =>
    candidate ? { ...candidate, interviewNotes: [...candidate.interviewNotes] } : blank(),
  );
  const set = <K extends keyof HrCandidate>(k: K, v: HrCandidate[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [noteText, setNoteText] = useState('');

  const addNote = () => {
    if (!noteText.trim()) return;
    const n: CandidateNote = { id: rid(), at: new Date().toISOString(), byName: reviewerName ?? '', stage: form.stage, text: noteText.trim() };
    setForm((f) => ({ ...f, interviewNotes: [n, ...f.interviewNotes] }));
    setNoteText('');
  };
  const rmNote = (id: string) => setForm((f) => ({ ...f, interviewNotes: f.interviewNotes.filter((n) => n.id !== id) }));

  const submit = () => {
    if (!form.fullName.trim()) { window.alert('⚠️ Nhập tên ứng viên.'); return; }
    onSave({ ...form, fullName: form.fullName.trim() });
  };

  const alreadyConverted = !!form.convertedEmployeeId;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{candidate ? '✏️ Hồ sơ ứng viên' : '➕ Thêm ứng viên'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Họ tên *" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField select label="Giai đoạn" value={form.stage} onChange={(e) => set('stage', e.target.value as CandidateStage)} sx={{ width: 170 }} disabled={!canEdit}>
              {CANDIDATE_STAGE_ORDER.map((s) => <MenuItem key={s} value={s}>{CANDIDATE_STAGE_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Điện thoại" value={form.phone} onChange={(e) => set('phone', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} fullWidth disabled={!canEdit} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Tin tuyển dụng" value={form.postingId ?? ''} onChange={(e) => set('postingId', e.target.value || undefined)} fullWidth disabled={!canEdit}>
              <MenuItem value="">— (không gắn) —</MenuItem>
              {postings.map((p) => <MenuItem key={p.id} value={p.id}>{p.title}</MenuItem>)}
            </TextField>
            <TextField label="Vị trí ứng tuyển" value={form.position} onChange={(e) => set('position', e.target.value)} fullWidth disabled={!canEdit} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Phòng ban" value={form.department} onChange={(e) => set('department', e.target.value as HrCandidate['department'])} sx={{ minWidth: 180 }} disabled={!canEdit}>
              <MenuItem value="">—</MenuItem>
              {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>)}
            </TextField>
            <TextField label="Nguồn" value={form.source} onChange={(e) => set('source', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Ngày ứng tuyển" type="date" value={form.appliedDate ?? ''} onChange={(e) => set('appliedDate', e.target.value || undefined)} InputLabelProps={{ shrink: true }} sx={{ width: 170 }} disabled={!canEdit} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField label="Link CV" value={form.cvUrl ?? ''} onChange={(e) => set('cvUrl', e.target.value || undefined)} fullWidth disabled={!canEdit} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">Đánh giá:</Typography>
              <Rating value={form.rating ?? 0} precision={0.5} onChange={(_, v) => set('rating', v ?? undefined)} disabled={!canEdit} />
            </Stack>
          </Stack>

          <TextField label="Ghi chú chung" value={form.notes} onChange={(e) => set('notes', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />

          <Divider />

          {/* Nhật ký phỏng vấn */}
          <Box>
            <Typography fontWeight={700} mb={1}>🗒️ Nhật ký phỏng vấn ({form.interviewNotes.length})</Typography>
            {canEdit && (
              <Stack direction="row" spacing={1} mb={1}>
                <TextField size="small" placeholder="Thêm nhận xét vòng hiện tại…" value={noteText} onChange={(e) => setNoteText(e.target.value)} fullWidth
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }} />
                <Button size="small" startIcon={<AddIcon />} onClick={addNote}>Ghi</Button>
              </Stack>
            )}
            <Stack spacing={0.75}>
              {form.interviewNotes.map((n) => (
                <Stack key={n.id} direction="row" alignItems="flex-start" spacing={1} sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Chip size="small" variant="outlined" label={CANDIDATE_STAGE_LABEL[n.stage]} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2">{n.text}</Typography>
                    <Typography variant="caption" color="text.secondary">{n.byName || '—'} · {fmtDate(n.at)}</Typography>
                  </Box>
                  {canEdit && <IconButton size="small" color="error" onClick={() => rmNote(n.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
            </Stack>
          </Box>

          {alreadyConverted && <Alert severity="success">Đã tạo hồ sơ nhân sự từ ứng viên này.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1}>
          {canEdit && candidate && !alreadyConverted && (
            <Button color="success" startIcon={<PersonAddAlt1Icon />} onClick={() => onConvert(form)}>
              Nhận việc → tạo hồ sơ NV
            </Button>
          )}
          {canEdit && candidate && onDelete && (
            <Button color="error" startIcon={<PersonRemoveAlt1Icon />} onClick={() => onDelete(candidate)}>
              Xoá ứng viên
            </Button>
          )}
        </Stack>
        <Box>
          <Button onClick={onClose}>Đóng</Button>
          {canEdit && <Button variant="contained" onClick={submit} sx={{ ml: 1 }}>Lưu</Button>}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
