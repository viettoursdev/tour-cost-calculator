import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, MenuItem, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useHrStore } from '@/stores/hrStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { DEPARTMENTS, DEPT_LABEL } from '@/auth/departments';
import { daysUntil } from '@/lib/dateUtils';
import { normalizeVN } from '@/lib/search';
import { EMPLOYMENT_STATUS_LABEL, type EmploymentStatus, type HrEmployee } from '@/types';
import { EmployeeModal } from './EmployeeModal';
import { OrgChart } from './OrgChart';
import { EvaluationsPanel } from './EvaluationsPanel';

const STATUS_COLOR: Record<EmploymentStatus, 'default' | 'success' | 'warning'> = {
  probation: 'warning', official: 'success', resigned: 'default',
};

/** Số giấy tờ sắp/đã hết hạn (≤90 ngày) của 1 nhân viên. */
function expiringCount(e: HrEmployee): number {
  return e.documents.filter((d) => {
    const n = d.expiresAt ? daysUntil(d.expiresAt) : null;
    return n !== null && n <= 90;
  }).length;
}

export function HRView() {
  const employees = useHrStore((s) => s.employees);
  const loading = useHrStore((s) => s.loading);
  const syncing = useHrStore((s) => s.syncing);
  const save = useHrStore((s) => s.save);
  const del = useHrStore((s) => s.delete);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = hasPerm(currentUser, 'manageHR');

  const [tab, setTab] = useState<'list' | 'org' | 'eval'>('list');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState<'' | EmploymentStatus>('');
  const [modal, setModal] = useState<{ employee: HrEmployee | null } | null>(null);

  const filtered = useMemo(() => {
    const q = normalizeVN(search.trim());
    return employees.filter((e) => {
      if (dept && e.department !== dept) return false;
      if (status && e.status !== status) return false;
      if (q && !normalizeVN(`${e.fullName} ${e.employeeCode} ${e.title} ${e.email} ${e.phone}`).includes(q)) return false;
      return true;
    });
  }, [employees, search, dept, status]);

  const totalExpiring = useMemo(() => employees.reduce((s, e) => s + expiringCount(e), 0), [employees]);

  const handleDelete = (e: HrEmployee) => {
    if (window.confirm(`Xoá hồ sơ nhân sự "${e.fullName}"? Hành động không thể hoàn tác.`)) void del(e.id);
  };
  const handleSave = (e: HrEmployee) => { void save(e); setModal(null); };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={800}>👥 Nhân sự {employees.length ? `(${employees.length})` : ''}</Typography>
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setModal({ employee: null })}>Thêm nhân sự</Button>}
      </Stack>

      {(loading || syncing) && <LinearProgress sx={{ mb: 1 }} />}

      {totalExpiring > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1.5 }}>
          Có <b>{totalExpiring}</b> giấy tờ sắp hoặc đã hết hạn (≤90 ngày). Mở từng hồ sơ để cập nhật.
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab value="list" label="Danh sách" />
        <Tab value="org" label="Sơ đồ tổ chức" />
        <Tab value="eval" label="Đánh giá" />
      </Tabs>

      {tab === 'list' && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={1.5}>
            <TextField size="small" label="Tìm tên / mã / chức danh" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }} />
            <TextField size="small" select label="Phòng ban" value={dept} onChange={(e) => setDept(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">Tất cả phòng</MenuItem>
              {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>)}
            </TextField>
            <TextField size="small" select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value as '' | EmploymentStatus)} sx={{ minWidth: 150 }}>
              <MenuItem value="">Tất cả</MenuItem>
              {(['probation', 'official', 'resigned'] as EmploymentStatus[]).map((s) => <MenuItem key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Stack>

          {filtered.length === 0 ? (
            <Typography color="text.secondary">{employees.length ? 'Không có nhân sự khớp bộ lọc.' : 'Chưa có nhân sự nào. Bấm “Thêm nhân sự”.'}</Typography>
          ) : (
            <Stack spacing={0.75}>
              {filtered.map((e) => {
                const exp = expiringCount(e);
                return (
                  <Stack
                    key={e.id} direction="row" alignItems="center" spacing={1.5}
                    sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} noWrap>
                        {e.fullName} {e.employeeCode && <Typography component="span" variant="caption" color="text.secondary">· {e.employeeCode}</Typography>}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {e.title || '—'}{e.department ? ` · ${DEPT_LABEL[e.department as keyof typeof DEPT_LABEL] ?? e.department}` : ''}{e.phone ? ` · ${e.phone}` : ''}
                      </Typography>
                    </Box>
                    {exp > 0 && (
                      <Tooltip title={`${exp} giấy tờ sắp/đã hết hạn`}>
                        <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={exp} />
                      </Tooltip>
                    )}
                    <Chip size="small" color={STATUS_COLOR[e.status]} label={EMPLOYMENT_STATUS_LABEL[e.status]} />
                    <IconButton size="small" onClick={() => setModal({ employee: e })}><EditIcon fontSize="small" /></IconButton>
                    {canEdit && <IconButton size="small" color="error" onClick={() => handleDelete(e)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </>
      )}

      {tab === 'org' && <OrgChart employees={employees} onPick={(e) => setModal({ employee: e })} />}
      {tab === 'eval' && <EvaluationsPanel employees={employees} />}

      {modal && (
        <EmployeeModal
          employee={modal.employee}
          all={employees}
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
}
