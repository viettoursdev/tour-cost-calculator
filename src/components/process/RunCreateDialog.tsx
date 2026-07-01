import { useMemo, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useProcessStore } from '@/stores/processStore';
import { toast } from '@/stores/toastStore';
import { createRunFromTemplate } from './processRun';
import { fillDueDates } from '@/components/quote/workflowConstants';
import type { ProcessRef, ProcessRefKind, ProcessTemplate } from '@/types';

type Props = { template: ProcessTemplate; onClose: () => void };

const REF_LABEL: Record<'none' | ProcessRefKind, string> = {
  none: 'Không gắn', quote: 'Báo giá', customer: 'Khách hàng', visa: 'Hồ sơ visa',
};

/** Tạo phiên chạy quy trình từ 1 template — có thể gắn báo giá / khách / hồ sơ visa. */
export function RunCreateDialog({ template, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const customers = useCustomerStore((s) => s.customers);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const saveRun = useProcessStore((s) => s.saveRun);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);

  const [title, setTitle] = useState(template.name);
  const [refKind, setRefKind] = useState<'none' | ProcessRefKind>('none');
  const [refId, setRefId] = useState('');
  const [assignee, setAssignee] = useState(me?.u ?? '');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [anchor, setAnchor] = useState('');
  // Số bước sẽ được tự tính Hạn nếu nhập ngày mốc (có quy tắc T-7, T+3…).
  const datedSteps = template.steps.filter((s) => s.dueOffset != null).length;

  // Danh sách đối tượng để gắn theo loại đã chọn.
  const refOptions = useMemo<{ id: string; label: string }[]>(() => {
    if (refKind === 'quote') return quotes.map((q) => ({ id: q.cloudId, label: q.name }));
    if (refKind === 'customer') return customers.map((c) => ({ id: c.id, label: c.name }));
    if (refKind === 'visa') return visaProjects.map((p) => ({ id: p.id, label: p.name }));
    return [];
  }, [refKind, quotes, customers, visaProjects]);

  const create = async () => {
    if (!me) return;
    let ref: ProcessRef | undefined;
    if (refKind !== 'none' && refId) {
      const found = refOptions.find((o) => o.id === refId);
      ref = { kind: refKind, id: refId, label: found?.label ?? '' };
    }
    const run = createRunFromTemplate(template, { title, ref, assignee, startDate, dueDate }, me);
    // Nhập ngày mốc T0 → vật chất hoá Hạn từng bước (khởi hành − dueOffset) để hệ
    // thống nhắc bước sắp/đã đến hạn (checkProcessDeadlines đọc dueDate thật).
    if (anchor) run.steps = fillDueDates(run.steps, anchor);
    await saveRun(run, me.name);
    toast(`Đã tạo phiên chạy "${run.title}"`, 'success');
    setOpenRun(run.id);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bắt đầu quy trình</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Tạo 1 phiên chạy từ mẫu <b>{template.icon} {template.name}</b> ({template.steps.length} bước) để theo dõi tiến độ cho một việc cụ thể.
          </Typography>
          <TextField label="Tên phiên chạy" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth autoFocus
            placeholder="VD: Visa Schengen — KH Nguyễn Văn A" />

          <Stack direction="row" spacing={1}>
            <TextField select label="Gắn với" value={refKind} sx={{ minWidth: 150 }}
              onChange={(e) => { setRefKind(e.target.value as 'none' | ProcessRefKind); setRefId(''); }}>
              {(['none', 'quote', 'customer', 'visa'] as const).map((k) => (
                <MenuItem key={k} value={k}>{REF_LABEL[k]}</MenuItem>
              ))}
            </TextField>
            {refKind !== 'none' && (
              <TextField select label={REF_LABEL[refKind]} value={refId} onChange={(e) => setRefId(e.target.value)} fullWidth>
                <MenuItem value=""><em>— Chọn —</em></MenuItem>
                {refOptions.map((o) => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
              </TextField>
            )}
          </Stack>

          <TextField select label="Người phụ trách" value={assignee} onChange={(e) => setAssignee(e.target.value)} fullWidth>
            {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
          </TextField>

          <Stack direction="row" spacing={1}>
            <TextField type="date" label="Ngày bắt đầu" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              fullWidth slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} />
            <TextField type="date" label="Hạn hoàn thành" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              fullWidth slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} />
          </Stack>

          {datedSteps > 0 && (
            <TextField type="date" label="Ngày mốc T0 (khởi hành / nộp hồ sơ / kết tour)" value={anchor}
              onChange={(e) => setAnchor(e.target.value)} fullWidth
              slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }}
              helperText={`Tự tính Hạn cho ${datedSteps}/${template.steps.length} bước theo quy tắc T-7, T+3… (bước không có quy tắc số sẽ để trống, chỉnh tay sau).`} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => void create()} disabled={!title.trim()}>Tạo phiên chạy</Button>
      </DialogActions>
    </Dialog>
  );
}
