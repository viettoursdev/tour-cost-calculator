import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  ListSubheader, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { WORKFLOW_STATUS_META, WORKFLOW_STATUS_ORDER, roleOfStep } from './workflowConstants';
import { ROLE_RANK } from '@/auth/ROLES';
import { useAuthStore } from '@/stores/authStore';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
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
  const me = useAuthStore((st) => st.currentUser);
  const [uploading, setUploading] = useState(false);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const at = new Date().toISOString();
      const uploaded = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: me?.name ?? '', uploadedAt: at }));
      setS((p) => ({ ...p, attachments: [...(p.attachments ?? []), ...uploaded] }));
    } catch (err) {
      window.alert('Tải file lỗi: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const removeAtt = (i: number) => setS((p) => ({ ...p, attachments: (p.attachments ?? []).filter((_, j) => j !== i) }));
  const logDesc = [...(s.log ?? [])].reverse(); // mới nhất lên đầu

  // Phòng phụ trách gợi ý cho bước → đẩy người đúng phòng lên đầu danh sách chọn.
  const deptRole = roleOfStep(step);
  const { matched, others } = useMemo(() => {
    const byName = [...users].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return {
      matched: deptRole ? byName.filter((u) => u.role === deptRole) : [],
      others: deptRole ? byName.filter((u) => u.role !== deptRole) : byName,
    };
  }, [users, deptRole]);
  // Người gợi ý: ưu tiên phòng đúng, người ít quyền nhất (ít sếp hơn) lên đầu.
  const suggested = matched.length
    ? [...matched].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])[0]
    : undefined;

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
            <TextField select label="Người phụ trách" value={s.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || undefined })}
              helperText={deptRole ? `Phòng phụ trách gợi ý: ${deptRole}` : ' '}>
              <MenuItem value="">—</MenuItem>
              {matched.length > 0 && <ListSubheader sx={{ lineHeight: 2.2 }}>🏢 {deptRole}</ListSubheader>}
              {matched.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
              {matched.length > 0 && others.length > 0 && <ListSubheader sx={{ lineHeight: 2.2 }}>Khác</ListSubheader>}
              {others.map((u) => <MenuItem key={u.u} value={u.u}>{u.name} <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.disabled' }}>· {u.role}</Typography></MenuItem>)}
            </TextField>
            <TextField type="date" label="Ngày bắt đầu" value={s.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label="Hạn hoàn thành" value={s.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="number" label="Hạn = N ngày trước khởi hành" value={s.dueOffset ?? ''}
              onChange={(e) => set({ dueOffset: e.target.value === '' ? undefined : +e.target.value })}
              helperText="Dùng cho nút Tự tính hạn (âm = sau khởi hành)" slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          {suggested && !s.assignee && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">Gợi ý phụ trách:</Typography>
              <Chip size="small" color="primary" variant="outlined" label={`Gán ${suggested.name} (${suggested.role})`} onClick={() => set({ assignee: suggested.u })} />
            </Stack>
          )}
          <TextField label="Ghi chú" value={s.note ?? ''} onChange={(e) => set({ note: e.target.value })} fullWidth multiline minRows={2} />

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>📎 File đính kèm</Typography>
            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
              {(s.attachments ?? []).map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}>
                  <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Box component="a" href={workerFileUrl(att.key)} target="_blank" rel="noreferrer"
                    sx={{ flex: 1, fontSize: 13, color: '#0d7a6a', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}{att.uploadedBy ? <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.disabled' }}>· {att.uploadedBy}</Typography> : null}
                  </Box>
                  <IconButton size="small" color="error" onClick={() => removeAtt(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
            </Stack>
            <Button component="label" size="small" startIcon={<AttachFileIcon />} disabled={uploading} sx={{ mt: 0.5, color: '#0d7a6a' }}>
              {uploading ? 'Đang tải lên…' : 'Đính kèm file (PDF/Word/ảnh…)'}
              <input type="file" hidden multiple onChange={onPickFiles} />
            </Button>
          </Box>

          {logDesc.length > 0 && (
            <Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <HistoryIcon sx={{ fontSize: 16 }} /> Nhật ký hoạt động
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 0.75, maxHeight: 160, overflowY: 'auto' }}>
                {logDesc.map((l, i) => (
                  <Typography key={i} variant="caption" color="text.secondary">
                    <b>{new Date(l.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b>
                    {' · '}{l.by} — {l.action}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button variant="contained" disabled={uploading} onClick={() => onSave(s)} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
