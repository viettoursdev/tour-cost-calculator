import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '@/stores/authStore';
import { useProcessStore } from '@/stores/processStore';
import { toast } from '@/stores/toastStore';
import {
  appendLog, setStepStatus, workflowProgress, WORKFLOW_STATUS_META,
} from '@/components/quote/workflowConstants';
import { WorkflowChecklist } from '@/components/quote/WorkflowChecklist';
import { WorkflowKanban } from '@/components/quote/WorkflowKanban';
import { WorkflowStepDialog } from '@/components/quote/WorkflowStepDialog';
import { DEPT_COLOR, DEPT_ICON } from './processSeed';
import { isRunComplete } from './processRun';
import { DEPARTMENTS } from '@/auth/departments';
import type { ProcessRun, WorkflowStatus, WorkflowStep } from '@/types';

type Mode = 'checklist' | 'kanban';
const REF_ICON = { quote: '📄', customer: '🧑', visa: '🛂' } as const;

/** Trang theo dõi 1 phiên chạy quy trình — tick subtask, đổi trạng thái, đóng phiên. */
export function ProcessRunView({ run, onBack }: { run: ProcessRun; onBack: () => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const saveRun = useProcessStore((s) => s.saveRun);
  const deleteRun = useProcessStore((s) => s.deleteRun);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);

  const [steps, setSteps] = useState<WorkflowStep[]>(run.steps);
  const [mode, setMode] = useState<Mode>('checklist');
  const [editing, setEditing] = useState<WorkflowStep | null>(null);

  // Đồng bộ khi bản ghi ngoài thay đổi (realtime từ máy khác).
  useEffect(() => { setSteps(run.steps); }, [run.id, run.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = DEPT_COLOR[run.department];
  const deptLabel = DEPARTMENTS.find((d) => d.id === run.department)?.label ?? run.department;
  const prog = workflowProgress(steps);

  const persist = (next: WorkflowStep[]) => {
    setSteps(next);
    if (!me) return;
    const done = isRunComplete({ ...run, steps: next });
    void saveRun({ ...run, steps: next, status: done ? 'done' : 'active' }, me.name);
  };

  const setStatus = (id: string, status: WorkflowStatus) => {
    let next = setStepStatus(steps, id, status);
    const meta = WORKFLOW_STATUS_META[status];
    next = next.map((s) => (s.id === id ? appendLog(s, [`→ ${meta.label}`], me?.name ?? '') : s));
    persist(next);
  };

  const saveStep = (id: string, patch: Partial<WorkflowStep>) => {
    persist(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setEditing(null);
  };

  const closeRun = () => {
    if (!me) return;
    void saveRun({ ...run, steps, status: 'done' }, me.name);
    toast('Đã đóng phiên chạy 🎉', 'success');
  };

  const remove = async () => {
    if (!window.confirm(`Xoá phiên chạy "${run.title}"?`)) return;
    await deleteRun(run.id);
    toast('Đã xoá phiên chạy', 'info');
    setOpenRun(null);
    onBack();
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton size="small" onClick={onBack}><ArrowBackIcon /></IconButton>
        <Typography fontWeight={900} fontSize={18} sx={{ flex: 1 }}>{DEPT_ICON[run.department]} {run.title}</Typography>
        {run.status === 'done'
          ? <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Đã hoàn tất" />
          : <Button size="small" variant="contained" startIcon={<CheckCircleIcon />} disabled={!isRunComplete({ ...run, steps })} onClick={closeRun}>Đóng phiên</Button>}
        <Tooltip title="Xoá phiên"><IconButton size="small" color="error" onClick={() => void remove()}><DeleteOutlineIcon /></IconButton></Tooltip>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderTop: `3px solid ${color}` }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Chip size="small" label={deptLabel} sx={{ bgcolor: color + '22', color, fontWeight: 700 }} />
          {run.ref && <Chip size="small" variant="outlined" label={`${REF_ICON[run.ref.kind]} ${run.ref.label}`} />}
          {run.assignee && <Chip size="small" variant="outlined" label={`👤 ${users.find((u) => u.u === run.assignee)?.name ?? run.assignee}`} />}
          {run.dueDate && <Chip size="small" variant="outlined" label={`⏰ ${new Date(run.dueDate).toLocaleDateString('vi-VN')}`} />}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flex: 1 }}><LinearProgress variant="determinate" value={prog.pct} sx={{ height: 8, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: color } }} /></Box>
          <Typography fontSize={13} fontWeight={800} sx={{ color }}>{prog.done}/{prog.total} · {prog.pct}%</Typography>
        </Stack>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v: Mode | null) => v && setMode(v)}>
          <ToggleButton value="checklist"><ChecklistIcon fontSize="small" sx={{ mr: 0.5 }} />Checklist</ToggleButton>
          <ToggleButton value="kanban"><ViewKanbanIcon fontSize="small" sx={{ mr: 0.5 }} />Kanban</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {mode === 'checklist'
        ? <WorkflowChecklist steps={steps} users={users} onSetStatus={setStatus} />
        : <WorkflowKanban steps={steps} users={users} onMove={setStatus} onOpen={setEditing} />}

      {editing && (
        <WorkflowStepDialog step={editing} users={users} onClose={() => setEditing(null)}
          onSave={(patch) => saveStep(editing.id, patch)} />
      )}
    </Box>
  );
}
