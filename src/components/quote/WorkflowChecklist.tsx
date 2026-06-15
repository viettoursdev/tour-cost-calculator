import { Box, Checkbox, Chip, Stack, Typography } from '@mui/material';
import { deadlineMeta } from '@/components/visa/constants';
import { WORKFLOW_STATUS_META } from './workflowConstants';
import type { User, WorkflowStatus, WorkflowStep } from '@/types';

type Props = {
  steps: WorkflowStep[];
  users: User[];
  onSetStatus: (id: string, status: WorkflowStatus) => void;
};

export function WorkflowChecklist({ steps, users, onSetStatus }: Props) {
  const nameOf = (u?: string) => users.find((x) => x.u === u)?.name ?? u ?? '';
  return (
    <Stack spacing={0.5}>
      {steps.map((s, i) => {
        const done = s.status === 'done';
        const meta = WORKFLOW_STATUS_META[s.status];
        const dl = s.dueDate ? deadlineMeta(s.dueDate, done) : null;
        return (
          <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <Checkbox size="small" checked={done} onChange={(e) => onSetStatus(s.id, e.target.checked ? 'done' : 'todo')} color="success" />
            <Typography variant="caption" color="text.disabled" sx={{ width: 22 }}>{i + 1}</Typography>
            <Typography sx={{ flex: 1, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? 'text.disabled' : 'text.primary' }}>
              {s.label}
            </Typography>
            {s.assignee && <Chip size="small" variant="outlined" label={`👤 ${nameOf(s.assignee)}`} />}
            {dl && <Typography variant="caption" sx={{ color: dl.color, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>⏱ {dl.text}</Typography>}
            <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700, minWidth: 84 }} />
          </Box>
        );
      })}
    </Stack>
  );
}
