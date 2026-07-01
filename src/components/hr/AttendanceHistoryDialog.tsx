import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { periodLabelVN } from '@/lib/attendance/attendanceCalc';
import type { HrAttendance } from '@/types';

/** #10 Xem nhật ký thay đổi ô (audit log) của một bảng công. */
export function AttendanceHistoryDialog({ row, empName, onClose }: { row: HrAttendance; empName: string; onClose: () => void }) {
  const hist = [...(row.history ?? [])].reverse(); // mới nhất trước
  const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>🕓 Nhật ký chấm công — {empName} · {periodLabelVN(row.period)}</DialogTitle>
      <DialogContent dividers>
        {hist.length === 0 ? (
          <Typography color="text.secondary">Chưa có thay đổi nào được ghi nhận.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {hist.map((h, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', borderBottom: '1px dashed', borderColor: 'divider', pb: 0.5 }}>
                <Typography variant="caption" color="text.disabled" sx={{ minWidth: 128 }}>{new Date(h.at).toLocaleString('vi-VN')}</Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  Ngày <b>{dm(h.date)}</b>: <code>{h.from || '—'}</code> → <code>{h.to || '—'}</code>
                </Typography>
                <Typography variant="caption" color="text.secondary">{h.by}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Đóng</Button></DialogActions>
    </Dialog>
  );
}
