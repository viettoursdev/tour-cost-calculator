import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, Menu, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CampaignIcon from '@mui/icons-material/Campaign';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LockIcon from '@mui/icons-material/Lock';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import TuneIcon from '@mui/icons-material/Tune';
import SummarizeIcon from '@mui/icons-material/Summarize';
import HistoryIcon from '@mui/icons-material/History';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useAttendanceConfigStore } from '@/stores/attendanceConfigStore';
import { useHrLeaveStore } from '@/stores/hrLeaveStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { callAIWorker } from '@/lib/aiWorker';
import { notifyAttendancePublished } from '@/lib/attendanceNotify';
import { daysFromApprovedLeaves, annualLeaveUsedInYear, leaveBalance } from '@/lib/attendance/leaveIntegration';
import { scaffoldMonth } from '@/lib/attendance/attendanceScaffold';
import { detectAnomalies } from '@/lib/attendance/attendanceAnomalies';
import { toast } from '@/stores/toastStore';
import {
  periodDays, weekdayLabelVN, isWeekend, periodLabelVN, isValidPeriod,
} from '@/lib/attendance/attendanceCalc';
import {
  lookupCode, EMPTY_CELL_COLOR, UNKNOWN_CODE_COLOR,
} from '@/lib/attendance/attendanceCodes';
import {
  ATTENDANCE_STATUS_LABEL, ATTENDANCE_CONFIRM_LABEL,
  type HrAttendance, type HrEmployee, type AttendanceStatus,
} from '@/types';
import { AttendanceImportDialog } from './AttendanceImportDialog';
import { AttendanceCodesEditor } from './AttendanceCodesEditor';
import { AttendanceBulkFillDialog } from './AttendanceBulkFillDialog';
import { AttendanceHistoryDialog } from './AttendanceHistoryDialog';
import { AttendanceDashboard } from './AttendanceDashboard';

