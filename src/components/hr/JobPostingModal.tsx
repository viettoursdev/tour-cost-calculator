import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from '@mui/material';
import { DEPARTMENTS } from '@/auth/departments';
import { JOB_STATUS_LABEL, type HrJobPosting, type JobStatus } from '@/types';

const STATUSES: JobStatus[] = ['open', 'onhold', 'closed'];

const blank = (): HrJobPosting => ({
  id: '', title: '', department: '', level: '', headcount: 1, salaryRange: '',
  status: 'open', description: '', createdAt: '', createdBy: '',
});

type Props = {
  posting: HrJobPosting | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (p: HrJobPosting) => void;
};

export function JobPostingModal({ posting, canEdit, onClose, onSave }: Props) {
  const [form, setForm] = useState<HrJobPosting>(() => (posting ? { ...posting } : blank()));
  const set = <K extends keyof HrJobPosting>(k: K, v: HrJobPosting[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) { window.alert('⚠️ Nhập tên vị trí tuyển dụng.'); return; }
    onSave({ ...form, title: form.title.trim() });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{posting ? '✏️ Sửa tin tuyển dụng' : '➕ Tin tuyển dụng mới'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField label="Vị trí *" value={form.title} onChange={(e) => set('title', e.target.value)} fullWidth disabled={!canEdit} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Phòng ban" value={form.department} onChange={(e) => set('department', e.target.value as HrJobPosting['department'])} fullWidth disabled={!canEdit}>
              <MenuItem value="">—</MenuItem>
              {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>)}
            </TextField>
            <TextField label="Cấp bậc" value={form.level} onChange={(e) => set('level', e.target.value)} sx={{ width: 150 }} disabled={!canEdit} />
            <TextField label="Số lượng" type="number" value={form.headcount} onChange={(e) => set('headcount', Math.max(1, Number(e.target.value) || 1))} sx={{ width: 110 }} disabled={!canEdit} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Mức lương dự kiến" value={form.salaryRange} onChange={(e) => set('salaryRange', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField select label="Trạng thái" value={form.status} onChange={(e) => set('status', e.target.value as JobStatus)} sx={{ width: 150 }} disabled={!canEdit}>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{JOB_STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="Mô tả công việc (JD)" value={form.description} onChange={(e) => set('description', e.target.value)} fullWidth multiline minRows={4} disabled={!canEdit} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && <Button variant="contained" onClick={submit}>Lưu</Button>}
      </DialogActions>
    </Dialog>
  );
}
