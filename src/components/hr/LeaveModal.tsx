import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { LEAVE_TYPE_LABEL, type HrEmployee, type HrLeave, type LeaveType } from '@/types';

const TYPES: LeaveType[] = ['annual', 'unpaid', 'sick', 'other'];

/** Số ngày giữa 2 mốc (bao gồm cả 2 đầu). */
const leaveDayCount = (start?: string, end?: string): number => {
  if (!start) return 1;
  const e = end || start;
  const d = Math.round((new Date(e).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return d > 0 ? d : 1;
};

const blank = (): HrLeave => ({
  id: '', employeeId: '', type: 'annual', days: 1, reason: '', status: 'pending',
  approverName: '', decisionNote: '', createdAt: '', createdBy: '',
});

type Props = {
  leave: HrLeave | null;
  employees: HrEmployee[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (l: HrLeave) => void;
};

export function LeaveModal({ leave, employees, canEdit, onClose, onSave }: Props) {
  const [form, setForm] = useState<HrLeave>(() => (leave ? { ...leave } : blank()));
  const set = <K extends keyof HrLeave>(k: K, v: HrLeave[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [autoDays, setAutoDays] = useState(!leave);

  // Tự tính số ngày từ khoảng ngày (trừ khi người dùng tự sửa).
  useEffect(() => {
    if (autoDays) setForm((f) => ({ ...f, days: leaveDayCount(f.startDate, f.endDate) }));
  }, [form.startDate, form.endDate, autoDays]);

  const submit = () => {
    if (!form.employeeId) { window.alert('⚠️ Chọn nhân viên xin nghỉ.'); return; }
    if (!form.startDate) { window.alert('⚠️ Chọn ngày bắt đầu nghỉ.'); return; }
    onSave({ ...form, endDate: form.endDate || form.startDate });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{leave ? '✏️ Sửa đơn nghỉ phép' : '➕ Đăng ký nghỉ phép'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Nhân viên *" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} fullWidth disabled={!canEdit || !!leave}>
              <MenuItem value="">—</MenuItem>
              {employees.filter((e) => e.status !== 'resigned').map((e) => <MenuItem key={e.id} value={e.id}>{e.fullName}{e.title ? ` · ${e.title}` : ''}</MenuItem>)}
            </TextField>
            <TextField select label="Loại" value={form.type} onChange={(e) => set('type', e.target.value as LeaveType)} sx={{ width: 150 }} disabled={!canEdit}>
              {TYPES.map((t) => <MenuItem key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Từ ngày *" type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || undefined)} InputLabelProps={{ shrink: true }} fullWidth disabled={!canEdit} />
            <TextField label="Đến ngày" type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || undefined)} InputLabelProps={{ shrink: true }} fullWidth disabled={!canEdit} />
            <TextField label="Số ngày" type="number" inputProps={{ step: 0.5, min: 0.5 }} value={form.days}
              onChange={(e) => { setAutoDays(false); set('days', Number(e.target.value) || 0); }} sx={{ width: 110 }} disabled={!canEdit} />
          </Stack>

          <TextField label="Lý do" value={form.reason} onChange={(e) => set('reason', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
          {leave && leave.status !== 'pending' && (
            <Typography variant="caption" color="text.secondary">
              {leave.status === 'approved' ? 'Đã duyệt' : leave.status === 'rejected' ? 'Từ chối' : 'Đã huỷ'}
              {leave.approverName ? ` bởi ${leave.approverName}` : ''}{leave.decisionNote ? ` — ${leave.decisionNote}` : ''}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && <Button variant="contained" onClick={submit}>Lưu</Button>}
      </DialogActions>
    </Dialog>
  );
}