/** Hôm nay ISO (client). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CELL_W = 26;
const NAME_W = 180;

const STATUS_COLOR: Record<AttendanceStatus, 'default' | 'info' | 'success'> = {
  draft: 'default', published: 'info', locked: 'success',
};

/** Tháng hiện tại "YYYY-MM" (dùng client, không phải workflow nên Date hợp lệ). */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function AttendancePanel({ employees }: { employees: HrEmployee[] }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = hasPerm(currentUser, 'manageHR');
  const attendances = useAttendanceStore((s) => s.attendances);
  const setCell = useAttendanceStore((s) => s.setCell);
  const setStatus = useAttendanceStore((s) => s.setStatus);
  const mergeDays = useAttendanceStore((s) => s.mergeDays);
  const leaves = useHrLeaveStore((s) => s.leaves);
  const codes = useAttendanceConfigStore((s) => s.codes);

  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Các kỳ có dữ liệu (trong phạm vi nhân sự được xem).
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    for (const a of attendances) if (empIds.has(a.employeeLegacyId)) set.add(a.period);
    return [...set].sort().reverse();
  }, [attendances, empIds]);

  const [period, setPeriod] = useState(() => availablePeriods[0] ?? currentPeriod());
  const [importOpen, setImportOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [histRow, setHistRow] = useState<HrAttendance | null>(null);
  const [tab, setTab] = useState<'grid' | 'dashboard'>('grid');
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [editAnchor, setEditAnchor] = useState<{ el: HTMLElement; empId: string; iso: string } | null>(null);
  const [ai, setAi] = useState<{ loading: boolean; text: string; error: string }>({ loading: false, text: '', error: '' });

  const days = useMemo(() => (isValidPeriod(period) ? periodDays(period) : []), [period]);

  // Bảng công của kỳ, theo nhân viên.
  const rowByEmp = useMemo(() => {
    const m = new Map<string, HrAttendance>();
    for (const a of attendances) {
      if (a.period === period && empIds.has(a.employeeLegacyId)) m.set(a.employeeLegacyId, a);
    }
    return m;
  }, [attendances, period, empIds]);

  const periodRows = useMemo(() => [...rowByEmp.values()], [rowByEmp]);

  // Tổng hợp toàn kỳ (cho dải biểu đồ).
  const stats = useMemo(() => {
    let present = 0, paidLeave = 0, unpaidLeave = 0, sick = 0, holiday = 0, totalHC = 0;
    for (const a of periodRows) {
      present += a.summary.present ?? 0;
      paidLeave += a.summary.paidLeave ?? 0;
      unpaidLeave += a.summary.unpaidLeave ?? 0;
      sick += a.summary.sick ?? 0;
      holiday += a.summary.holiday ?? 0;
      totalHC += a.summary.totalHC ?? 0;
    }
    const withSheet = periodRows.length;
    const confirmed = periodRows.filter((a) => a.confirmation.status === 'confirmed').length;
    const disputed = periodRows.filter((a) => a.confirmation.status === 'disputed').length;
    return { present, paidLeave, unpaidLeave, sick, holiday, totalHC, withSheet, confirmed, disputed };
  }, [periodRows]);

  const distro = [
    { label: 'Đi làm', value: stats.present, color: '#0d7a6a' },
    { label: 'Nghỉ phép', value: stats.paidLeave, color: '#f4a259' },
    { label: 'Không lương', value: stats.unpaidLeave, color: '#b23b3b' },
    { label: 'Ốm/thai sản', value: stats.sick, color: '#9b8bd4' },
    { label: 'Lễ', value: stats.holiday, color: '#9e9e9e' },
  ].filter((d) => d.value > 0);
  const distroTotal = distro.reduce((s, d) => s + d.value, 0);

  const pickCode = (code: string | null) => {
    if (!editAnchor) return;
    const emp = empById.get(editAnchor.empId);
    if (emp) void setCell(emp, period, editAnchor.iso, code ? { code } : null);
    setEditAnchor(null);
  };

  const publish = async () => {
    if (!periodRows.length) { toast('Chưa có bảng công nào trong kỳ để công bố.', 'warning'); return; }
    if (!window.confirm(`Công bố bảng công ${periodLabelVN(period)} cho ${periodRows.length} nhân viên? Nhân viên sẽ thấy & xác nhận.`)) return;
    const toPublish = periodRows.filter((a) => a.status === 'draft');
    for (const a of toPublish) await setStatus(a.id, 'published');
    notifyAttendancePublished(toPublish, employees, useAuthStore.getState().users, currentUser?.name ?? 'Nhân sự');
    toast(`✅ Đã công bố ${periodLabelVN(period)}.`, 'success');
  };

  const lockPeriod = async () => {
    if (!window.confirm(`Khoá kỳ ${periodLabelVN(period)}? Sau khi khoá nên hạn chế chỉnh sửa.`)) return;
    for (const a of periodRows) if (a.status !== 'locked') await setStatus(a.id, 'locked');
    toast(`🔒 Đã khoá ${periodLabelVN(period)}.`, 'success');
  };

  // Quỹ phép năm còn lại theo từng nhân viên (năm của kỳ đang xem).
  const year = period.slice(0, 4);
  const balanceByEmp = useMemo(() => {
    const m = new Map<string, ReturnType<typeof leaveBalance>>();
    for (const e of employees) m.set(e.id, leaveBalance(annualLeaveUsedInYear(attendances, e.id, year)));
    return m;
  }, [employees, attendances, year]);

  const fillFromLeaves = async () => {
    const entries = employees
      .map((emp) => ({ emp, add: daysFromApprovedLeaves(leaves, emp.id, period) }))
      .filter((x) => Object.keys(x.add).length > 0);
    if (!entries.length) { toast('Không có đơn nghỉ phép đã duyệt nào trong kỳ này.', 'info'); return; }
    const totalCells = entries.reduce((s, x) => s + Object.keys(x.add).length, 0);
    if (!window.confirm(
      `Điền nghỉ phép đã duyệt vào bảng công ${periodLabelVN(period)}?\n`
      + `${entries.length} nhân viên · ${totalCells} ngày. Chỉ điền vào ô đang TRỐNG (không đè mã đã có).`,
    )) return;
    const filled = await mergeDays(period, entries);
    toast(filled ? `✅ Đã điền ${filled} ngày nghỉ phép vào bảng công.` : 'Các ngày nghỉ phép đã có mã sẵn — không thay đổi.', filled ? 'success' : 'info');
  };

  const scaffold = async () => {
    if (!window.confirm(
      `Tạo khung tháng ${periodLabelVN(period)} cho ${employees.length} nhân viên?\n`
      + `Điền X cho ngày thường, đánh dấu lễ dương lịch, bỏ trống cuối tuần. CHỈ điền vào ô đang trống.`,
    )) return;
    const add = scaffoldMonth(period);
    const filled = await mergeDays(period, employees.map((emp) => ({ emp, add })));
    toast(filled ? `✅ Đã tạo khung ${filled} ô.` : 'Các ô đã có mã sẵn — không thay đổi.', filled ? 'success' : 'info');
  };

  const exportXlsx = async () => {
    if (!periodRows.length) { toast('Chưa có bảng công nào trong kỳ để xuất.', 'warning'); return; }
    const { exportAttendanceExcel } = await import('@/lib/exports/exportAttendanceExcel');
    await exportAttendanceExcel({ period, employees, attendances });
  };

  const exportPayroll = async () => {
    if (!periodRows.length) { toast('Chưa có bảng công nào trong kỳ để xuất.', 'warning'); return; }
    const { exportPayrollSummary } = await import('@/lib/exports/exportPayrollSummary');
    await exportPayrollSummary({ period, employees, attendances });
  };

  // #6 Cảnh báo bất thường (luật thuần).
  const anomalies = useMemo(
    () => detectAnomalies(periodRows, employees, period, { codes, today: todayISO() }),
    [periodRows, employees, period, codes],
  );

  const runAI = async () => {
    setAi({ loading: true, text: '', error: '' });
    try {
      const lines = periodRows.map((a) => {
        const e = empById.get(a.employeeLegacyId);
        return `- ${e?.fullName ?? a.fullName}: công ${a.summary.totalHC}, phép ${a.summary.paidLeave}, không lương ${a.summary.unpaidLeave}, ốm ${a.summary.sick}`;
      });
      const prompt = `Bạn là trợ lý nhân sự. Dưới đây là tổng hợp chấm công ${periodLabelVN(period)} của ${periodRows.length} nhân viên Viettours. `
        + `Hãy nêu NGẮN GỌN (gạch đầu dòng tiếng Việt) các điểm bất thường đáng chú ý: ai nghỉ không lương nhiều, ai công thấp, xu hướng chung. Tối đa 6 ý.\n\n${lines.join('\n')}`;
      const d = await callAIWorker('/ai', { prompt });
      setAi({ loading: false, text: d.text ?? '(AI không trả về nội dung)', error: '' });
    } catch (e) {
      setAi({ loading: false, text: '', error: (e as Error).message });
    }
  };

  return (
    <Box>
      {/* Thanh công cụ */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap mb={1.5}>
        <TextField
          size="small" label="Kỳ công" type="month" value={period}
          onChange={(e) => setPeriod(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
        />
        {availablePeriods.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {availablePeriods.slice(0, 6).map((p) => (
              <Chip key={p} size="small" label={periodLabelVN(p)}
                color={p === period ? 'primary' : 'default'}
                variant={p === period ? 'filled' : 'outlined'}
                onClick={() => setPeriod(p)} />
            ))}
          </Stack>
        )}
        <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)}>
          <ToggleButton value="grid">Bảng công</ToggleButton>
          <ToggleButton value="dashboard">Dashboard</ToggleButton>
        </ToggleButtonGroup>
        <Box flex={1} />
        <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={runAI} disabled={ai.loading || !periodRows.length}>
          {ai.loading ? 'Đang phân tích…' : 'Nhận xét AI'}
        </Button>
        <Tooltip title="Xuất bảng công (ma trận NV × ngày)"><Button size="small" startIcon={<DownloadIcon />} onClick={exportXlsx} disabled={!periodRows.length}>Xuất Excel</Button></Tooltip>
        <Tooltip title="Xuất bảng TỔNG HỢP công cho kế toán/tính lương"><Button size="small" startIcon={<SummarizeIcon />} onClick={exportPayroll} disabled={!periodRows.length}>Tổng hợp</Button></Tooltip>
        {canEdit && <Tooltip title="Điền X ngày thường + lễ dương lịch, bỏ trống cuối tuần (chỉ ô trống)"><Button size="small" startIcon={<AutoFixHighIcon />} onClick={scaffold}>Tạo khung</Button></Tooltip>}
        {canEdit && <Tooltip title="Điền một mã cho nhiều NV theo khoảng ngày (đi tour…)"><Button size="small" startIcon={<PlaylistAddIcon />} onClick={() => setBulkOpen(true)}>Điền hàng loạt</Button></Tooltip>}
        {canEdit && <Tooltip title="Điền các ngày nghỉ phép ĐÃ DUYỆT vào ô trống của kỳ này"><Button size="small" startIcon={<EventAvailableIcon />} onClick={fillFromLeaves}>Điền nghỉ phép</Button></Tooltip>}
        {canEdit && <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>Nhập Excel</Button>}
        {canEdit && <Tooltip title="Sửa từ điển mã công"><IconButton size="small" onClick={() => setCodesOpen(true)}><TuneIcon fontSize="small" /></IconButton></Tooltip>}
        {canEdit && <Button size="small" variant="contained" startIcon={<CampaignIcon />} onClick={publish}>Công bố</Button>}
        {canEdit && <Tooltip title="Khoá kỳ"><span><IconButton size="small" onClick={lockPeriod} disabled={!periodRows.length}><LockIcon fontSize="small" /></IconButton></span></Tooltip>}
      </Stack>

      {/* Dải tổng hợp + biểu đồ phân bổ */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1}>
        <Chip size="small" label={`${employees.length} nhân viên`} />
        <Chip size="small" color="primary" variant="outlined" label={`${stats.withSheet} có bảng công`} />
        <Chip size="small" variant="outlined" label={`Tổng công: ${stats.totalHC}`} />
        {stats.confirmed > 0 && <Chip size="small" color="success" label={`${stats.confirmed} đã xác nhận`} />}
        {stats.disputed > 0 && <Chip size="small" color="warning" label={`${stats.disputed} báo sai sót`} />}
      </Stack>
      {distroTotal > 0 && (
        <Box mb={1.5}>
          <Box sx={{ display: 'flex', height: 14, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            {distro.map((d) => (
              <Tooltip key={d.label} title={`${d.label}: ${d.value} công`}>
                <Box sx={{ width: `${(d.value / distroTotal) * 100}%`, bgcolor: d.color }} />
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" spacing={1.5} mt={0.5} flexWrap="wrap" useFlexGap>
            {distro.map((d) => (
              <Stack key={d.label} direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: d.color }} />
                <Typography variant="caption" color="text.secondary">{d.label} ({d.value})</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {ai.error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAi((s) => ({ ...s, error: '' }))}>{ai.error}</Alert>}
      {ai.text && (
        <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }} onClose={() => setAi((s) => ({ ...s, text: '' }))}>
          {ai.text}
        </Alert>
      )}

      {/* #6 Cảnh báo bất thường (luật thuần) */}
      {tab === 'grid' && anomalies.length > 0 && (
        <Alert
          severity={anomalies.some((x) => x.severity === 'high') ? 'warning' : 'info'}
          icon={<WarningAmberIcon />} sx={{ mb: 1.5 }}
          action={<Button color="inherit" size="small" onClick={() => setShowAnomalies((v) => !v)}>{showAnomalies ? 'Ẩn' : `Xem ${anomalies.length}`}</Button>}
        >
          Phát hiện <b>{anomalies.length}</b> điểm cần chú ý trong kỳ.
          {showAnomalies && (
            <Stack spacing={0.25} mt={0.75}>
              {anomalies.slice(0, 30).map((x, i) => (
                <Typography key={i} variant="caption" color={x.severity === 'high' ? 'error' : 'text.secondary'}>
                  {x.severity === 'high' ? '🔴' : x.severity === 'medium' ? '🟠' : '🟡'} <b>{x.empName}</b>: {x.message}
                </Typography>
              ))}
              {anomalies.length > 30 && <Typography variant="caption" color="text.disabled">… và {anomalies.length - 30} mục khác</Typography>}
            </Stack>
          )}
        </Alert>
      )}

      {!isValidPeriod(period) ? (
        <Typography color="text.secondary">Chọn kỳ công hợp lệ.</Typography>
      ) : employees.length === 0 ? (
        <Typography color="text.secondary">Không có nhân viên trong phạm vi xem.</Typography>
      ) : tab === 'dashboard' ? (
        <AttendanceDashboard employees={employees} attendances={attendances} period={period} />
      ) : (
        <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Box sx={{ minWidth: NAME_W + days.length * CELL_W + 120 }}>
            {/* Header ngày */}
            <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper' }}>
              <Box sx={{ width: NAME_W, flexShrink: 0, p: 0.5, fontWeight: 700, fontSize: 12, position: 'sticky', left: 0, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                Nhân viên
              </Box>
              {days.map((iso) => {
                const d = Number(iso.slice(8));
                const we = isWeekend(iso);
                return (
                  <Box key={iso} sx={{ width: CELL_W, flexShrink: 0, textAlign: 'center', py: 0.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: we ? '#fafafa' : 'transparent' }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1.1, color: we ? 'text.disabled' : 'text.primary' }}>{d}</Typography>
                    <Typography sx={{ fontSize: 8, lineHeight: 1, color: 'text.disabled' }}>{weekdayLabelVN(iso)}</Typography>
                  </Box>
                );
              })}
              <Box sx={{ width: 120, flexShrink: 0, textAlign: 'center', py: 0.25, fontSize: 11, fontWeight: 700, borderBottom: '1px solid', borderColor: 'divider' }}>Công · TT</Box>
            </Box>

            {/* Hàng nhân viên */}
            {employees.map((e) => {
              const a = rowByEmp.get(e.id);
              const rowEditable = canEdit && a?.status !== 'locked'; // kỳ đã khoá → không sửa
              return (
                <Box key={e.id} sx={{ display: 'flex', '&:hover': { bgcolor: 'action.hover' } }}>
                  <Tooltip
                    disableInteractive placement="right"
                    title={(() => { const b = balanceByEmp.get(e.id); return b ? `Phép năm ${year}: còn ${b.remaining}/${b.quota} ngày (đã dùng ${b.used})` : ''; })()}
                  >
                    <Box sx={{ width: NAME_W, flexShrink: 0, p: 0.5, position: 'sticky', left: 0, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 12, fontWeight: 600 }}>{e.fullName}</Typography>
                      <Typography noWrap sx={{ fontSize: 10, color: 'text.disabled' }}>
                        {e.employeeCode}
                        {(() => { const b = balanceByEmp.get(e.id); return b && b.used > 0 ? ` · phép còn ${b.remaining}` : ''; })()}
                      </Typography>
                    </Box>
                  </Tooltip>
                  {days.map((iso) => {
                    const cell = a?.days[iso];
                    const def = cell ? lookupCode(cell.code, codes) : undefined;
                    const bg = cell ? (def?.color ?? UNKNOWN_CODE_COLOR) : (isWeekend(iso) ? '#fafafa' : EMPTY_CELL_COLOR);
                    const fg = def && def.category !== 'other' ? '#fff' : '#444';
                    return (
                      <Tooltip key={iso} title={cell ? `${cell.code}${def ? ' · ' + def.label : ' · (mã lạ)'}${cell.note ? ' · ' + cell.note : ''}` : ''} disableInteractive>
                        <Box
                          onClick={rowEditable ? (ev) => setEditAnchor({ el: ev.currentTarget, empId: e.id, iso }) : undefined}
                          sx={{
                            width: CELL_W, flexShrink: 0, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: bg, color: fg, fontSize: 9, fontWeight: 700, borderRight: '1px solid #fff', borderBottom: '1px solid', borderColor: 'divider',
                            cursor: rowEditable ? 'pointer' : 'default',
                          }}
                        >
                          {cell?.code ?? ''}
                        </Box>
                      </Tooltip>
                    );
                  })}
                  <Box sx={{ width: 120, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{a?.summary.totalHC ?? 0}</Typography>
                    {a && <Chip size="small" color={STATUS_COLOR[a.status]} label={ATTENDANCE_STATUS_LABEL[a.status]} sx={{ height: 18, fontSize: 9 }} />}
                    {a && a.confirmation.status !== 'pending' && (
                      <Tooltip title={ATTENDANCE_CONFIRM_LABEL[a.confirmation.status]}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: a.confirmation.status === 'confirmed' ? 'success.main' : 'warning.main' }} />
                      </Tooltip>
                    )}
                    {a && (a.history?.length ?? 0) > 0 && (
                      <Tooltip title="Nhật ký thay đổi">
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setHistRow(a)}><HistoryIcon sx={{ fontSize: 14 }} /></IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Chú giải mã */}
      <Box mt={1.5}>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>Chú giải mã:</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={0.5}>
          {codes.map((d) => (
            <Tooltip key={d.code} title={d.label}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: d.color, color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.code}</Box>
                <Typography variant="caption" color="text.secondary">{d.label}</Typography>
              </Stack>
            </Tooltip>
          ))}
        </Stack>
      </Box>

      {canEdit && (
        <Typography variant="caption" color="text.disabled" display="block" mt={1}>
          💡 Bấm vào một ô để điều chỉnh mã công của ngày đó.
        </Typography>
      )}

      {/* Menu chọn mã khi sửa ô */}
      <Menu anchorEl={editAnchor?.el ?? null} open={!!editAnchor} onClose={() => setEditAnchor(null)}>
        <MenuItem onClick={() => pickCode(null)}><em>— Xoá ô —</em></MenuItem>
        <Divider />
        {codes.map((d) => (
          <MenuItem key={d.code} onClick={() => pickCode(d.code)}>
            <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: d.color, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1 }}>{d.code}</Box>
            {d.label}
          </MenuItem>
        ))}
      </Menu>

      {importOpen && (
        <AttendanceImportDialog
          employees={employees}
          onClose={() => setImportOpen(false)}
          onImported={(p) => setPeriod(p)}
        />
      )}
      {codesOpen && <AttendanceCodesEditor onClose={() => setCodesOpen(false)} />}
      {bulkOpen && <AttendanceBulkFillDialog period={period} employees={employees} onClose={() => setBulkOpen(false)} />}
      {histRow && <AttendanceHistoryDialog row={histRow} empName={empById.get(histRow.employeeLegacyId)?.fullName ?? histRow.fullName} onClose={() => setHistRow(null)} />}
    </Box>
  );
}
