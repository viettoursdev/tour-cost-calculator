import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useAttendanceConfigStore } from '@/stores/attendanceConfigStore';
import { computeHours } from '@/lib/attendance/attendanceHours';
import type { HrAttendance, HrEmployee } from '@/types';

/** HR sửa GIỜ vào/ra cho một ô (chấm công theo giờ). */
export function AttendanceTimeDialog({
  emp, period, isoDate, row, onClose,
}: {
  emp: HrEmployee;
  period: string;
  isoDate: string;
  row?: HrAttendance;
  onClose: () => void;
}) {
  const setCellTimes = useAttendanceStore((s) => s.setCellTimes);
  const breakMins = useAttendanceConfigStore((s) => s.settings.breakMins);
  const cell = row?.days[isoDate];
  const [inT, setInT] = useState(cell?.in ?? '');
  const [outT, setOutT] = useState(cell?.out ?? '');
  const [busy, setBusy] = useState(false);
  const hours = computeHours(inT, outT, breakMins);

  const submit = async () => {
    setBusy(true);
    await setCellTimes(emp, period, isoDate, { in: inT || undefined, out: outT || undefined });
    setBusy(false);
    onClose();
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>⏱️ Giờ làm — {emp.fullName} · {isoDate.slice(8)}/{isoDate.slice(5, 7)}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.5}>
          <TextField size="small" label="Giờ vào" type="time" value={inT} onChange={(e) => setInT(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField size="small" label="Giờ ra" type="time" value={outT} onChange={(e) => setOutT(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        </Stack>
        <Typography variant="body2" color="text.secondary" mt={1.5}>
          Số giờ làm (đã trừ {breakMins} phút nghỉ trưa): <b>{hours}</b> giờ
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>Lưu giờ</Button>
      </DialogActions>
    </Dialog>
  );
}
