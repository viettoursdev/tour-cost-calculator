import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewListIcon from '@mui/icons-material/ViewList';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import {
  defaultWorkflow, newWorkflowStep, setStepStatus, workflowProgress, WORKFLOW_STATUS_META,
} from './workflowConstants';
import { WorkflowKanban } from './WorkflowKanban';
import { WorkflowList } from './WorkflowList';
import { WorkflowChecklist } from './WorkflowChecklist';
import { WorkflowGantt } from './WorkflowGantt';
import { WorkflowStepDialog } from './WorkflowStepDialog';
import type { WorkflowStatus, WorkflowStep } from '@/types';

type Mode = 'kanban' | 'list' | 'checklist' | 'gantt';
const MODE_KEY = 'vte_workflow_view';
const NO_STEPS: WorkflowStep[] = [];

export function WorkflowView() {
  const steps = useQuoteStore((s) => s.draft.workflow) ?? NO_STEPS;
  const setWorkflow = useQuoteStore((s) => s.setWorkflow);
  const users = useAuthStore((s) => s.users);

  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'kanban');
  const [editing, setEditing] = useState<WorkflowStep | null>(null);

  // Seed 13 bước mặc định khi mở tab lần đầu.
  useEffect(() => {
    if (!useQuoteStore.getState().draft.workflow?.length) setWorkflow(defaultWorkflow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeMode = (m: Mode | null) => { if (m) { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } } };

  const update = (id: string, patch: Partial<WorkflowStep>) => {
    let next = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    if (patch.status) next = setStepStatus(next, id, patch.status);
    setWorkflow(next);
  };
  const setStatus = (id: string, status: WorkflowStatus) => setWorkflow(setStepStatus(steps, id, status));
  const del = (id: string) => { if (window.confirm('Xoá bước này khỏi quy trình?')) setWorkflow(steps.filter((s) => s.id !== id)); };
  const add = () => setWorkflow([...steps, newWorkflowStep()]);
  const reorder = (from: number, to: number) => {
    const a = [...steps]; const [m] = a.splice(from, 1); a.splice(to, 0, m); setWorkflow(a);
  };

  const prog = workflowProgress(steps);
  const current = steps.find((s) => s.status !== 'done');

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography fontWeight={900} fontSize={16}>🗂️ Quy trình vận hành</Typography>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 0.75 }}>
              <Box sx={{ flex: 1, maxWidth: 320 }}>
                <LinearProgress variant="determinate" value={prog.pct}
                  sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#27ae60' } }} />
              </Box>
              <Typography variant="caption" fontWeight={800} color="text.secondary">{prog.done}/{prog.total} bước · {prog.pct}%</Typography>
            </Stack>
            {current && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                ▶ Bước hiện tại: <Chip size="small" label={current.label} sx={{ bgcolor: WORKFLOW_STATUS_META[current.status].color + '22', color: WORKFLOW_STATUS_META[current.status].color, fontWeight: 700, height: 20 }} />
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => changeMode(m)}>
              <ToggleButton value="kanban"><ViewKanbanIcon fontSize="small" sx={{ mr: 0.5 }} />Kanban</ToggleButton>
              <ToggleButton value="list"><ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />List</ToggleButton>
              <ToggleButton value="checklist"><ChecklistIcon fontSize="small" sx={{ mr: 0.5 }} />Checklist</ToggleButton>
              <ToggleButton value="gantt"><ViewTimelineIcon fontSize="small" sx={{ mr: 0.5 }} />Gantt</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={add}
              sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', whiteSpace: 'nowrap' }}>
              Thêm bước
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {mode === 'kanban' && <WorkflowKanban steps={steps} users={users} onMove={setStatus} onOpen={setEditing} />}
      {mode === 'list' && <WorkflowList steps={steps} users={users} onUpdate={update} onDelete={del} onReorder={reorder} />}
      {mode === 'checklist' && <WorkflowChecklist steps={steps} users={users} onSetStatus={setStatus} />}
      {mode === 'gantt' && <WorkflowGantt steps={steps} onOpen={setEditing} />}

      {editing && (
        <WorkflowStepDialog
          step={editing} users={users}
          onClose={() => setEditing(null)}
          onSave={(patch) => { update(editing.id, patch); setEditing(null); }}
        />
      )}
    </Box>
  );
}
