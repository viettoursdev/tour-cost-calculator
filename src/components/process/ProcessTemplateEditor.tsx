import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { SortableList } from '@/components/itinerary/SortableList';
import { useAuthStore } from '@/stores/authStore';
import { useProcessStore, newProcessId } from '@/stores/processStore';
import { toast } from '@/stores/toastStore';
import { suggestProcessSteps } from '@/lib/processStepSuggest';
import { parseDueRuleOffset } from '@/components/quote/workflowConstants';
import { DEPARTMENTS } from '@/auth/departments';
import { DEPT_COLOR, DEPT_ICON } from './processSeed';
import type { Department, ProcessTemplate, WorkflowStep } from '@/types';

const TARGET_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];
const COLOR_SWATCHES = ['#0d7a6a', '#2563eb', '#f5a623', '#7c3aed', '#dc3250', '#0891b2', '#db2777'];

const blankStep = (): WorkflowStep => ({
  id: newProcessId('ps'), label: '', status: 'todo',
});

type Props = {
  /** Có = sửa template đã có; trống = tạo mới cho `department`. */
  initial?: ProcessTemplate;
  department: Department;
  onClose: () => void;
};

/** Trình tạo/sửa quy trình: kéo-thả bước + đủ field SOP. Lưu sẽ tăng `version`. */
export function ProcessTemplateEditor({ initial, department, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const saveTemplate = useProcessStore((s) => s.saveTemplate);
  const isEdit = !!initial;

  const [dept, setDept] = useState<Department>(initial?.department ?? department);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? DEPT_ICON[initial?.department ?? department]);
  const [color, setColor] = useState(initial?.color ?? DEPT_COLOR[initial?.department ?? department]);
  const [steps, setSteps] = useState<WorkflowStep[]>(initial ? initial.steps.map((s) => ({ ...s })) : [blankStep()]);
  const [aiLoading, setAiLoading] = useState(false);

  const aiSuggest = async () => {
    if (!name.trim()) { toast('Nhập tên quy trình trước để AI gợi ý bước', 'warning'); return; }
    setAiLoading(true);
    try {
      const suggested = await suggestProcessSteps(name, dept);
      if (!suggested.length) { toast('AI chưa gợi ý được bước nào, thử lại nhé', 'info'); return; }
      const newSteps: WorkflowStep[] = suggested.map((s) => ({
        id: newProcessId('ps'), label: s.label, status: 'todo',
        ownerDept: dept, output: s.output, risk: s.risk, dueRule: s.dueRule,
      }));
      // Giữ các bước đã nhập (có tên), thêm gợi ý vào sau; bỏ ô trống placeholder.
      setSteps((prev) => [...prev.filter((s) => s.label.trim()), ...newSteps]);
      toast(`AI đã gợi ý ${newSteps.length} bước`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const patchStep = (id: string, patch: Partial<WorkflowStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((prev) => [...prev, blankStep()]);
  const delStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));
  const reorder = (from: number, to: number) => setSteps((prev) => {
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });

  const cleanSteps = steps.filter((s) => s.label.trim());
  const canSave = !!name.trim() && cleanSteps.length > 0;

  const save = async () => {
    if (!me || !canSave) return;
    const now = new Date().toISOString();
    const tpl: ProcessTemplate = {
      id: initial?.id ?? newProcessId('pt'),
      department: dept,
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon || DEPT_ICON[dept],
      color: color || DEPT_COLOR[dept],
      // Bước rỗng (chưa nhập tên) bị loại; gán phòng phụ trách mặc định nếu trống;
      // suy dueOffset từ quy tắc hạn ("T-7"…) để tự tính Hạn được khi chạy phiên.
      steps: cleanSteps.map((s) => ({ ...s, ownerDept: s.ownerDept ?? dept, dueOffset: s.dueOffset ?? parseDueRuleOffset(s.dueRule) })),
      version: (initial?.version ?? 0) + 1,
      isPublished: true,
      isSeed: false,
      createdByUsername: initial?.createdByUsername ?? me.u,
      createdByName: initial?.createdByName ?? me.name,
      createdAt: initial?.createdAt ?? now,
    };
    await saveTemplate(tpl, me.name);
    toast(isEdit ? `Đã lưu "${tpl.name}" (v${tpl.version})` : `Đã tạo quy trình "${tpl.name}"`, 'success');
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? `Sửa quy trình (v${initial!.version} → v${initial!.version + 1})` : 'Tạo quy trình mới'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="Tên quy trình" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus
              placeholder="VD: Quyết toán file tour" />
            <TextField select label="Phòng ban" value={dept} onChange={(e) => setDept(e.target.value as Department)} sx={{ minWidth: 190 }}>
              {DEPARTMENTS.filter((d) => TARGET_DEPTS.includes(d.id)).map((d) => (
                <MenuItem key={d.id} value={d.id}>{DEPT_ICON[d.id]} {d.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField label="Mô tả ngắn" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} sx={{ width: 90 }} inputProps={{ maxLength: 4 }} />
            <Box>
              <Typography variant="caption" color="text.secondary">Màu nhấn</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                {COLOR_SWATCHES.map((c) => (
                  <Box key={c} onClick={() => setColor(c)} sx={{
                    width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                    border: color === c ? '3px solid rgba(0,0,0,0.45)' : '2px solid rgba(0,0,0,0.1)',
                  }} />
                ))}
              </Stack>
            </Box>
          </Stack>

          <Box>
            <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>Các bước ({cleanSteps.length})</Typography>
              <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={() => void aiSuggest()} disabled={aiLoading}>
                {aiLoading ? 'Đang gợi ý…' : 'AI gợi ý bước'}
              </Button>
              <Button size="small" startIcon={<AddIcon />} onClick={addStep}>Thêm bước</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Kéo biểu tượng ⋮⋮ để đổi thứ tự. Bước chưa nhập tên sẽ bị bỏ khi lưu.
            </Typography>
            <SortableList onReorder={reorder} handle=".step-drag" deps={[steps.length]} sx={{ display: 'grid', gap: 1 }}>
              {steps.map((s, i) => (
                <Paper key={s.id} variant="outlined" sx={{ p: 1.25 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Tooltip title="Kéo để đổi thứ tự"><Box className="step-drag" sx={{ cursor: 'grab', color: 'text.disabled', display: 'flex' }}><DragIndicatorIcon fontSize="small" /></Box></Tooltip>
                    <Typography fontSize={12} fontWeight={800} color="text.secondary">{i + 1}</Typography>
                    <TextField size="small" placeholder="Hành động (tên bước)" value={s.label}
                      onChange={(e) => patchStep(s.id, { label: e.target.value })} fullWidth />
                    <TextField select size="small" label="Phòng" value={s.ownerDept ?? dept}
                      onChange={(e) => patchStep(s.id, { ownerDept: e.target.value as Department })} sx={{ minWidth: 150 }}>
                      {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{DEPT_ICON[d.id]} {d.label}</MenuItem>)}
                    </TextField>
                    <IconButton size="small" color="error" onClick={() => delStep(s.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField size="small" label="Đầu ra / bằng chứng" value={s.output ?? ''} onChange={(e) => patchStep(s.id, { output: e.target.value || undefined })} fullWidth />
                    <TextField size="small" label="Hạn (VD: T-7, trong 24h)" value={s.dueRule ?? ''} onChange={(e) => patchStep(s.id, { dueRule: e.target.value || undefined })} sx={{ minWidth: 180 }} />
                  </Stack>
                  <TextField size="small" label="Rủi ro cần tránh" value={s.risk ?? ''} onChange={(e) => patchStep(s.id, { risk: e.target.value || undefined })} fullWidth sx={{ mt: 1 }} />
                </Paper>
              ))}
            </SortableList>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!canSave}
          sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}>
          {isEdit ? 'Lưu thay đổi' : 'Tạo quy trình'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
