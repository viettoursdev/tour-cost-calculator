import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DEPARTMENTS } from '@/auth/departments';
import { daysUntil } from '@/lib/dateUtils';
import { EMPLOYMENT_STATUS_LABEL, type EmploymentStatus, type HrDocument, type HrEmployee } from '@/types';

const STATUSES: EmploymentStatus[] = ['probation', 'official', 'resigned'];
const DOC_KINDS = ['HĐLĐ', 'Bằng cấp', 'Chứng chỉ', 'BHXH', 'CCCD', 'Khác'];

const newDocId = () => 'doc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const blank = (): HrEmployee => ({
  id: '', employeeCode: '', fullName: '', email: '', phone: '', gender: '',
  department: '', title: '', level: '', status: 'probation', notes: '', documents: [],
  emergencyContact: {}, createdAt: '', createdBy: '',
});

/** Badge cảnh báo hết hạn giấy tờ: ≤30 ngày đỏ, ≤90 ngày cam, đã hết hạn đỏ đậm. */
function ExpiryBadge({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return null;
  const d = daysUntil(expiresAt);
  if (d === null) return null;
  if (d < 0) return <Chip size="small" color="error" label={`Hết hạn ${-d} ngày`} />;
  if (d <= 30) return <Chip size="small" color="error" variant="outlined" label={`Còn ${d} ngày`} />;
  if (d <= 90) return <Chip size="small" color="warning" variant="outlined" label={`Còn ${d} ngày`} />;
  return <Chip size="small" variant="outlined" label={`Còn ${d} ngày`} />;
}

type Props = {
  employee: HrEmployee | null;     // null = tạo mới
  all: HrEmployee[];               // để chọn quản lý trực tiếp
  canEdit: boolean;
  onClose: () => void;
  onSave: (e: HrEmployee) => void;
};

export function EmployeeModal({ employee, all, canEdit, onClose, onSave }: Props) {
  const [form, setForm] = useState<HrEmployee>(() => (employee ? { ...employee, documents: [...employee.documents] } : blank()));
  const set = <K extends keyof HrEmployee>(k: K, v: HrEmployee[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Ứng viên làm quản lý: mọi nhân viên khác (tránh tự trỏ chính mình).
  const managerOptions = useMemo(
    () => all.filter((e) => e.id !== form.id).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [all, form.id],
  );

  const setDoc = (i: number, patch: Partial<HrDocument>) =>
    setForm((f) => ({ ...f, documents: f.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const addDoc = () =>
    setForm((f) => ({ ...f, documents: [...f.documents, { id: newDocId(), kind: 'HĐLĐ', name: '' }] }));
  const removeDoc = (i: number) =>
    setForm((f) => ({ ...f, documents: f.documents.filter((_, j) => j !== i) }));

  const submit = () => {
    if (!form.fullName.trim()) { window.alert('⚠️ Vui lòng nhập họ tên nhân viên.'); return; }
    onSave({ ...form, fullName: form.fullName.trim() });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{employee ? '✏️ Sửa hồ sơ nhân sự' : '➕ Thêm nhân sự'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Thông tin cơ bản */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Họ tên *" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Mã NV" value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} sx={{ width: 140 }} disabled={!canEdit} />
            <TextField select label="Trạng thái" value={form.status} onChange={(e) => set('status', e.target.value as EmploymentStatus)} sx={{ width: 160 }} disabled={!canEdit}>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Điện thoại" value={form.phone} onChange={(e) => set('phone', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField select label="Giới tính" value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value as HrEmployee['gender'])} sx={{ width: 140 }} disabled={!canEdit}>
              <MenuItem value="">—</MenuItem>
              <MenuItem value="male">Nam</MenuItem>
              <MenuItem value="female">Nữ</MenuItem>
              <MenuItem value="other">Khác</MenuItem>
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Phòng ban" value={form.department} onChange={(e) => set('department', e.target.value as HrEmployee['department'])} fullWidth disabled={!canEdit}>
              <MenuItem value="">—</MenuItem>
              {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>)}
            </TextField>
            <TextField label="Chức danh" value={form.title} onChange={(e) => set('title', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Cấp bậc" value={form.level} onChange={(e) => set('level', e.target.value)} sx={{ width: 160 }} disabled={!canEdit} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Quản lý trực tiếp" value={form.managerId ?? ''} onChange={(e) => set('managerId', e.target.value || undefined)} fullWidth disabled={!canEdit}>
              <MenuItem value="">—</MenuItem>
              {managerOptions.map((m) => <MenuItem key={m.id} value={m.id}>{m.fullName}{m.title ? ` · ${m.title}` : ''}</MenuItem>)}
            </TextField>
            <TextField label="Ngày sinh" type="date" value={form.dob ?? ''} onChange={(e) => set('dob', e.target.value || undefined)} InputLabelProps={{ shrink: true }} sx={{ width: 170 }} disabled={!canEdit} />
            <TextField label="Ngày vào làm" type="date" value={form.joinDate ?? ''} onChange={(e) => set('joinDate', e.target.value || undefined)} InputLabelProps={{ shrink: true }} sx={{ width: 170 }} disabled={!canEdit} />
          </Stack>

          {/* Liên hệ khẩn cấp */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Người liên hệ khẩn cấp" value={form.emergencyContact?.name ?? ''} onChange={(e) => set('emergencyContact', { ...form.emergencyContact, name: e.target.value })} fullWidth disabled={!canEdit} />
            <TextField label="SĐT khẩn cấp" value={form.emergencyContact?.phone ?? ''} onChange={(e) => set('emergencyContact', { ...form.emergencyContact, phone: e.target.value })} fullWidth disabled={!canEdit} />
            <TextField label="Quan hệ" value={form.emergencyContact?.relation ?? ''} onChange={(e) => set('emergencyContact', { ...form.emergencyContact, relation: e.target.value })} sx={{ width: 160 }} disabled={!canEdit} />
          </Stack>

          <TextField label="Ghi chú" value={form.notes} onChange={(e) => set('notes', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />

          <Divider />

          {/* Giấy tờ + nhắc hạn */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography fontWeight={700}>📎 Giấy tờ ({form.documents.length})</Typography>
              {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={addDoc}>Thêm giấy tờ</Button>}
            </Stack>
            {form.documents.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có giấy tờ. Hệ thống cảnh báo khi còn ≤90/≤30 ngày là hết hạn.</Typography>}
            <Stack spacing={1.5}>
              {form.documents.map((d, i) => (
                <Stack key={d.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField select size="small" label="Loại" value={d.kind} onChange={(e) => setDoc(i, { kind: e.target.value })} sx={{ width: 130 }} disabled={!canEdit}>
                    {DOC_KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Tên / số" value={d.name} onChange={(e) => setDoc(i, { name: e.target.value })} fullWidth disabled={!canEdit} />
                  <TextField size="small" label="Ngày cấp" type="date" value={d.issuedAt ?? ''} onChange={(e) => setDoc(i, { issuedAt: e.target.value || undefined })} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} disabled={!canEdit} />
                  <TextField size="small" label="Hết hạn" type="date" value={d.expiresAt ?? ''} onChange={(e) => setDoc(i, { expiresAt: e.target.value || undefined })} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} disabled={!canEdit} />
                  <ExpiryBadge expiresAt={d.expiresAt} />
                  {canEdit && <IconButton size="small" color="error" onClick={() => removeDoc(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && <Button variant="contained" onClick={submit}>Lưu</Button>}
      </DialogActions>
    </Dialog>
  );
}
