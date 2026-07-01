import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  IconButton, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAttendanceConfigStore } from '@/stores/attendanceConfigStore';
import { toast } from '@/stores/toastStore';
import type { AttendanceCategory, AttendanceCodeDef, AttendanceSettings } from '@/types';

const CATEGORIES: { value: AttendanceCategory; label: string }[] = [
  { value: 'work', label: 'Đi làm' },
  { value: 'leave_paid', label: 'Nghỉ có lương' },
  { value: 'leave_unpaid', label: 'Nghỉ không lương' },
  { value: 'sick', label: 'Ốm/thai sản' },
  { value: 'holiday', label: 'Lễ' },
  { value: 'half', label: 'Nửa ngày' },
  { value: 'other', label: 'Khác' },
];

/** #4 HR tự quản từ điển MÃ CÔNG (nhãn/số công/màu/thêm-xoá mã). */
export function AttendanceCodesEditor({ onClose }: { onClose: () => void }) {
  const codes = useAttendanceConfigStore((s) => s.codes);
  const custom = useAttendanceConfigStore((s) => s.custom);
  const settings = useAttendanceConfigStore((s) => s.settings);
  const save = useAttendanceConfigStore((s) => s.save);
  const resetToDefault = useAttendanceConfigStore((s) => s.resetToDefault);

  const [rows, setRows] = useState<AttendanceCodeDef[]>(() => codes.map((c) => ({ ...c })));
  const [st, setSt] = useState<AttendanceSettings>(() => ({ ...settings }));
  const [busy, setBusy] = useState(false);
  const patchSt = (p: Partial<AttendanceSettings>) => setSt((prev) => ({ ...prev, ...p }));

  const patch = (i: number, p: Partial<AttendanceCodeDef>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const add = () => setRows((prev) => [...prev, { code: '', label: '', work: 1, worked: 1, paid: true, category: 'work', color: '#0d7a6a' }]);

  const commit = async () => {
    const clean = rows.filter((r) => r.code.trim());
    const seen = new Set<string>();
    for (const r of clean) {
      const k = r.code.trim().toUpperCase();
      if (seen.has(k)) { toast(`Mã trùng: ${r.code}`, 'warning'); return; }
      seen.add(k);
    }
    setBusy(true);
    const ok = await save(clean, st);
    setBusy(false);
    if (ok) { toast('✅ Đã lưu cấu hình chấm công.', 'success'); onClose(); }
  };

  const doReset = async () => {
    if (!window.confirm('Khôi phục bộ mã MẶC ĐỊNH? Bộ mã tùy chỉnh hiện tại sẽ bị bỏ.')) return;
    setBusy(true);
    const ok = await resetToDefault();
    setBusy(false);
    if (ok) { toast('Đã khôi phục bộ mã mặc định.', 'success'); onClose(); }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>🏷️ Từ điển mã công {custom ? '(đang dùng bản tùy chỉnh)' : '(mặc định)'}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <b>Số công</b> = ngày tính vào tổng công (SỐ NGÀY HC). <b>Đi làm thật</b> = phần vào dải "đi làm".
          Đổi ở đây áp dụng cho toàn công ty. Để trống danh sách rồi Lưu = quay về mặc định.
        </Alert>

        {/* Cài đặt chấm công theo GIỜ (tùy chọn) */}
        <Box sx={{ mb: 1.5, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <FormControlLabel
            control={<Switch checked={st.hourTracking} onChange={(e) => patchSt({ hourTracking: e.target.checked })} />}
            label={<Typography fontWeight={700}>⏱️ Bật chấm công theo GIỜ vào/ra</Typography>}
          />
          {st.hourTracking && (
            <Stack direction="row" spacing={1.5} mt={1} flexWrap="wrap" useFlexGap>
              <TextField size="small" label="Giờ vào chuẩn" type="time" value={st.standardStart} onChange={(e) => patchSt({ standardStart: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 140 }} />
              <TextField size="small" label="Giờ ra chuẩn" type="time" value={st.standardEnd} onChange={(e) => patchSt({ standardEnd: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 140 }} />
              <TextField size="small" label="Nghỉ trưa (phút)" type="number" value={st.breakMins} onChange={(e) => patchSt({ breakMins: Number(e.target.value) })} sx={{ width: 130 }} />
              <TextField size="small" label="Dung sai muộn (phút)" type="number" value={st.graceMins} onChange={(e) => patchSt({ graceMins: Number(e.target.value) })} sx={{ width: 150 }} />
            </Stack>
          )}
        </Box>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>🏷️ Bộ mã công</Typography>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700 } }}>
              <TableCell sx={{ width: 80 }}>Mã</TableCell>
              <TableCell>Diễn giải</TableCell>
              <TableCell sx={{ width: 80 }}>Số công</TableCell>
              <TableCell sx={{ width: 90 }}>Đi làm thật</TableCell>
              <TableCell sx={{ width: 90 }}>Có lương</TableCell>
              <TableCell sx={{ width: 150 }}>Nhóm</TableCell>
              <TableCell sx={{ width: 70 }}>Màu</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell><TextField variant="standard" value={r.code} onChange={(e) => patch(i, { code: e.target.value })} InputProps={{ disableUnderline: true }} /></TableCell>
                <TableCell><TextField variant="standard" fullWidth value={r.label} onChange={(e) => patch(i, { label: e.target.value })} InputProps={{ disableUnderline: true }} /></TableCell>
                <TableCell><TextField variant="standard" type="number" value={r.work} onChange={(e) => patch(i, { work: Number(e.target.value) })} inputProps={{ step: 0.5, min: 0, max: 1 }} InputProps={{ disableUnderline: true }} /></TableCell>
                <TableCell><TextField variant="standard" type="number" value={r.worked} onChange={(e) => patch(i, { worked: Number(e.target.value) })} inputProps={{ step: 0.5, min: 0, max: 1 }} InputProps={{ disableUnderline: true }} /></TableCell>
                <TableCell><TextField variant="standard" select value={r.paid ? '1' : '0'} onChange={(e) => patch(i, { paid: e.target.value === '1' })} InputProps={{ disableUnderline: true }}><MenuItem value="1">Có</MenuItem><MenuItem value="0">Không</MenuItem></TextField></TableCell>
                <TableCell><TextField variant="standard" select fullWidth value={r.category} onChange={(e) => patch(i, { category: e.target.value as AttendanceCategory })} InputProps={{ disableUnderline: true }}>{CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: r.color, border: '1px solid #ccc' }} />
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#0d7a6a'} onChange={(e) => patch(i, { color: e.target.value })} style={{ width: 26, height: 22, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
                  </Stack>
                </TableCell>
                <TableCell><IconButton size="small" color="error" onClick={() => remove(i)}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ mt: 1 }}>Thêm mã</Button>
        <Typography variant="caption" color="text.disabled" display="block" mt={1}>{rows.length} mã</Typography>
      </DialogContent>
      <DialogActions>
        <Tooltip title="Khôi phục bộ mã mặc định"><span><Button color="inherit" startIcon={<RestartAltIcon />} onClick={doReset} disabled={busy || !custom}>Về mặc định</Button></span></Tooltip>
        <Box flex={1} />
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="contained" onClick={commit} disabled={busy}>Lưu từ điển</Button>
      </DialogActions>
    </Dialog>
  );
}
