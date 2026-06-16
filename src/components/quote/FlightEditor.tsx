import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { MENU_CUR } from '@/components/menu/constants';
import { deriveAirline, deriveAirport, newFare } from './flightConstants';
import type { FlightFare, QuoteFlight } from '@/types';

type Props = { flight: QuoteFlight; onClose: () => void; onSave: (f: QuoteFlight) => void };

function LegFields({
  date, flightNo, dep, arr, depTime, arrTime, depOff, arrOff, onChange,
}: {
  date: string; flightNo: string; dep: string; arr: string; depTime: string; arrTime: string;
  depOff?: number; arrOff?: number;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const airline = deriveAirline(flightNo).name;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
      <TextField size="small" label="Ngày (DD/MMM)" value={date} placeholder="01JAN" onChange={(e) => onChange({ date: e.target.value.toUpperCase() })} />
      <TextField size="small" label="Số hiệu" value={flightNo} placeholder="VN310" onChange={(e) => onChange({ flightNo: e.target.value.toUpperCase() })} helperText={airline || ' '} />
      <Box />
      <TextField size="small" label="Điểm đi (IATA)" value={dep} placeholder="HAN" onChange={(e) => onChange({ dep: e.target.value.toUpperCase() })} helperText={deriveAirport(dep) || ' '} />
      <TextField size="small" label="Điểm đến (IATA)" value={arr} placeholder="SGN" onChange={(e) => onChange({ arr: e.target.value.toUpperCase() })} helperText={deriveAirport(arr) || ' '} />
      <Box />
      <Stack direction="row" spacing={0.75}>
        <TextField size="small" type="time" label="Giờ đi" value={depTime} fullWidth onChange={(e) => onChange({ depTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="number" label="+ngày" value={depOff ?? 0} sx={{ width: 76 }} onChange={(e) => onChange({ depOff: Math.max(0, +e.target.value) || undefined })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
      </Stack>
      <Stack direction="row" spacing={0.75}>
        <TextField size="small" type="time" label="Giờ đến" value={arrTime} fullWidth onChange={(e) => onChange({ arrTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="number" label="+ngày" value={arrOff ?? 0} sx={{ width: 76 }} onChange={(e) => onChange({ arrOff: Math.max(0, +e.target.value) || undefined })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
      </Stack>
    </Box>
  );
}

export function FlightEditor({ flight, onClose, onSave }: Props) {
  const [f, setF] = useState<QuoteFlight>(() => ({ ...flight, fares: (flight.fares ?? []).map((x) => ({ ...x })) }));
  const set = (patch: Partial<QuoteFlight>) => setF((prev) => ({ ...prev, ...patch }));
  const updFare = (id: string, patch: Partial<FlightFare>) => setF((prev) => ({ ...prev, fares: prev.fares.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  // Lấy chiều về = đảo điểm đi/đến của chiều đi (giữ giờ/ngày để sửa).
  const fillReturn = () => set({ retDepAirport: f.arrAirport, retArrAirport: f.depAirport });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Chuyến bay khứ hồi</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="caption" fontWeight={800} color="#0d7a6a" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>🛫 Chiều đi</Typography>
          <LegFields date={f.date} flightNo={f.flightNo} dep={f.depAirport} arr={f.arrAirport} depTime={f.depTime} arrTime={f.arrTime} depOff={f.depDayOffset} arrOff={f.arrDayOffset}
            onChange={(p) => set({ date: p.date as string ?? f.date, flightNo: p.flightNo as string ?? f.flightNo, depAirport: p.dep as string ?? f.depAirport, arrAirport: p.arr as string ?? f.arrAirport, depTime: p.depTime as string ?? f.depTime, arrTime: p.arrTime as string ?? f.arrTime, depDayOffset: 'depOff' in p ? (p.depOff as number | undefined) : f.depDayOffset, arrDayOffset: 'arrOff' in p ? (p.arrOff as number | undefined) : f.arrDayOffset })} />

          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" fontWeight={800} color="#b8761e" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>🛬 Chiều về</Typography>
            <Button size="small" startIcon={<SwapHorizIcon />} onClick={fillReturn}>Đảo điểm đi/đến</Button>
          </Stack>
          <LegFields date={f.retDate ?? ''} flightNo={f.retFlightNo ?? ''} dep={f.retDepAirport ?? ''} arr={f.retArrAirport ?? ''} depTime={f.retDepTime ?? ''} arrTime={f.retArrTime ?? ''} depOff={f.retDepDayOffset} arrOff={f.retArrDayOffset}
            onChange={(p) => set({ retDate: p.date as string ?? f.retDate, retFlightNo: p.flightNo as string ?? f.retFlightNo, retDepAirport: p.dep as string ?? f.retDepAirport, retArrAirport: p.arr as string ?? f.retArrAirport, retDepTime: p.depTime as string ?? f.retDepTime, retArrTime: p.arrTime as string ?? f.retArrTime, retDepDayOffset: 'depOff' in p ? (p.depOff as number | undefined) : f.retDepDayOffset, retArrDayOffset: 'arrOff' in p ? (p.arrOff as number | undefined) : f.retArrDayOffset })} />

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

          <TextField size="small" label="Ghi chú" value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button onClick={() => onSave({ ...f, fares: f.fares.filter((x) => x.label.trim() || x.amount > 0) })} variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
