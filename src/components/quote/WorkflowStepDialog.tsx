import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  ListSubheader, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { WORKFLOW_STATUS_META, WORKFLOW_STATUS_ORDER, roleOfStep, cycleTimeMs, isGate, approvalOf, APPROVE_ACTION } from './workflowConstants';
import { ROLE_RANK, canViewStaffRole, isApprover } from '@/auth/ROLES';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { useAuthStore } from '@/stores/authStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { pickFiles } from '@/lib/pickFiles';
import { openFilePreview } from '@/stores/filePreviewStore';
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

  const onPickFiles = async () => {
    const files = await pickFiles({ multiple: true });
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
  const blockedNoReason = s.status === 'blocked' && !(s.note ?? '').trim();
  // Cổng phê duyệt: bước cọc/HĐ/nghiệm thu cần người có quyền duyệt trước khi Hoàn tất.
  const gate = isGate(s);
  const approval = approvalOf(s);
  const iAmApprover = !!me && isApprover(me.role);
  const gateBlocksDone = gate && !approval; // chưa duyệt → chưa được Hoàn tất
  const doApprove = () => setS((p) => ({
    ...p, status: 'done', doneDate: p.doneDate ?? new Date().toISOString().slice(0, 10),
    log: [...(p.log ?? []), { at: new Date().toISOString(), by: me?.name ?? '', action: APPROVE_ACTION }],
  }));
  const cycleMs = cycleTimeMs(s);
  const cycleText = cycleMs == null ? null : (() => {
    const h = Math.round(cycleMs / 3600000);
    return h < 24 ? `${h} giờ` : `${Math.round((h / 24) * 10) / 10} ngày`;
  })();

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
                <MenuItem key={k} value={k} disabled={k === 'done' && gateBlocksDone} sx={{ color: WORKFLOW_STATUS_META[k].color, fontWeight: 700 }}>
                  {WORKFLOW_STATUS_META[k].label}{k === 'done' && gateBlocksDone ? ' 🔒' : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Người phụ trách" value={s.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || undefined })}
              helperText={deptRole ? `Phòng phụ trách gợi ý: ${deptRole}` : ' '}>
              <MenuItem value="">—</MenuItem>
              {matched.length > 0 && <ListSubheader sx={{ lineHeight: 2.2 }}>🏢 {deptRole}</ListSubheader>}
              {matched.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
              {matched.length > 0 && others.length > 0 && <ListSubheader sx={{ lineHeight: 2.2 }}>Khác</ListSubheader>}
              {others.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}{canViewStaffRole(me) && <Typography component="span" variant="caption" sx={{ ml: 0.5, color: "text.disabled" }}>· {u.role}</Typography>}</MenuItem>)}
            </TextField>
            <TextField type="date" label="Ngày bắt đầu" value={s.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} />
            <TextField type="date" label="Hạn hoàn thành" value={s.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} />
            <TextField type="number" label="Hạn = N ngày trước khởi hành" value={s.dueOffset ?? ''}
              onChange={(e) => set({ dueOffset: e.target.value === '' ? undefined : +e.target.value })}
              helperText="Dùng cho nút Tự tính hạn (âm = sau khởi hành)" slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} />
          </Box>
          {suggested && !s.assignee && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">Gợi ý phụ trách:</Typography>
              <Chip size="small" color="primary" variant="outlined" label={`Gán ${suggested.name} (${suggested.role})`} onClick={() => set({ assignee: suggested.u })} />
            </Stack>
          )}
          {gate && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: approval ? 'success.light' : '#f5a623', bgcolor: approval ? 'rgba(39,174,96,0.06)' : 'rgba(245,166,35,0.08)' }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <VerifiedUserOutlinedIcon fontSize="small" sx={{ color: approval ? '#27ae60' : '#f5a623' }} />
                <Typography fontSize={13} fontWeight={800} sx={{ flex: 1, minWidth: 120 }}>Cổng phê duyệt</Typography>
                {approval ? (
                  <Chip size="small" color="success" label={`Đã duyệt · ${approval.by} · ${new Date(approval.at).toLocaleDateString('vi-VN')}`} />
                ) : iAmApprover ? (
                  <Button size="small" variant="contained" color="success" startIcon={<VerifiedUserOutlinedIcon />} onClick={doApprove}>Phê duyệt &amp; hoàn tất</Button>
                ) : (
                  <Chip size="small" variant="outlined" sx={{ color: '#b45309', borderColor: '#f5a623' }} label="Chờ duyệt (CEO/BGĐ/Trưởng Phòng)" />
                )}
              </Stack>
              {!approval && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Bước cọc/hợp đồng/nghiệm thu cần người có quyền phê duyệt trước khi đánh dấu Hoàn tất.
                </Typography>
              )}
            </Box>
          )}
          <TextField label={s.status === 'blocked' ? 'Ghi chú · LÝ DO TẠM HOÃN (bắt buộc)' : 'Ghi chú'}
            value={s.note ?? ''} onChange={(e) => set({ note: e.target.value })} fullWidth multiline minRows={2}
            error={blockedNoReason} helperText={blockedNoReason ? 'Cần nhập lý do khi để trạng thái Tạm hoãn.' : ' '} />

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>📎 File đính kèm</Typography>
            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
              {(s.attachments ?? []).map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}>
                  <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Box component="button" type="button" onClick={() => openFilePreview({ key: att.key, name: att.name })}
                    sx={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0, fontFamily: 'inherit', fontSize: 13, color: '#0d7a6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}{att.uploadedBy ? <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.disabled' }}>· {att.uploadedBy}</Typography> : null}
                  </Box>
                  <IconButton size="small" color="error" onClick={() => removeAtt(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
            </Stack>
            <Button size="small" startIcon={<AttachFileIcon />} disabled={uploading} onClick={() => void onPickFiles()} sx={{ mt: 0.5, color: '#0d7a6a' }}>
              {uploading ? 'Đang tải lên…' : 'Đính kèm file (PDF/Word/ảnh…)'}
            </Button>
          </Box>

          {cycleText && (
            <Chip size="small" color="success" variant="outlined" sx={{ alignSelf: 'flex-start' }}
              label={`⏳ Thời gian xử lý: ${cycleText}`} />
          )}

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
        <Button variant="contained" disabled={uploading || blockedNoReason || (gate && s.status === 'done' && !approval)} onClick={() => onSave(s)} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
