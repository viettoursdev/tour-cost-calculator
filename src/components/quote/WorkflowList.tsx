import { Box, Chip, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { SortableList } from '@/components/itinerary/SortableList';
import { WORKFLOW_STATUS_META, WORKFLOW_STATUS_ORDER } from './workflowConstants';
import type { User, WorkflowStatus, WorkflowStep } from '@/types';

type Props = {
  steps: WorkflowStep[];
  users: User[];
  suggestions?: Record<string, WorkflowStatus>;
  onUpdate: (id: string, patch: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
};

const COLS = '28px 28px 1.6fr 1fr 1fr 1.1fr 1.1fr 1.4fr 32px';
const inputSx = { '& .MuiInputBase-input': { fontSize: 13, py: 0.5 } } as const;

export function WorkflowList({ steps, users, suggestions = {}, onUpdate, onDelete, onReorder }: Props) {
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: COLS, gap: 1, px: 0.5, mb: 0.5 }}>
        {['', '#', 'Bước', 'Trạng thái', 'Phụ trách', 'Bắt đầu', 'Hạn', 'Ghi chú', ''].map((h, i) => (
          <Typography key={i} variant="caption" fontWeight={700} color="text.secondary">{h}</Typography>
        ))}
      </Box>
      <SortableList onReorder={onReorder} handle=".wf-drag" deps={[steps.length]}>
        {steps.map((s, i) => (
          <Box key={s.id} sx={{ display: 'grid', gridTemplateColumns: COLS, gap: 1, alignItems: 'center', py: 0.25 }}>
            <Box className="wf-drag" sx={{ cursor: 'grab', color: 'text.disabled', display: 'flex' }}><DragIndicatorIcon fontSize="small" /></Box>
            <Typography variant="caption" color="text.disabled">{i + 1}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <TextField variant="standard" fullWidth value={s.label} onChange={(e) => onUpdate(s.id, { label: e.target.value })} sx={inputSx} />
              {suggestions[s.id] && (
                <Tooltip title={`Đề xuất theo dữ liệu thật — bấm để áp`}>
                  <Chip size="small" label={`↗ ${WORKFLOW_STATUS_META[suggestions[s.id]].label}`} onClick={() => onUpdate(s.id, { status: suggestions[s.id] })}
                    sx={{ height: 18, fontWeight: 700, bgcolor: WORKFLOW_STATUS_META[suggestions[s.id]].color, color: '#fff', cursor: 'pointer' }} />
                </Tooltip>
              )}
            </Box>
            <TextField select variant="standard" value={s.status} onChange={(e) => onUpdate(s.id, { status: e.target.value as WorkflowStatus })}
              sx={{ ...inputSx, '& .MuiInputBase-input': { fontSize: 13, py: 0.5, color: WORKFLOW_STATUS_META[s.status].color, fontWeight: 700 } }}>
              {WORKFLOW_STATUS_ORDER.map((k) => <MenuItem key={k} value={k} sx={{ color: WORKFLOW_STATUS_META[k].color }}>{WORKFLOW_STATUS_META[k].label}</MenuItem>)}
            </TextField>
            <TextField select variant="standard" value={s.assignee ?? ''} onChange={(e) => onUpdate(s.id, { assignee: e.target.value || undefined })} sx={inputSx}>
              <MenuItem value="">—</MenuItem>
              {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
            </TextField>
            <TextField variant="standard" type="date" value={s.startDate ?? ''} onChange={(e) => onUpdate(s.id, { startDate: e.target.value || null })} sx={inputSx} />
            <TextField variant="standard" type="date" value={s.dueDate ?? ''} onChange={(e) => onUpdate(s.id, { dueDate: e.target.value || null })} sx={inputSx} />
            <TextField variant="standard" value={s.note ?? ''} placeholder="ghi chú" onChange={(e) => onUpdate(s.id, { note: e.target.value })} sx={inputSx} />
            <Tooltip title="Xoá bước"><IconButton size="small" color="error" onClick={() => onDelete(s.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
        ))}
      </SortableList>
    </Box>
  );
}
