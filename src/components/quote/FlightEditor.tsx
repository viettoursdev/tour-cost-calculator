import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { MENU_CUR } from '@/components/menu/constants';
import { deriveAirline, deriveAirport, newFare, newSegment } from './flightConstants';
import type { FlightFare, FlightSegment, QuoteFlight } from '@/types';

type Props = { flight: QuoteFlight; onClose: () => void; onSave: (f: QuoteFlight) => void };

function SegmentFields({
  date, flightNo, dep, arr, depTime, arrTime, depOff, arrOff, onChange,
}: {
  date: string; flightNo: string; dep: string; arr: string; depTime: string; arrTime: string;
  depOff?: number; arrOff?: number;
  onChange: (patch: Partial<FlightSegment>) => void;
}) {
  const airline = deriveAirline(flightNo).name;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
      <TextField size="small" label="Ngày (DDMMM)" value={date} placeholder="20NOV" onChange={(e) => onChange({ date: e.target.value.toUpperCase() })} />
      <TextField size="small" label="Số hiệu" value={flightNo} placeholder="QR977" onChange={(e) => onChange({ flightNo: e.target.value.toUpperCase() })} helperText={airline || ' '} />
      <Box />
      <TextField size="small" label="Điểm đi (IATA)" value={dep} placeholder="HAN" onChange={(e) => onChange({ depAirport: e.target.value.toUpperCase() })} helperText={deriveAirport(dep) || ' '} />
      <TextField size="small" label="Điểm đến (IATA)" value={arr} placeholder="DOH" onChange={(e) => onChange({ arrAirport: e.target.value.toUpperCase() })} helperText={deriveAirport(arr) || ' '} />
      <Box />
      <Stack direction="row" spacing={0.75}>
        <TextField size="small" type="time" label="Giờ đi" value={depTime} fullWidth onChange={(e) => onChange({ depTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="number" label="+ngày" value={depOff ?? 0} sx={{ width: 76 }} onChange={(e) => onChange({ depDayOffset: Math.max(0, +e.target.value) || undefined })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
      </Stack>
      <Stack direction="row" spacing={0.75}>
        <TextField size="small" type="time" label="Giờ đến" value={arrTime} fullWidth onChange={(e) => onChange({ arrTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="number" label="+ngày" value={arrOff ?? 0} sx={{ width: 76 }} onChange={(e) => onChange({ arrDayOffset: Math.max(0, +e.target.value) || undefined })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
      </Stack>
    </Box>
  );
}

export function FlightEditor({ flight, onClose, onSave }: Props) {
  const [f, setF] = useState<QuoteFlight>(() => ({
    ...flight,
    segments: (flight.segments ?? []).map((s) => ({ ...s })),
    fares: (flight.fares ?? []).map((x) => ({ ...x })),
  }));
  const segs = f.segments.length ? f.segments : [newSegment()];

  const updSeg = (i: number, patch: Partial<FlightSegment>) =>
    setF((prev) => ({ ...prev, segments: prev.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const delSeg = (i: number) =>
    setF((prev) => ({ ...prev, segments: prev.segments.filter((_, j) => j !== i) }));
  const addSeg = () => setF((prev) => {
    const last = prev.segments[prev.segments.length - 1];
    // Chặng mới nối tiếp: điểm đi = điểm đến chặng trước (sửa được).
    return { ...prev, segments: [...prev.segments, newSegment({ depAirport: last?.arrAirport ?? '', date: last?.date ?? '' })] };
  });
  const updFare = (id: string, patch: Partial<FlightFare>) =>
    setF((prev) => ({ ...prev, fares: prev.fares.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Booking chuyến bay · {segs.length} chặng</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {segs.map((s, i) => (
            <Box key={i} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'rgba(20,150,140,0.03)' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Chip size="small" icon={<FlightTakeoffIcon sx={{ fontSize: 16 }} />} label={`Chặng ${i + 1}`} sx={{ fontWeight: 800, bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a' }} />
                <Box sx={{ flex: 1 }} />
                {segs.length > 1 && (
                  <IconButton size="small" color="error" onClick={() => delSeg(i)} aria-label={`Xoá chặng ${i + 1}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
                )}
              </Stack>
              <SegmentFields
                date={s.date} flightNo={s.flightNo} dep={s.depAirport} arr={s.arrAirport}
                depTime={s.depTime} arrTime={s.arrTime} depOff={s.depDayOffset} arrOff={s.arrDayOffset}
                onChange={(patch) => updSeg(i, patch)}
              />
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={addSeg} sx={{ alignSelf: 'flex-start', color: '#0d7a6a' }}>Thêm chặng</Button>

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Hạng giá tạm tính (đa tiền tệ)</Typography>
            <Stack spacing={1} sx={{ mt: 0.75 }}>
              {f.fares.map((fr) => (
                <Box key={fr.id} sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.9fr 32px', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" placeholder="Hạng (vd Phổ thông)" value={fr.label} onChange={(e) => updFare(fr.id, { label: e.target.value })} />
                  <TextField size="small" type="number" placeholder="Giá tạm tính" value={fr.amount || ''} onChange={(e) => updFare(fr.id, { amount: +e.target.value })} slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }} />
                  <TextField select size="small" value={fr.cur} onChange={(e) => updFare(fr.id, { cur: e.target.value })}>
                    {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
                  <IconButton size="small" color="error" onClick={() => setF((prev) => ({ ...prev, fares: prev.fares.filter((x) => x.id !== fr.id) }))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setF((prev) => ({ ...prev, fares: [...prev.fares, newFare({ label: '' })] }))} sx={{ mt: 0.5, color: '#0d7a6a' }}>Thêm hạng giá</Button>
          </Box>

          <TextField size="small" label="Ghi chú" value={f.note ?? ''} onChange={(e) => setF((prev) => ({ ...prev, note: e.target.value }))} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button onClick={() => onSave({ ...f, segments: segs, fares: f.fares.filter((x) => x.label.trim() || x.amount > 0) })} variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
