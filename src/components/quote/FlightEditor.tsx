import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { MENU_CUR } from '@/components/menu/constants';
import { deriveAirline, deriveAirport, newFare } from './flightConstants';
import type { FlightFare, QuoteFlight } from '@/types';

type Props = { flight: QuoteFlight; onClose: () => void; onSave: (f: QuoteFlight) => void };

export function FlightEditor({ flight, onClose, onSave }: Props) {
  const [f, setF] = useState<QuoteFlight>(() => ({ ...flight, fares: (flight.fares ?? []).map((x) => ({ ...x })) }));

  const set = (patch: Partial<QuoteFlight>) => setF((prev) => ({ ...prev, ...patch }));
  const updFare = (id: string, patch: Partial<FlightFare>) => setF((prev) => ({ ...prev, fares: prev.fares.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addFare = () => setF((prev) => ({ ...prev, fares: [...prev.fares, newFare({ label: '' })] }));
  const delFare = (id: string) => setF((prev) => ({ ...prev, fares: prev.fares.filter((x) => x.id !== id) }));

  const airline = f.airlineName || deriveAirline(f.flightNo).name;
  const depCity = f.depCity || deriveAirport(f.depAirport);
  const arrCity = f.arrCity || deriveAirport(f.arrAirport);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Chi tiết chuyến bay</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
            <TextField size="small" label="Ngày (DD/MMM)" value={f.date} placeholder="01JAN"
              onChange={(e) => set({ date: e.target.value.toUpperCase() })} />
            <TextField size="small" label="Số hiệu" value={f.flightNo} placeholder="VN310"
              onChange={(e) => set({ flightNo: e.target.value.toUpperCase() })}
              helperText={airline || ' '} />
            <Box />
            <TextField size="small" label="Điểm đi (IATA)" value={f.depAirport} placeholder="HAN"
              onChange={(e) => set({ depAirport: e.target.value.toUpperCase() })} helperText={depCity || ' '} />
            <TextField size="small" label="Điểm đến (IATA)" value={f.arrAirport} placeholder="SGN"
              onChange={(e) => set({ arrAirport: e.target.value.toUpperCase() })} helperText={arrCity || ' '} />
            <Box />
            <Stack direction="row" spacing={0.75}>
              <TextField size="small" type="time" label="Giờ đi" value={f.depTime} fullWidth
                onChange={(e) => set({ depTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="number" label="+ngày" value={f.depDayOffset ?? 0} sx={{ width: 76 }}
                onChange={(e) => set({ depDayOffset: Math.max(0, +e.target.value) || undefined })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
            </Stack>
            <Stack direction="row" spacing={0.75}>
              <TextField size="small" type="time" label="Giờ đến" value={f.arrTime} fullWidth
                onChange={(e) => set({ arrTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="number" label="+ngày" value={f.arrDayOffset ?? 0} sx={{ width: 76 }}
                onChange={(e) => set({ arrDayOffset: Math.max(0, +e.target.value) || undefined })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, max: 3 } }} />
            </Stack>
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Hạng giá tạm tính (đa tiền tệ)
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.75 }}>
              {f.fares.map((fr) => (
                <Box key={fr.id} sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.9fr 32px', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" placeholder="Hạng (vd Phổ thông)" value={fr.label} onChange={(e) => updFare(fr.id, { label: e.target.value })} />
                  <TextField size="small" type="number" placeholder="Giá tạm tính" value={fr.amount || ''} onChange={(e) => updFare(fr.id, { amount: +e.target.value })}
                    slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }} />
                  <TextField select size="small" value={fr.cur} onChange={(e) => updFare(fr.id, { cur: e.target.value })}>
                    {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
                  <IconButton size="small" color="error" onClick={() => delFare(fr.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={addFare} sx={{ mt: 0.5, color: '#0d7a6a' }}>Thêm hạng giá</Button>
          </Box>

          <TextField size="small" label="Ghi chú" value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button onClick={() => onSave({ ...f, fares: f.fares.filter((x) => x.label.trim() || x.amount > 0) })}
          variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Lưu
        </Button>
      </DialogActions>
    </Dialog>
  );
}
