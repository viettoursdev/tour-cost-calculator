import { useState } from 'react';
import {
  Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Rating, Stack, TextField, Typography,
} from '@mui/material';
import { daysUntil } from '@/lib/dateUtils';
import { GUIDE_STATUS_LABEL, type GuideStatus, type HrGuide } from '@/types';

const STATUSES: GuideStatus[] = ['active', 'paused', 'blacklist'];
const LANG_PRESETS = ['Tiếng Anh', 'Tiếng Trung', 'Tiếng Nhật', 'Tiếng Hàn', 'Tiếng Pháp', 'Tiếng Đức', 'Tiếng Nga', 'Tiếng Thái'];
const REGION_PRESETS = ['Miền Bắc', 'Miền Trung', 'Miền Nam', 'Tây Bắc', 'Tây Nguyên', 'ĐBSCL', 'Quốc tế'];

const blank = (): HrGuide => ({
  id: '', fullName: '', phone: '', email: '', guideCardNo: '',
  languages: [], regions: [], status: 'active', notes: '', createdAt: '', createdBy: '',
});

function CardExpiryBadge({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return null;
  const d = daysUntil(expiresAt);
  if (d === null) return null;
  if (d < 0) return <Chip size="small" color="error" label={`Thẻ hết hạn ${-d} ngày`} />;
  if (d <= 30) return <Chip size="small" color="error" variant="outlined" label={`Thẻ còn ${d} ngày`} />;
  if (d <= 90) return <Chip size="small" color="warning" variant="outlined" label={`Thẻ còn ${d} ngày`} />;
  return <Chip size="small" variant="outlined" label={`Thẻ còn ${d} ngày`} />;
}

type Props = {
  guide: HrGuide | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (g: HrGuide) => void;
};

export function GuideModal({ guide, canEdit, onClose, onSave }: Props) {
  const [form, setForm] = useState<HrGuide>(() => (guide ? { ...guide } : blank()));
  const set = <K extends keyof HrGuide>(k: K, v: HrGuide[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.fullName.trim()) { window.alert('⚠️ Vui lòng nhập tên HDV.'); return; }
    onSave({ ...form, fullName: form.fullName.trim() });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{guide ? '✏️ Sửa HDV cộng tác viên' : '➕ Thêm HDV cộng tác viên'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Họ tên *" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField select label="Trạng thái" value={form.status} onChange={(e) => set('status', e.target.value as GuideStatus)} sx={{ width: 180 }} disabled={!canEdit}>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{GUIDE_STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Điện thoại" value={form.phone} onChange={(e) => set('phone', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} fullWidth disabled={!canEdit} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField label="Số thẻ HDV" value={form.guideCardNo} onChange={(e) => set('guideCardNo', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Thẻ hết hạn" type="date" value={form.guideCardExpires ?? ''} onChange={(e) => set('guideCardExpires', e.target.value || undefined)} InputLabelProps={{ shrink: true }} sx={{ width: 170 }} disabled={!canEdit} />
            <CardExpiryBadge expiresAt={form.guideCardExpires} />
          </Stack>

          <Autocomplete
            multiple freeSolo options={LANG_PRESETS} value={form.languages}
            onChange={(_, v) => set('languages', v)} disabled={!canEdit}
            renderInput={(p) => <TextField {...p} label="Ngôn ngữ phục vụ" placeholder="Thêm ngôn ngữ" />}
          />
          <Autocomplete
            multiple freeSolo options={REGION_PRESETS} value={form.regions}
            onChange={(_, v) => set('regions', v)} disabled={!canEdit}
            renderInput={(p) => <TextField {...p} label="Tuyến / vùng phục vụ" placeholder="Thêm tuyến" />}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">Đánh giá:</Typography>
              <Rating value={form.rating ?? 0} precision={0.5} onChange={(_, v) => set('rating', v ?? undefined)} disabled={!canEdit} />
            </Stack>
            <TextField label="Thù lao/ngày (VND)" type="number" value={form.dayRate ?? ''} onChange={(e) => set('dayRate', e.target.value ? Number(e.target.value) : undefined)} sx={{ width: 200 }} disabled={!canEdit} />
          </Stack>

          <TextField label="Ghi chú" value={form.notes} onChange={(e) => set('notes', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && <Button variant="contained" onClick={submit}>Lưu</Button>}
      </DialogActions>
    </Dialog>
  );
}
