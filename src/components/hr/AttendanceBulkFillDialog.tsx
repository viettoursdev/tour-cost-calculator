import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useAttendanceConfigStore } from '@/stores/attendanceConfigStore';
import { toast } from '@/stores/toastStore';
import { periodDays, periodLabelVN } from '@/lib/attendance/attendanceCalc';
import type { AttendanceDays, HrEmployee } from '@/types';

/** #3 Điền HÀNG LOẠT một mã cho nhiều NV trong một khoảng ngày (vd đi tour → T). */
export function AttendanceBulkFillDialog({
  period, employees, onClose,
}: {
  period: string;
  employees: HrEmployee[];
  onClose: () => void;
}) {
  const mergeDays = useAttendanceStore((s) => s.mergeDays);
  const codes = useAttendanceConfigStore((s) => s.codes);
  const allDays = useMemo(() => periodDays(period), [period]);

  const [from, setFrom] = useState(allDays[0] ?? '');
  const [to, setTo] = useState(allDays[allDays.length - 1] ?? '');
  const [code, setCode] = useState('T');
  const [overwrite, setOverwrite] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(employees.map((e) => e.id)));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = picked.size === employees.length;

  const rangeDays = useMemo(
    () => allDays.filter((d) => d >= from && d <= to),
    [allDays, from, to],
  );

  const apply = async () => {
    if (!code.trim()) { toast('Chọn mã công.', 'warning'); return; }
    if (!rangeDays.length) { toast('Khoảng ngày không hợp lệ.', 'warning'); return; }
    const chosen = employees.filter((e) => picked.has(e.id));
    if (!chosen.length) { toast('Chọn ít nhất 1 nhân viên.', 'warning'); return; }
    const add: AttendanceDays = Object.fromEntries(rangeDays.map((iso) => [iso, { code }]));
    const entries = chosen.map((emp) => ({ emp, add }));
    setBusy(true);
    const filled = await mergeDays(period, entries, { overwrite });
    setBusy(false);
    toast(filled ? `✅ Đã điền ${filled} ô (${code}).` : 'Không có ô nào thay đổi (đã có mã, chưa bật ghi đè).', filled ? 'success' : 'info');
    if (filled) onClose();
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>🧩 Điền hàng loạt — {periodLabelVN(period)}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            Điền một mã (vd <b>T</b> đi tour / <b>C</b> công tác) cho nhiều nhân viên trong một khoảng ngày.
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ min: allDays[0], max: allDays[allDays.length - 1] }} fullWidth />
            <TextField size="small" label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ min: allDays[0], max: allDays[allDays.length - 1] }} fullWidth />
          </Stack>
          <TextField size="small" select label="Mã công" value={code} onChange={(e) => setCode(e.target.value)}>
            {codes.map((d) => (
              <MenuItem key={d.code} value={d.code}>
                <Box component="span" sx={{ display: 'inline-block', width: 16, height: 16, borderRadius: 0.5, bgcolor: d.color, mr: 1, verticalAlign: 'middle' }} /> {d.code} · {d.label}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel control={<Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />} label="Ghi đè cả ô đã có mã (mặc định chỉ điền ô trống)" />
          {overwrite && <Alert severity="warning">Ghi đè sẽ thay mã đang có trong khoảng ngày đã chọn.</Alert>}

          <Box>
            <FormControlLabel
              control={<Checkbox checked={allPicked} indeterminate={picked.size > 0 && !allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(employees.map((e) => e.id)))} />}
              label={`Chọn nhân viên (${picked.size}/${employees.length})`}
            />
            <Box sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }}>
              {employees.map((e) => (
                <FormControlLabel key={e.id} sx={{ display: 'flex', ml: 0 }}
                  control={<Checkbox size="small" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />}
                  label={<Typography variant="body2">{e.fullName} <Typography component="span" variant="caption" color="text.disabled">· {e.employeeCode}</Typography></Typography>} />
              ))}
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary">{rangeDays.length} ngày × {picked.size} nhân viên</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="contained" onClick={apply} disabled={busy}>Điền</Button>
      </DialogActions>
    </Dialog>
  );
}
