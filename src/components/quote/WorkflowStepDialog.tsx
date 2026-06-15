import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from '@mui/material';
import { WORKFLOW_STATUS_META, WORKFLOW_STATUS_ORDER } from './workflowConstants';
import type { User, WorkflowStatus, WorkflowStep } from '@/types';

type Props = {
  step: WorkflowStep;
  users: User[];
  onClose: () => void;
  onSave: (patch: Partial<WorkflowStep>) => void;
};

export function WorkflowStepDialog({ step, users, onClose, onSave }: Props) {
  const [s, setS] = useState<WorkflowStep>({ ...step });
  const set = (patch: Partial<WorkflowStep>) => setS((p) => ({ ...p, ...patch }));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Chi tiết bước quy trình</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField label="Tên bước" value={s.label} onChange={(e) => set({ label: e.target.value })} fullWidth />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField select label="Trạng thái" value={s.status} onChange={(e) => set({ status: e.target.value as WorkflowStatus })}>
              {WORKFLOW_STATUS_ORDER.map((k) => (
                <MenuItem key={k} value={k} sx={{ color: WORKFLOW_STATUS_META[k].color, fontWeight: 700 }}>{WORKFLOW_STATUS_META[k].label}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Người phụ trách" value={s.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || undefined })}>
              <MenuItem value="">—</MenuItem>
              {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
            </TextField>
            <TextField type="date" label="Ngày bắt đầu" value={s.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label="Hạn hoàn thành" value={s.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          <TextField label="Ghi chú" value={s.note ?? ''} onChange={(e) => set({ note: e.target.value })} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button variant="contained" onClick={() => onSave(s)} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
