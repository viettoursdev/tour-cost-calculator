import { useMemo } from 'react';
import {
  Box, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { visibleVisaProjects } from './visaAccess';
import { avgProcessingDays, passRate, tallyByStaff } from './visaStats';

/** Khối thống kê nâng cao: thời gian xử lý TB + tỷ lệ đậu theo nhân viên phụ trách. */
export function VisaAdvancedStats() {
  const user = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const allProjects = useVisaProjectStore((s) => s.projects);

  const projects = useMemo(() => visibleVisaProjects(user, allProjects), [user, allProjects]);
  const byStaff = useMemo(() => tallyByStaff(projects), [projects]);
  const proc = useMemo(() => avgProcessingDays(projects), [projects]);
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography fontWeight={800} sx={{ mb: 1.5 }}>👥 Hiệu suất theo nhân viên & thời gian xử lý</Typography>

      <Stack direction="row" spacing={3} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>Thời gian xử lý TB</Typography>
          <Typography fontWeight={900} fontSize={26} sx={{ color: '#0d7a6a', lineHeight: 1.1 }}>
            {proc.avg != null ? `${proc.avg} ngày` : '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {proc.avg != null ? `Từ triển khai → dự kiến có visa · ${proc.n} khách` : 'Cần nhập mốc triển khai & dự kiến có visa'}
          </Typography>
        </Box>
      </Stack>

      {byStaff.length === 0 ? (
        <Typography variant="body2" color="text.disabled">Chưa có dữ liệu khách để thống kê.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 800, fontSize: 12.5 } }}>
              <TableCell>Nhân viên</TableCell>
              <TableCell align="right">Tổng</TableCell>
              <TableCell align="right">Đậu</TableCell>
              <TableCell align="right">Rớt</TableCell>
              <TableCell align="right">Đã có</TableCell>
              <TableCell align="right">Chờ</TableCell>
              <TableCell align="right">Tỷ lệ đậu</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {byStaff.map(({ username, t }) => {
              const pr = passRate(t);
              return (
                <TableRow key={username} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{nameOf(username)}</TableCell>
                  <TableCell align="right">{t.total}</TableCell>
                  <TableCell align="right" sx={{ color: '#27ae60' }}>{t.passed}</TableCell>
                  <TableCell align="right" sx={{ color: '#dc3250' }}>{t.failed}</TableCell>
                  <TableCell align="right" sx={{ color: '#2563eb' }}>{t.haveVisa}</TableCell>
                  <TableCell align="right" sx={{ color: '#a855f7' }}>{t.pending}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: pr == null ? 'text.disabled' : pr >= 50 ? '#27ae60' : '#dc3250' }}>
                    {pr == null ? '—' : `${pr}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
