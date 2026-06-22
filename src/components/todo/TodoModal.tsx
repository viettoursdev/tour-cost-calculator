import { useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import { useAuthStore } from '@/stores/authStore';
import { userLabel } from '@/auth/ROLES';
import { useTodoStore } from '@/stores/todoStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import type { CloudQuoteEntry, NotifLink, Todo, TodoChecklistItem, TodoRecurring, TodoStatus, User } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);
const cid = () => 'c' + Math.random().toString(36).slice(2, 8);

const LEAD_OPTS = [{ m: 1440, label: '1 ngày' }, { m: 180, label: '3 giờ' }, { m: 60, label: '1 giờ' }, { m: 15, label: '15 phút' }];
const RECUR_OPTS: { v: TodoRecurring; label: string }[] = [
  { v: 'none', label: 'Không lặp' }, { v: 'daily', label: 'Hàng ngày' }, { v: 'weekly', label: 'Hàng tuần' }, { v: 'monthly', label: 'Hàng tháng' },
];
const STATUS_OPTS: { v: TodoStatus; label: string }[] = [
  { v: 'todo', label: 'Chưa làm' }, { v: 'doing', label: 'Đang làm' }, { v: 'done', label: 'Xong' },
];

export function TodoModal({ todo, prefill, onClose }: { todo: Todo | null; prefill?: Partial<Todo>; onClose: () => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const add = useTodoStore((s) => s.add);
  const update = useTodoStore((s) => s.update);

  // Giá trị khởi tạo: SỬA việc (todo) hoặc TẠO MỚI với giá trị điền sẵn (prefill).
  const seed = todo ?? prefill;

  const [title, setTitle] = useState(seed?.title ?? '');
  const [note, setNote] = useState(seed?.note ?? '');
  const [status, setStatus] = useState<TodoStatus>(seed?.status ?? 'todo');
  const [priority, setPriority] = useState<Todo['priority']>(seed?.priority ?? 'normal');
  const [assignees, setAssignees] = useState<User[]>(() => users.filter((u) => (seed?.assignees ?? []).includes(u.u)));
  const [due, setDue] = useState(toLocal(seed?.dueDate));
  const [lead, setLead] = useState<number[]>(seed?.remindLead ?? [60]);
  const [remindAt, setRemindAt] = useState<string[]>(seed?.remindAt ?? []);
  const [recurring, setRecurring] = useState<TodoRecurring>(seed?.recurring ?? 'none');
  const [checklist, setChecklist] = useState<TodoChecklistItem[]>(seed?.checklist ?? []);
  const [linkQuote, setLinkQuote] = useState<CloudQuoteEntry | null>(
    () => (seed?.link?.kind === 'quote' || seed?.link?.kind === 'payment' ? quotes.find((q) => q.cloudId === seed.link!.id) ?? null : null),
  );
  const [linkKind, setLinkKind] = useState<'quote' | 'payment'>(seed?.link?.kind === 'payment' ? 'payment' : 'quote');
  // Link KHÁC (hợp đồng/chương trình/thực đơn…) — modal không sửa được, chỉ giữ & hiển thị chỉ-đọc.
  const [otherLink, setOtherLink] = useState<NotifLink | undefined>(
    () => (seed?.link && seed.link.kind !== 'quote' && seed.link.kind !== 'payment' ? seed.link : undefined),
  );
  const [busy, setBusy] = useState(false);

  const toggleLead = (m: number) => setLead((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const addRemindAt = () => setRemindAt((p) => [...p, '']);
  const setRemindAtI = (i: number, v: string) => setRemindAt((p) => p.map((x, j) => (j === i ? v : x)));
  const delRemindAt = (i: number) => setRemindAt((p) => p.filter((_, j) => j !== i));
  const addCheck = () => setChecklist((p) => [...p, { id: cid(), text: '', done: false }]);
  const setCheck = (id: string, patch: Partial<TodoChecklistItem>) => setChecklist((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const delCheck = (id: string) => setChecklist((p) => p.filter((c) => c.id !== id));

  const save = async () => {
    if (!title.trim()) { window.alert('Nhập tiêu đề việc.'); return; }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(), note: note.trim() || undefined, status, priority,
        assignees: assignees.map((u) => u.u),
        dueDate: fromLocal(due),
        remindLead: lead.length ? lead : undefined,
        remindAt: remindAt.map(fromLocal).filter(Boolean) as string[],
        recurring,
        checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim() })),
        link: linkQuote ? { kind: linkKind, id: linkQuote.cloudId, label: linkQuote.name } : otherLink,
      };
      if (todo) await update(todo.id, payload);
      else await add(payload);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{todo ? 'Sửa công việc' : 'Việc mới'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {(todo?.responses ?? []).length > 0 && (
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.03)' }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary">PHẢN HỒI NGƯỜI ĐƯỢC GIAO</Typography>
              <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                {(todo?.responses ?? []).map((r) => (
                  <Typography key={r.u} variant="caption" sx={{ color: r.accepted ? '#27ae60' : '#dc3250' }}>
                    {r.accepted ? '✅' : '❌'} {r.name}{r.comment ? `: “${r.comment}”` : ''} · {new Date(r.at).toLocaleString('vi-VN')}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          <TextField label="Tiêu đề việc" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <TextField label="Mô tả (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={2} />

          <Stack direction="row" spacing={1.5}>
            <TextField select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)} sx={{ flex: 1 }}>
              {STATUS_OPTS.map((o) => <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>)}
            </TextField>
            <TextField select label="Ưu tiên" value={priority} onChange={(e) => setPriority(e.target.value as Todo['priority'])} sx={{ flex: 1 }}>
              <MenuItem value="normal">Bình thường</MenuItem>
              <MenuItem value="high">Quan trọng</MenuItem>
              <MenuItem value="urgent">Khẩn</MenuItem>
            </TextField>
          </Stack>

          <Autocomplete
            multiple options={users.filter((u) => u.u !== me?.u)} value={assignees} onChange={(_, v) => setAssignees(v)}
            getOptionLabel={(u) => userLabel(u, me)} isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) => value.map((u, i) => { const { key, ...p } = getTagProps({ index: i }); return <Chip key={key} {...p} label={u.name} size="small" />; })}
            renderInput={(p) => <TextField {...p} label="Giao cho (đội nhóm)" placeholder="Chọn người… (để trống = việc của tôi)" />}
          />

          <TextField label="Deadline" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} InputLabelProps={{ shrink: true }} />

          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Nhắc trước hạn</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {LEAD_OPTS.map((o) => (
                <Chip key={o.m} label={o.label} size="small" color={lead.includes(o.m) ? 'primary' : 'default'} variant={lead.includes(o.m) ? 'filled' : 'outlined'} onClick={() => toggleLead(o.m)} />
              ))}
            </Stack>
          </Box>

          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Nhắc theo khung giờ</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addRemindAt}>Thêm mốc</Button>
            </Stack>
            <Stack spacing={0.75}>
              {remindAt.map((r, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField size="small" type="datetime-local" value={toLocal(r) || r} onChange={(e) => setRemindAtI(i, e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                  <IconButton size="small" color="error" onClick={() => delRemindAt(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
            </Stack>
          </Box>

          <TextField select label="Lặp lại" value={recurring} onChange={(e) => setRecurring(e.target.value as TodoRecurring)}>
            {RECUR_OPTS.map((o) => <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>)}
          </TextField>

          {/* Liên kết tới báo giá (mở 1 chạm từ việc) */}
          {otherLink && !linkQuote && (
            <Chip
              icon={<LinkIcon />} label={`Liên kết: ${otherLink.label}`} variant="outlined" color="primary"
              onDelete={() => setOtherLink(undefined)} sx={{ alignSelf: 'flex-start', maxWidth: '100%' }}
            />
          )}
          <Stack direction="row" spacing={1.5}>
            <Autocomplete
              sx={{ flex: 1 }} options={quotes} value={linkQuote} onChange={(_, v) => setLinkQuote(v)}
              getOptionLabel={(q) => `${q.quoteCode ? q.quoteCode + ' · ' : ''}${q.name}`}
              isOptionEqualToValue={(a, b) => a.cloudId === b.cloudId}
              renderInput={(p) => <TextField {...p} label="Liên kết báo giá (tuỳ chọn)" placeholder="Chọn báo giá…" />}
            />
            {linkQuote && (
              <TextField select label="Mở tới" value={linkKind} onChange={(e) => setLinkKind(e.target.value as 'quote' | 'payment')} sx={{ width: 150 }}>
                <MenuItem value="quote">Báo giá</MenuItem>
                <MenuItem value="payment">Thanh toán</MenuItem>
              </TextField>
            )}
          </Stack>

          <Divider>Việc con (checklist)</Divider>
          <Stack spacing={0.5}>
            {checklist.map((c) => (
              <Stack key={c.id} direction="row" spacing={0.5} alignItems="center">
                <FormControlLabel sx={{ m: 0 }} control={<Checkbox size="small" checked={c.done} onChange={(e) => setCheck(c.id, { done: e.target.checked })} />} label="" />
                <TextField size="small" value={c.text} onChange={(e) => setCheck(c.id, { text: e.target.value })} placeholder="Việc con…" sx={{ flex: 1 }} />
                <IconButton size="small" color="error" onClick={() => delCheck(c.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addCheck} sx={{ alignSelf: 'flex-start' }}>Thêm việc con</Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!title.trim() || busy} onClick={() => void save()} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', fontWeight: 800 }}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
