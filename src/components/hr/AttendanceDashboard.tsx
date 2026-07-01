import { useMemo } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { DEPT_LABEL } from '@/auth/departments';
import { periodLabelVN } from '@/lib/attendance/attendanceCalc';
import { monthlyStats, deptStats, topAbsentees } from '@/lib/attendance/attendanceAggregate';
import type { HrAttendance, HrEmployee } from '@/types';

/** #8 Dashboard chấm công nhiều tháng: xu hướng công + theo phòng + top nghỉ. */
export function AttendanceDashboard({
  employees, attendances, period,
}: {
  employees: HrEmployee[];
  attendances: HrAttendance[];
  period: string;
}) {
  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const monthly = useMemo(() => monthlyStats(attendances, empIds).slice(-12), [attendances, empIds]);
  const depts = useMemo(() => deptStats(attendances, employees, period), [attendances, employees, period]);
  const top = useMemo(() => topAbsentees(attendances, employees, period, 8), [attendances, employees, period]);

  const maxHC = Math.max(1, ...monthly.map((m) => m.totalHC));
  const deptLabel = (d: string) => DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d;

  if (!monthly.length) return <Typography color="text.secondary">Chưa có dữ liệu chấm công để thống kê.</Typography>;

  return (
    <Stack spacing={2.5}>
      {/* Xu hướng tổng công theo tháng */}
      <Box>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>📈 Tổng công theo tháng</Typography>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 160, px: 1 }}>
          {monthly.map((m) => (
            <Tooltip key={m.period} title={`${periodLabelVN(m.period)}: ${m.totalHC} công · ${m.sheets} bảng`}>
              <Stack alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={700}>{m.totalHC}</Typography>
                <Box sx={{ width: '70%', height: `${(m.totalHC / maxHC) * 120}px`, bgcolor: '#0d7a6a', borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 9 }}>{m.period.slice(5)}/{m.period.slice(2, 4)}</Typography>
              </Stack>
            </Tooltip>
          ))}
        </Box>
      </Box>

      {/* Theo phòng ban (kỳ hiện tại) */}
      <Box>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>🏢 Theo phòng ban — {periodLabelVN(period)}</Typography>
        {depts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Chưa có dữ liệu kỳ này.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {depts.map((d) => {
              const max = Math.max(1, ...depts.map((x) => x.totalHC));
              return (
                <Stack key={d.department} direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" sx={{ width: 130, flexShrink: 0 }} noWrap>{deptLabel(d.department)}</Typography>
                  <Box sx={{ flex: 1, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden', height: 16 }}>
                    <Box sx={{ width: `${(d.totalHC / max) * 100}%`, bgcolor: '#2e8b8b', height: '100%' }} />
                  </Box>
                  <Typography variant="caption" fontWeight={700} sx={{ width: 90, textAlign: 'right' }}>{d.totalHC} · {d.sheets} NV</Typography>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Top nghỉ nhiều */}
      <Box>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>🌴 Nghỉ nhiều nhất — {periodLabelVN(period)}</Typography>
        {top.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Không có ai nghỉ trong kỳ.</Typography>
        ) : (
          <Stack spacing={0.5}>
            {top.map((t) => (
              <Stack key={t.empId} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ width: 160 }} noWrap>{t.name}</Typography>
                <Chip size="small" label={`Tổng ${t.total}`} color="default" />
                {t.paidLeave > 0 && <Chip size="small" variant="outlined" label={`Phép ${t.paidLeave}`} sx={{ borderColor: '#f4a259', color: '#b5651d' }} />}
                {t.unpaidLeave > 0 && <Chip size="small" color="warning" variant="outlined" label={`Không lương ${t.unpaidLeave}`} />}
                {t.sick > 0 && <Chip size="small" variant="outlined" label={`Ốm ${t.sick}`} sx={{ borderColor: '#9b8bd4', color: '#5e4b9b' }} />}
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
