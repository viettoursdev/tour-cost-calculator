import { useMemo } from 'react';
import { Box, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { todoStats } from '@/lib/todoFilter';
import type { Todo, User } from '@/types';

const Stat = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
  <Paper variant="outlined" sx={{ p: 1.5, borderTop: `3px solid ${color}`, flex: 1, minWidth: 120 }}>
    <Typography fontSize={26} fontWeight={900} sx={{ color, lineHeight: 1 }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Paper>
);

/** Dashboard quản trị: số liệu tổng + tải công việc theo người. */
export function TodoDashboard({ todos, users }: { todos: Todo[]; users: User[] }) {
  const s = useMemo(() => todoStats(todos, users), [todos, users]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Stat label="Tổng việc" value={s.total} color="#0d7a6a" />
        <Stat label="Đang mở" value={s.open} color="#2563eb" />
        <Stat label="Đang làm" value={s.doing} color="#7c3aed" />
        <Stat label="Quá hạn" value={s.overdue} color="#dc3250" />
        <Stat label="Xong (30 ngày)" value={s.done} color="#27ae60" />
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.75 }}>
        <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.5 }}>Tỉ lệ hoàn thành</Typography>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ flex: 1 }}>
            <LinearProgress variant="determinate" value={s.doneRate} sx={{ height: 10, borderRadius: 5,
              '& .MuiLinearProgress-bar': { bgcolor: '#27ae60' } }} />
          </Box>
          <Typography fontWeight={800} sx={{ color: '#27ae60' }}>{s.doneRate}%</Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.75 }}>
        <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Tải công việc theo người</Typography>
        {s.workload.length === 0 ? (
          <Typography variant="caption" color="text.disabled">Chưa có việc nào.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Người</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Đang mở</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Đang làm</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#dc3250' }}>Quá hạn</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#27ae60' }}>Xong (30n)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {s.workload.map((r) => (
                <TableRow key={r.u} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell align="right">{r.open}</TableCell>
                  <TableCell align="right">{r.doing}</TableCell>
                  <TableCell align="right" sx={{ color: r.overdue ? '#dc3250' : 'text.disabled', fontWeight: r.overdue ? 700 : 400 }}>{r.overdue}</TableCell>
                  <TableCell align="right" sx={{ color: '#27ae60' }}>{r.done}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
