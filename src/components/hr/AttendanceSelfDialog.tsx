import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useAuthStore } from '@/stores/authStore';
import { notifyAttendanceDisputed } from '@/lib/attendanceNotify';
import { toast } from '@/stores/toastStore';
import {
  periodDays, weekdayLabelVN, isWeekend, periodLabelVN,
} from '@/lib/attendance/attendanceCalc';
import { annualLeaveUsedInYear, leaveBalance } from '@/lib/attendance/leaveIntegration';
import { lookupCode, EMPTY_CELL_COLOR, UNKNOWN_CODE_COLOR } from '@/lib/attendance/attendanceCodes';
import {
  ATTENDANCE_STATUS_LABEL, ATTENDANCE_CONFIRM_LABEL,
  type HrAttendance, type HrEmployee,
} from '@/types';

const CELL = 30;

/** Cổng tự phục vụ: nhân viên xem & xác nhận / báo sai sót bảng công CỦA CHÍNH MÌNH. */
export function AttendanceSelfDialog({
  employee, onClose,
}: {
  employee: HrEmployee;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const attendances = useAttendanceStore((s) => s.attendances);
  const confirm = useAttendanceStore((s) => s.confirm);

  // Bảng công đã CÔNG BỐ (hoặc đã khoá) của nhân viên này, mới nhất trước.
  const myRows = useMemo(
    () => attendances
      .filter((a) => a.employeeLegacyId === employee.id && a.status !== 'draft')
      .sort((a, b) => b.period.localeCompare(a.period)),
    [attendances, employee.id],
  );

  const [periodIdx, setPeriodIdx] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const row: HrAttendance | undefined = myRows[periodIdx];

  const days = useMemo(() => (row ? periodDays(row.period) : []), [row]);

  // Quỹ phép năm còn lại (năm của kỳ đang xem).
  const balance = useMemo(() => {
    if (!row) return null;
    const yr = row.period.slice(0, 4);
    return { yr, ...leaveBalance(annualLeaveUsedInYear(attendances, employee.id, yr)) };
  }, [attendances, employee.id, row]);

  const act = async (accepted: boolean) => {
    if (!row || !currentUser) return;
    if (!accepted && !note.trim()) { toast('Vui lòng ghi rõ điểm sai sót trước khi gửi.', 'warning'); return; }
    setBusy(true);
    const saved = await confirm(row.id, accepted, accepted ? undefined : note, currentUser.name);
    setBusy(false);
    if (saved) {
      if (!accepted) notifyAttendanceDisputed(saved, employee, useAuthStore.getState().users, currentUser.name, note.trim());
      toast(accepted ? '✅ Đã xác nhận bảng công.' : '✅ Đã gửi phản hồi tới bộ phận nhân sự.', 'success');
      setNote('');
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>📋 Bảng công của tôi — {employee.fullName}</DialogTitle>
      <DialogContent dividers>
        {myRows.length === 0 ? (
          <Typography color="text.secondary">Chưa có bảng công nào được công bố cho bạn.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {/* Chọn kỳ */}
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {myRows.map((r, i) => (
                <Chip key={r.id} size="small" label={periodLabelVN(r.period)}
                  color={i === periodIdx ? 'primary' : 'default'}
                  variant={i === periodIdx ? 'filled' : 'outlined'}
                  onClick={() => { setPeriodIdx(i); setNote(''); }} />
              ))}
            </Stack>

            {row && (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                  <Chip size="small" color="info" label={ATTENDANCE_STATUS_LABEL[row.status]} />
                  <Chip size="small"
                    color={row.confirmation.status === 'confirmed' ? 'success' : row.confirmation.status === 'disputed' ? 'warning' : 'default'}
                    label={ATTENDANCE_CONFIRM_LABEL[row.confirmation.status]} />
                  <Box flex={1} />
                  <Chip size="small" variant="outlined" label={`Số công (HC): ${row.summary.totalHC}`} />
                  {row.summary.paidLeave > 0 && <Chip size="small" variant="outlined" label={`Phép: ${row.summary.paidLeave}`} />}
                  {row.summary.unpaidLeave > 0 && <Chip size="small" color="warning" variant="outlined" label={`Không lương: ${row.summary.unpaidLeave}`} />}
                  {balance && (
                    <Tooltip title={`Đã dùng ${balance.used}/${balance.quota} ngày phép năm ${balance.yr}`}>
                      <Chip size="small" color={balance.remaining <= 0 ? 'warning' : 'success'} variant="outlined"
                        label={`Phép năm còn: ${balance.remaining}/${balance.quota}`} />
                    </Tooltip>
                  )}
                </Stack>

                {/* Timeline tháng */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                  {days.map((iso) => {
                    const cell = row.days[iso];
                    const def = cell ? lookupCode(cell.code) : undefined;
                    const bg = cell ? (def?.color ?? UNKNOWN_CODE_COLOR) : (isWeekend(iso) ? '#fafafa' : EMPTY_CELL_COLOR);
                    const fg = def && def.category !== 'other' ? '#fff' : '#555';
                    return (
                      <Tooltip key={iso} title={cell ? `${iso.slice(8)}/${iso.slice(5, 7)} · ${cell.code}${def ? ' · ' + def.label : ' · (mã lạ)'}` : `${iso.slice(8)}/${iso.slice(5, 7)}`} disableInteractive>
                        <Box sx={{ width: CELL, height: CELL, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: bg, color: fg, borderRadius: 0.5 }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{Number(iso.slice(8))}</Typography>
                          <Typography sx={{ fontSize: 8, lineHeight: 1 }}>{cell?.code ?? weekdayLabelVN(iso)}</Typography>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>

                {/* Lịch sử phản hồi */}
                {row.feedback.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>Phản hồi đã gửi:</Typography>
                    <Stack spacing={0.5} mt={0.5}>
                      {row.feedback.map((f) => (
                        <Typography key={f.id} variant="caption" color="text.secondary">
                          {f.type === 'confirm' ? '✅' : '⚠️'} {new Date(f.at).toLocaleString('vi-VN')} — {f.type === 'confirm' ? 'Đã xác nhận' : 'Báo sai sót'}{f.note ? `: “${f.note}”` : ''}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}

                {row.status === 'locked' ? (
                  <Alert severity="info">Kỳ công này đã khoá. Liên hệ bộ phận nhân sự nếu cần điều chỉnh.</Alert>
                ) : (
                  <>
                    <Divider />
                    <TextField
                      size="small" fullWidth multiline minRows={2}
                      label="Ghi chú (bắt buộc nếu báo sai sót)"
                      value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Ví dụ: Ngày 12/6 tôi đi làm chứ không phải nghỉ phép."
                    />
                  </>
                )}
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        {row && row.status !== 'locked' && (
          <>
            <Button color="warning" variant="outlined" startIcon={<ReportProblemIcon />} disabled={busy} onClick={() => act(false)}>
              Báo sai sót
            </Button>
            <Button color="success" variant="contained" startIcon={<CheckCircleIcon />} disabled={busy} onClick={() => act(true)}>
              Xác nhận đúng
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
