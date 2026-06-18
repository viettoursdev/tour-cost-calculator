import { useMemo } from 'react';
import {
  Box, Button, Chip, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useQuoteStore } from '@/stores/quoteStore';
import { toast } from '@/stores/toastStore';
import type { Passenger } from '@/types';

const NO_PAX: Passenger[] = [];
let seq = 0;
const newPax = (): Passenger => ({ id: 'p' + Date.now().toString(36) + (seq++).toString(36), name: '' });

const ROOM_TYPES: { v: NonNullable<Passenger['roomType']>; label: string }[] = [
  { v: '', label: '—' }, { v: 'single', label: 'Đơn' }, { v: 'double', label: 'Đôi' },
  { v: 'twin', label: 'Twin' }, { v: 'triple', label: 'Triple' },
];

const cell = { px: 0.5, py: 0.25 };
const Inp = (props: React.ComponentProps<typeof TextField>) => (
  <TextField variant="standard" size="small" InputProps={{ disableUnderline: true }} {...props}
    sx={{ '& input, & .MuiSelect-select': { fontSize: 12.5, py: 0.25 }, ...props.sx }} />
);

export function PassengerView() {
  const pax = useQuoteStore((s) => s.draft.passengers) ?? NO_PAX;
  const info = useQuoteStore((s) => s.draft.info);
  const setPassengers = useQuoteStore((s) => s.setPassengers);

  const upd = (id: string, patch: Partial<Passenger>) => setPassengers(pax.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => setPassengers([...pax, newPax()]);
  const del = (id: string) => setPassengers(pax.filter((p) => p.id !== id));

  const rooming = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const p of pax) if (p.roomType) byType[p.roomType] = (byType[p.roomType] ?? 0) + 1;
    const rooms = new Set(pax.map((p) => p.roomNo?.trim()).filter(Boolean));
    return { byType, rooms: rooms.size };
  }, [pax]);

  const exportPdf = async () => {
    if (!pax.length) { toast('Chưa có khách để xuất.', 'warning'); return; }
    (await import('@/lib/exports/exportManifest')).exportManifestPDF(info, pax);
  };
  const exportXls = async () => {
    if (!pax.length) { toast('Chưa có khách để xuất.', 'warning'); return; }
    await (await import('@/lib/exports/exportManifest')).exportManifestExcel(info, pax);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>👥 Danh sách khách đoàn</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            <Chip size="small" label={`${pax.length} khách`} sx={{ bgcolor: 'rgba(20,150,140,0.15)', color: '#0d7a6a', fontWeight: 700 }} />
            {(['single', 'double', 'twin', 'triple'] as const).map((t) => rooming.byType[t]
              ? <Chip key={t} size="small" variant="outlined" label={`${ROOM_TYPES.find((r) => r.v === t)?.label}: ${rooming.byType[t]} khách`} /> : null)}
            {rooming.rooms > 0 && <Chip size="small" variant="outlined" label={`${rooming.rooms} phòng (theo ghép)`} sx={{ color: 'text.secondary' }} />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => void exportPdf()}>PDF</Button>
          <Button size="small" variant="outlined" startIcon={<TableChartIcon />} onClick={() => void exportXls()}>Excel</Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={add} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Thêm khách</Button>
        </Stack>
      </Stack>

      {pax.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có khách. Bấm “Thêm khách” để lập danh sách đoàn (manifest + rooming) — lưu cùng báo giá.
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1100, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)', ...cell } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)', fontSize: 12 } }}>
                <TableCell sx={{ width: 28 }}>#</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Họ và tên</TableCell>
                <TableCell sx={{ width: 70 }}>Giới tính</TableCell>
                <TableCell sx={{ width: 100 }}>Ngày sinh</TableCell>
                <TableCell sx={{ width: 90 }}>Loại GT</TableCell>
                <TableCell sx={{ minWidth: 130 }}>Số HC/CCCD</TableCell>
                <TableCell sx={{ width: 100 }}>Quốc tịch</TableCell>
                <TableCell sx={{ width: 90 }}>Phòng</TableCell>
                <TableCell sx={{ width: 70 }}>Ghép</TableCell>
                <TableCell sx={{ minWidth: 130 }}>Ăn kiêng/Dị ứng</TableCell>
                <TableCell sx={{ width: 110 }}>Điện thoại</TableCell>
                <TableCell sx={{ minWidth: 130 }}>Liên hệ khẩn</TableCell>
                <TableCell sx={{ width: 36 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {pax.map((p, i) => (
                <TableRow key={p.id} hover>
                  <TableCell><Typography variant="caption" fontWeight={700}>{i + 1}</Typography></TableCell>
                  <TableCell><Inp fullWidth value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} placeholder="Nguyễn Văn A" /></TableCell>
                  <TableCell><Inp select fullWidth value={p.gender ?? ''} onChange={(e) => upd(p.id, { gender: e.target.value as Passenger['gender'] })}>
                    <MenuItem value="">—</MenuItem><MenuItem value="M">Nam</MenuItem><MenuItem value="F">Nữ</MenuItem></Inp></TableCell>
                  <TableCell><Inp fullWidth value={p.dob ?? ''} onChange={(e) => upd(p.id, { dob: e.target.value })} placeholder="01/01/1990" /></TableCell>
                  <TableCell><Inp select fullWidth value={p.idType ?? ''} onChange={(e) => upd(p.id, { idType: e.target.value as Passenger['idType'] })}>
                    <MenuItem value="">—</MenuItem><MenuItem value="passport">Hộ chiếu</MenuItem><MenuItem value="cccd">CCCD</MenuItem></Inp></TableCell>
                  <TableCell><Inp fullWidth value={p.idNo ?? ''} onChange={(e) => upd(p.id, { idNo: e.target.value })} /></TableCell>
                  <TableCell><Inp fullWidth value={p.nationality ?? ''} onChange={(e) => upd(p.id, { nationality: e.target.value })} placeholder="Việt Nam" /></TableCell>
                  <TableCell><Inp select fullWidth value={p.roomType ?? ''} onChange={(e) => upd(p.id, { roomType: e.target.value as Passenger['roomType'] })}>
                    {ROOM_TYPES.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}</Inp></TableCell>
                  <TableCell><Inp fullWidth value={p.roomNo ?? ''} onChange={(e) => upd(p.id, { roomNo: e.target.value })} placeholder="P1" /></TableCell>
                  <TableCell><Inp fullWidth value={p.dietary ?? ''} onChange={(e) => upd(p.id, { dietary: e.target.value })} placeholder="Chay / dị ứng…" /></TableCell>
                  <TableCell><Inp fullWidth value={p.phone ?? ''} onChange={(e) => upd(p.id, { phone: e.target.value })} /></TableCell>
                  <TableCell><Inp fullWidth value={p.emergency ?? ''} onChange={(e) => upd(p.id, { emergency: e.target.value })} placeholder="Tên + SĐT" /></TableCell>
                  <TableCell><Tooltip title="Xoá khách"><IconButton size="small" color="error" onClick={() => del(p.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
