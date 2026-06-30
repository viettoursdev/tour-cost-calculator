import { useMemo, useState } from 'react';
import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { pickFiles } from '@/lib/pickFiles';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { useAttendanceStore, attendanceId } from '@/stores/attendanceStore';
import { summarizeAttendance, periodLabelVN } from '@/lib/attendance/attendanceCalc';
import {
  parseAttendanceExcel, type AttendanceImportResult, type ParsedAttendanceRow,
} from '@/lib/attendance/importAttendanceExcel';
import type { HrAttendance, HrEmployee } from '@/types';

/** Upload file chấm công .xlsx → parse bố cục Viettours → xem trước → ghi (upsert-only). */
export function AttendanceImportDialog({
  employees, onClose, onImported,
}: {
  employees: HrEmployee[];
  onClose: () => void;
  onImported?: (period: string, count: number) => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const upsertMany = useAttendanceStore((s) => s.upsertMany);

  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceImportResult | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const pick = async () => {
    const files = await pickFiles({ accept: '.xlsx' });
    const f = files[0];
    if (!f) return;
    setFileName(f.name);
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await parseAttendanceExcel(f, employees);
      setResult(res);
      if (!res.rows.length) setError('Không đọc được dòng nhân viên nào trong file.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Số mã lạ (không có trong từ điển) toàn file — để cảnh báo HR. */
  const unknownCodes = useMemo(() => {
    if (!result) return [] as string[];
    const set = new Set<string>();
    for (const r of result.rows) summarizeAttendance(r.days).unknownCodes.forEach((c) => set.add(c));
    return [...set].sort();
  }, [result]);

  const matchedRows = useMemo(
    () => (result ? result.rows.filter((r) => r.matchedEmployeeId) : []),
    [result],
  );

  const commit = async () => {
    if (!result || !currentUser || !matchedRows.length) return;
    const now = new Date().toISOString();
    const list: HrAttendance[] = matchedRows.map((r) => {
      const emp = empById.get(r.matchedEmployeeId!);
      return {
        id: attendanceId(r.matchedEmployeeId!, result.period),
        employeeLegacyId: r.matchedEmployeeId!,
        employeeCode: emp?.employeeCode || r.employeeCode,
        fullName: emp?.fullName || r.fullName,
        department: emp?.department || '',
        period: result.period,
        days: r.days,
        summary: summarizeAttendance(r.days),
        status: 'draft',
        confirmation: { status: 'pending' },
        feedback: [],
        source: 'excel',
        createdAt: now,
        createdBy: currentUser.name,
      };
    });
    setBusy(true);
    const ok = await upsertMany(list);
    setBusy(false);
    if (ok) {
      toast(`✅ Đã nhập ${list.length} bảng công ${periodLabelVN(result.period)} (nháp). Hãy kiểm tra rồi Công bố.`, 'success');
      onImported?.(result.period, list.length);
      onClose();
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>📥 Nhập bảng chấm công từ Excel</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={pick} disabled={busy}>
              Chọn file .xlsx
            </Button>
            {fileName && <Typography variant="body2" color="text.secondary">{fileName}</Typography>}
            {busy && <CircularProgress size={18} />}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            File theo mẫu bảng chấm công Viettours (cột <b>MÃ NV</b>, <b>HỌ TÊN</b> + các cột ngày). Hệ thống tự dò
            tháng và khớp nhân viên theo MÃ NV (rồi tới tên).
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip color="primary" label={`Kỳ: ${periodLabelVN(result.period)}`} />
                <Chip variant="outlined" label={`${result.dateColumns.length} ngày`} />
                <Chip color="success" icon={<CheckCircleIcon />} label={`${result.matched} khớp`} />
                {result.unmatched > 0 && (
                  <Chip color="warning" icon={<WarningAmberIcon />} label={`${result.unmatched} không khớp`} />
                )}
              </Stack>

              {result.unmatched > 0 && (
                <Alert severity="warning">
                  {result.unmatched} dòng KHÔNG khớp nhân viên (theo MÃ NV/tên) sẽ <b>bị bỏ qua</b>. Hãy đảm bảo
                  MÃ NV trong file trùng mã hồ sơ nhân sự.
                </Alert>
              )}
              {unknownCodes.length > 0 && (
                <Alert severity="info">
                  Có mã chưa nhận diện trong từ điển: <b>{unknownCodes.join(', ')}</b>. Vẫn nhập được nhưng các mã này
                  không tính công cho tới khi bổ sung từ điển.
                </Alert>
              )}

              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700 } }}>
                      <TableCell>MÃ NV</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell align="center">Khớp</TableCell>
                      <TableCell align="right">Ngày có mã</TableCell>
                      <TableCell align="right">Số công (HC)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.rows.map((r: ParsedAttendanceRow) => {
                      const s = summarizeAttendance(r.days);
                      return (
                        <TableRow key={r.rowIndex} hover sx={{ opacity: r.matchedEmployeeId ? 1 : 0.5 }}>
                          <TableCell>{r.employeeCode || '—'}</TableCell>
                          <TableCell>{r.fullName || '—'}</TableCell>
                          <TableCell align="center">
                            {r.matchedEmployeeId
                              ? <Chip size="small" color="success" label={r.matchedBy === 'code' ? 'mã' : 'tên'} />
                              : <Chip size="small" color="warning" label="không" />}
                          </TableCell>
                          <TableCell align="right">{Object.keys(r.days).length}</TableCell>
                          <TableCell align="right"><b>{s.totalHC}</b></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button
          variant="contained"
          onClick={commit}
          disabled={busy || !matchedRows.length}
        >
          Nhập {matchedRows.length || ''} bảng công (nháp)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
