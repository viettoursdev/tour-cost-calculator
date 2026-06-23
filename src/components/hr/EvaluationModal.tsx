import { useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Rating, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  EVAL_STATUS_LABEL, type EvalCompetency, type EvalKpi, type EvalStatus,
  type HrEmployee, type HrEvaluation,
} from '@/types';

const STATUSES: EvalStatus[] = ['draft', 'finalized'];
const rid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const blank = (): HrEvaluation => ({
  id: '', employeeId: '', period: '', reviewerName: '',
  competencies: [], kpis: [], strengths: '', improvements: '', nextGoals: '', promotion: '',
  status: 'draft', createdAt: '', createdBy: '',
});

type Props = {
  evaluation: HrEvaluation | null;
  employees: HrEmployee[];
  canEdit: boolean;
  defaultReviewer?: string;
  onClose: () => void;
  onSave: (e: HrEvaluation) => void;
};

export function EvaluationModal({ evaluation, employees, canEdit, defaultReviewer, onClose, onSave }: Props) {
  const [form, setForm] = useState<HrEvaluation>(() =>
    evaluation
      ? { ...evaluation, competencies: [...evaluation.competencies], kpis: [...evaluation.kpis] }
      : { ...blank(), reviewerName: defaultReviewer ?? '' },
  );
  const set = <K extends keyof HrEvaluation>(k: K, v: HrEvaluation[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Điểm tổng gợi ý = trung bình điểm năng lực (làm tròn 0.1).
  const suggestedOverall = useMemo(() => {
    const scored = form.competencies.filter((c) => c.score > 0);
    if (!scored.length) return undefined;
    return Math.round((scored.reduce((s, c) => s + c.score, 0) / scored.length) * 10) / 10;
  }, [form.competencies]);

  const setComp = (i: number, patch: Partial<EvalCompetency>) =>
    setForm((f) => ({ ...f, competencies: f.competencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addComp = () => setForm((f) => ({ ...f, competencies: [...f.competencies, { id: rid('cp'), name: '', score: 0 }] }));
  const rmComp = (i: number) => setForm((f) => ({ ...f, competencies: f.competencies.filter((_, j) => j !== i) }));

  const setKpi = (i: number, patch: Partial<EvalKpi>) =>
    setForm((f) => ({ ...f, kpis: f.kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)) }));
  const addKpi = () => setForm((f) => ({ ...f, kpis: [...f.kpis, { id: rid('kp'), name: '', target: '', actual: '' }] }));
  const rmKpi = (i: number) => setForm((f) => ({ ...f, kpis: f.kpis.filter((_, j) => j !== i) }));

  const submit = () => {
    if (!form.employeeId) { window.alert('⚠️ Chọn nhân viên được đánh giá.'); return; }
    if (!form.period.trim()) { window.alert('⚠️ Nhập kỳ đánh giá (vd 2026-Q2).'); return; }
    onSave({ ...form, overallScore: form.overallScore ?? suggestedOverall });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{evaluation ? '✏️ Sửa đánh giá' : '➕ Kỳ đánh giá mới'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Nhân viên *" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} fullWidth disabled={!canEdit || !!evaluation}>
              <MenuItem value="">—</MenuItem>
              {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.fullName}{e.title ? ` · ${e.title}` : ''}</MenuItem>)}
            </TextField>
            <TextField label="Kỳ *" placeholder="2026-Q2" value={form.period} onChange={(e) => set('period', e.target.value)} sx={{ width: 140 }} disabled={!canEdit} />
            <TextField select label="Trạng thái" value={form.status} onChange={(e) => set('status', e.target.value as EvalStatus)} sx={{ width: 150 }} disabled={!canEdit}>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{EVAL_STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField label="Người đánh giá" value={form.reviewerName} onChange={(e) => set('reviewerName', e.target.value)} fullWidth disabled={!canEdit} />
            <TextField label="Ngày đánh giá" type="date" value={form.reviewDate ?? ''} onChange={(e) => set('reviewDate', e.target.value || undefined)} InputLabelProps={{ shrink: true }} sx={{ width: 170 }} disabled={!canEdit} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary" noWrap>Điểm tổng:</Typography>
              <Rating value={form.overallScore ?? suggestedOverall ?? 0} precision={0.5} onChange={(_, v) => set('overallScore', v ?? undefined)} disabled={!canEdit} />
            </Stack>
          </Stack>

          <Divider />

          {/* Khung năng lực */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography fontWeight={700}>🎯 Khung năng lực ({form.competencies.length})</Typography>
              {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={addComp}>Thêm tiêu chí</Button>}
            </Stack>
            <Stack spacing={1.25}>
              {form.competencies.map((c, i) => (
                <Stack key={c.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField size="small" label="Năng lực" value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} fullWidth disabled={!canEdit} />
                  <Rating size="small" value={c.score} onChange={(_, v) => setComp(i, { score: v ?? 0 })} disabled={!canEdit} />
                  <TextField size="small" label="Nhận xét" value={c.comment ?? ''} onChange={(e) => setComp(i, { comment: e.target.value })} fullWidth disabled={!canEdit} />
                  {canEdit && <IconButton size="small" color="error" onClick={() => rmComp(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          {/* KPI */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography fontWeight={700}>📊 KPI ({form.kpis.length})</Typography>
              {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={addKpi}>Thêm KPI</Button>}
            </Stack>
            <Stack spacing={1.25}>
              {form.kpis.map((k, i) => (
                <Stack key={k.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  <TextField size="small" label="Chỉ tiêu" value={k.name} onChange={(e) => setKpi(i, { name: e.target.value })} fullWidth disabled={!canEdit} />
                  <TextField size="small" label="Mục tiêu" value={k.target} onChange={(e) => setKpi(i, { target: e.target.value })} sx={{ width: 130 }} disabled={!canEdit} />
                  <TextField size="small" label="Thực đạt" value={k.actual} onChange={(e) => setKpi(i, { actual: e.target.value })} sx={{ width: 130 }} disabled={!canEdit} />
                  {canEdit && <IconButton size="small" color="error" onClick={() => rmKpi(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          <TextField label="Điểm mạnh" value={form.strengths} onChange={(e) => set('strengths', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
          <TextField label="Cần cải thiện" value={form.improvements} onChange={(e) => set('improvements', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
          <TextField label="Mục tiêu kỳ tới" value={form.nextGoals} onChange={(e) => set('nextGoals', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
          <TextField label="Đề xuất thăng tiến / lộ trình" value={form.promotion} onChange={(e) => set('promotion', e.target.value)} fullWidth multiline minRows={2} disabled={!canEdit} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && <Button variant="contained" onClick={submit}>Lưu</Button>}
      </DialogActions>
    </Dialog>
  );
}
