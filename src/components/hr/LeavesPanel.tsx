import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Divider, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useHrLeaveStore } from '@/stores/hrLeaveStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { isApprover } from '@/auth/ROLES';
import { fmtDate } from '@/lib/dateUtils';
import {
  LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, type HrEmployee, type HrLeave, type LeaveStatus,
} from '@/types';
import { LeaveModal } from './LeaveModal';

const STATUS_COLOR: Record<LeaveStatus, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning', approved: 'success', rejected: 'error', cancelled: 'default',
};
const today = () => new Date().toISOString().slice(0, 10);
const overlaps = (l: HrLeave, day: string) => !!l.startDate && (l.startDate <= day) && ((l.endDate || l.startDate) >= day);

export function LeavesPanel({ employees }: { employees: HrEmployee[] }) {
  const leaves = useHrLeaveStore((s) => s.leaves);
  const save = useHrLeaveStore((s) => s.save);
  const del = useHrLeaveStore((s) => s.delete);
  const decide = useHrLeaveStore((s) => s.decide);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canManage = hasPerm(currentUser, 'manageHR');
  const canApprove = !!currentUser && isApprover(currentUser.role);

  const [status, setStatus] = useState<'' | LeaveStatus>('');
  const [empFilter, setEmpFilter] = useState('');
  const [day, setDay] = useState(today());
  const [modal, setModal] = useState<{ leave: HrLeave | null } | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, e.fullName]));
    return (id: string) => m.get(id) ?? '(đã xoá)';
  }, [employees]);

  const filtered = useMemo(() => leaves.filter((l) => {
    if (status && l.status !== status) return false;
    if (empFilter && l.employeeId !== empFilter) return false;
    return true;
  }), [leaves, status, empFilter]);

  // Tổng phép năm đã duyệt theo nhân viên (năm hiện tại).
  const yearUsed = useMemo(() => {
    const y = new Date().getFullYear().toString();
    const m = new Map<string, number>();
    leaves.filter((l) => l.status === 'approved' && l.type === 'annual' && (l.startDate ?? '').startsWith(y))
      .forEach((l) => m.set(l.employeeId, (m.get(l.employeeId) ?? 0) + l.days));
    return m;
  }, [leaves]);

  // Ai nghỉ trong ngày được chọn (đơn đã duyệt / chờ duyệt).
  const offToday = useMemo(
    () => leaves.filter((l) => (l.status === 'approved' || l.status === 'pending') && overlaps(l, day)),
    [leaves, day],
  );

  const handleSave = (l: HrLeave) => { void save(l); setModal(null); };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
        <TextField size="small" select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value as '' | LeaveStatus)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Tất cả</MenuItem>
          {(['pending', 'approved', 'rejected', 'cancelled'] as LeaveStatus[]).map((s) => <MenuItem key={s} value={s}>{LEAVE_STATUS_LABEL[s]}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Nhân viên" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Tất cả</MenuItem>
          {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.fullName}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setModal({ leave: null })}>Đăng ký nghỉ</Button>}
      </Stack>

      {/* Lịch khả dụng theo ngày */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" mb={1} flexWrap="wrap">
          <Typography fontWeight={700} fontSize={14}>📅 Ai nghỉ ngày</Typography>
          <TextField size="small" type="date" value={day} onChange={(e) => setDay(e.target.value || today())} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <Chip size="small" label={`${offToday.length} người`} color={offToday.length ? 'warning' : 'default'} />
        </Stack>
        {offToday.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Không ai nghỉ ngày này.</Typography>
        ) : (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {offToday.map((l) => (
              <Chip key={l.id} size="small" variant={l.status === 'approved' ? 'filled' : 'outlined'} color={l.status === 'approved' ? 'warning' : 'default'}
                label={`${nameOf(l.employeeId)} · ${LEAVE_TYPE_LABEL[l.type]}${l.status === 'pending' ? ' (chờ)' : ''}`} />
            ))}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Lịch đi tour của HDV xem ở mục “Lịch đi tour HDV”. Kết hợp 2 nguồn để biết ai rảnh nhận tour.
        </Typography>
      </Paper>

      <Divider sx={{ mb: 1.5 }} />

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{leaves.length ? 'Không có đơn khớp bộ lọc.' : 'Chưa có đơn nghỉ phép nào.'}</Typography>
      ) : (
        <Stack spacing={0.75}>
          {filtered.map((l) => {
            const used = yearUsed.get(l.employeeId);
            return (
              <Stack key={l.id} direction="row" alignItems="center" spacing={1.5}
                sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={700} noWrap>{nameOf(l.employeeId)}</Typography>
                    <Chip size="small" variant="outlined" label={LEAVE_TYPE_LABEL[l.type]} />
                    <Typography variant="body2" color="text.secondary">{l.days} ngày</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {l.startDate ? fmtDate(l.startDate) : '—'}{l.endDate && l.endDate !== l.startDate ? ` → ${fmtDate(l.endDate)}` : ''}
                    {l.reason ? ` · ${l.reason}` : ''}
                    {l.type === 'annual' && used ? ` · phép năm đã dùng: ${used}` : ''}
                  </Typography>
                </Box>
                {canApprove && l.status === 'pending' && (
                  <>
                    <Tooltip title="Duyệt"><IconButton size="small" color="success" onClick={() => void decide(l.id, 'approved')}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Từ chối"><IconButton size="small" color="error" onClick={() => { const n = window.prompt('Lý do từ chối (tuỳ chọn):') ?? ''; void decide(l.id, 'rejected', n); }}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                )}
                <Chip size="small" color={STATUS_COLOR[l.status]} label={LEAVE_STATUS_LABEL[l.status]} />
                {canManage && <IconButton size="small" onClick={() => setModal({ leave: l })}><EditIcon fontSize="small" /></IconButton>}
                {canManage && <IconButton size="small" color="error" onClick={() => { if (window.confirm('Xoá đơn nghỉ này?')) void del(l.id); }}><DeleteOutlineIcon fontSize="small" /></IconButton>}
              </Stack>
            );
          })}
        </Stack>
      )}

      {modal && (
        <LeaveModal leave={modal.leave} employees={employees} canEdit={canManage} onClose={() => setModal(null)} onSave={handleSave} />
      )}
    </Box>
  );
}
