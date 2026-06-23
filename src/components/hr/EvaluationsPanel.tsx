import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, IconButton, MenuItem, Rating, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useHrEvalStore } from '@/stores/hrEvalStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { EVAL_STATUS_LABEL, type HrEmployee, type HrEvaluation } from '@/types';
import { EvaluationModal } from './EvaluationModal';

export function EvaluationsPanel({ employees }: { employees: HrEmployee[] }) {
  const evaluations = useHrEvalStore((s) => s.evaluations);
  const save = useHrEvalStore((s) => s.save);
  const del = useHrEvalStore((s) => s.delete);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = hasPerm(currentUser, 'manageHR');

  const [empFilter, setEmpFilter] = useState('');
  const [modal, setModal] = useState<{ evaluation: HrEvaluation | null } | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, e.fullName]));
    return (id: string) => m.get(id) ?? '(đã xoá)';
  }, [employees]);

  const filtered = useMemo(
    () => evaluations.filter((e) => !empFilter || e.employeeId === empFilter),
    [evaluations, empFilter],
  );

  const handleDelete = (e: HrEvaluation) => {
    if (window.confirm(`Xoá kỳ đánh giá "${nameOf(e.employeeId)} · ${e.period}"?`)) void del(e.id);
  };
  const handleSave = (e: HrEvaluation) => { void save(e); setModal(null); };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
        <TextField size="small" select label="Lọc theo nhân viên" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Tất cả nhân viên</MenuItem>
          {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.fullName}</MenuItem>)}
        </TextField>
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setModal({ evaluation: null })}>Kỳ đánh giá mới</Button>}
      </Stack>

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{evaluations.length ? 'Không có kỳ đánh giá khớp bộ lọc.' : 'Chưa có kỳ đánh giá nào.'}</Typography>
      ) : (
        <Stack spacing={0.75}>
          {filtered.map((e) => (
            <Stack
              key={e.id} direction="row" alignItems="center" spacing={1.5}
              sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={700} noWrap>{nameOf(e.employeeId)}</Typography>
                  <Chip size="small" variant="outlined" label={e.period} />
                  {e.overallScore ? <Rating size="small" value={e.overallScore} precision={0.5} readOnly /> : null}
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {e.competencies.length} năng lực · {e.kpis.length} KPI
                  {e.reviewerName ? ` · ${e.reviewerName}` : ''}
                  {e.promotion ? ' · có đề xuất thăng tiến' : ''}
                </Typography>
              </Box>
              <Chip size="small" color={e.status === 'finalized' ? 'success' : 'default'} label={EVAL_STATUS_LABEL[e.status]} />
              <IconButton size="small" onClick={() => setModal({ evaluation: e })}><EditIcon fontSize="small" /></IconButton>
              {canEdit && <IconButton size="small" color="error" onClick={() => handleDelete(e)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
            </Stack>
          ))}
        </Stack>
      )}

      {modal && (
        <EvaluationModal
          evaluation={modal.evaluation}
          employees={employees}
          canEdit={canEdit}
          defaultReviewer={currentUser?.name}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
}
