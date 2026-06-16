import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ImageIcon from '@mui/icons-material/Image';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { useQuoteStore } from '@/stores/quoteStore';
import { parseFlights } from '@/lib/flightParse';
import { deriveAirline, deriveAirport, newFlight } from './flightConstants';
import { FlightEditor } from './FlightEditor';
import type { FlightFare, QuoteFlight } from '@/types';

const fileToB64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
  r.onerror = reject;
  r.readAsDataURL(file);
});

const NO_FLIGHTS: QuoteFlight[] = [];
const airName = (no: string, override?: string) => override || deriveAirline(no).name;
const airCode = (no: string, override?: string) => override || deriveAirline(no).code;
const fmtFare = (fr: FlightFare) => `${Math.round(fr.amount || 0).toLocaleString('vi-VN')} ${fr.cur}`;
const off = (n?: number) => ((n ?? 0) > 0 ? `+${n}` : '');

/** Dòng hiển thị 1 chiều bay. */
function Leg({ icon, label, date, no, dep, arr, depTime, arrTime, depOff, arrOff }: {
  icon: string; label: string; date?: string; no?: string; dep?: string; arr?: string;
  depTime?: string; arrTime?: string; depOff?: number; arrOff?: number;
}) {
  if (!no && !dep && !arr) return <Typography variant="caption" color="text.disabled">{icon} {label}: — chưa nhập —</Typography>;
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" sx={{ width: 64, color: 'text.secondary', fontWeight: 700 }}>{icon} {label}</Typography>
      {date && <Chip size="small" variant="outlined" label={date} sx={{ height: 20 }} />}
      {no && <Typography fontWeight={800} fontSize={13.5}>{no}</Typography>}
      {airName(no ?? '') && <Typography variant="caption" color="text.secondary">· {airName(no ?? '')}</Typography>}
      <Typography fontSize={13.5}>
        <b>{dep}</b>{deriveAirport(dep ?? '') ? ` (${deriveAirport(dep ?? '')})` : ''} {depTime}{off(depOff)}
        {'  →  '}
        <b>{arr}</b>{deriveAirport(arr ?? '') ? ` (${deriveAirport(arr ?? '')})` : ''} {arrTime}{off(arrOff)}
      </Typography>
    </Stack>
  );
}

export function FlightView() {
  const flights = useQuoteStore((s) => s.draft.flights) ?? NO_FLIGHTS;
  const setFlights = useQuoteStore((s) => s.setFlights);
  const addItem = useQuoteStore((s) => s.addItem);
  const setView = useQuoteStore((s) => s.setView);

  const [search, setSearch] = useState('');
  const [filterDep, setFilterDep] = useState('');
  const [filterAir, setFilterAir] = useState('');
  const [editing, setEditing] = useState<QuoteFlight | null>(null);
  const [payPicker, setPayPicker] = useState<{ el: HTMLElement; flight: QuoteFlight } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [queue, setQueue] = useState<QuoteFlight[]>([]);

  const del = (id: string) => setFlights(flights.filter((f) => f.id !== id));
  const add = () => { const f = newFlight(); setFlights([...flights, f]); setEditing(f); };
  const saveOne = (f: QuoteFlight) => { setFlights(flights.map((x) => (x.id === f.id ? f : x))); setEditing(null); };

  const depAirports = useMemo(() => [...new Set(flights.map((f) => f.depAirport).filter(Boolean))].sort(), [flights]);
  const airlines = useMemo(() => [...new Set(flights.map((f) => airCode(f.flightNo)).filter(Boolean))].sort(), [flights]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flights.filter((f) => {
      if (filterDep && f.depAirport !== filterDep) return false;
      if (filterAir && airCode(f.flightNo) !== filterAir) return false;
      if (q) {
        const hay = [f.date, f.flightNo, f.retFlightNo, airName(f.flightNo), f.depAirport, f.arrAirport,
          f.retDepAirport, f.retArrAirport, deriveAirport(f.depAirport), deriveAirport(f.arrAirport)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [flights, search, filterDep, filterAir]);

  const linkToQuote = (f: QuoteFlight, fare?: FlightFare) => {
    const air = airName(f.flightNo, f.airlineName);
    const roundtrip = !!(f.retFlightNo || f.retDepAirport);
    addItem('flight', {
      name: `${f.flightNo} ${f.depAirport}${roundtrip ? '⇄' : '→'}${f.arrAirport}${f.date ? ` ${f.date}` : ''}${roundtrip ? ' (khứ hồi)' : ''}`.trim(),
      cur: fare?.cur ?? 'VND', price: fare?.amount ?? 0, qtyMode: 'per_pax', unit: '/người',
      note: [air, (f.depTime || f.arrTime) ? `Đi ${f.depTime}-${f.arrTime}` : '', f.retDepTime ? `Về ${f.retDepTime}-${f.retArrTime}` : ''].filter(Boolean).join(' · '),
    });
    if (window.confirm(`✅ Đã thêm "${f.flightNo}" vào bảng báo giá (Vé máy bay). Mở tab Bảng báo giá?`)) setView('cost');
  };
  const onClickLink = (el: HTMLElement, f: QuoteFlight) => {
    const fares = f.fares ?? [];
    if (fares.length > 1) setPayPicker({ el, flight: f }); else linkToQuote(f, fares[0]);
  };

  const runParse = async (payload: { text?: string; imageB64?: string }) => {
    setAiBusy(true); setAiErr('');
    try {
      const parsed = await parseFlights(payload);
      if (!parsed.length) { setAiErr('Không nhận diện được chuyến bay nào. Thử ảnh rõ hơn hoặc nhập tay.'); return; }
      setAiOpen(false); setAiText('');
      setQueue(parsed);
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  };
  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    void runParse({ imageB64: await fileToB64(file), text: aiText.trim() || undefined });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1050, mx: 'auto' }}>
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm số hiệu, hãng, sân bay…" sx={{ maxWidth: 260, flex: 1 }} />
        <Select size="small" displayEmpty value={filterDep} onChange={(e) => setFilterDep(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">Mọi điểm đi</MenuItem>
          {depAirports.map((a) => <MenuItem key={a} value={a}>{a} — {deriveAirport(a) || a}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={filterAir} onChange={(e) => setFilterAir(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">Mọi hãng</MenuItem>
          {airlines.map((a) => <MenuItem key={a} value={a}>{a} — {deriveAirline(a + '0').name || a}</MenuItem>)}
        </Select>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => { setAiErr(''); setAiOpen(true); }} sx={{ fontWeight: 700, borderColor: 'rgba(20,150,140,0.5)', color: '#0d7a6a' }}>Phân tích AI</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={add} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Thêm chuyến bay</Button>
      </Stack>

      {flights.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có chuyến bay. Bấm “Thêm chuyến bay” — mỗi chuyến là 1 khứ hồi (chiều đi + chiều về).
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {visible.map((f, idx) => (
            <Paper key={f.id} variant="outlined" sx={{ p: 1.75, borderLeft: '4px solid #0d7a6a' }}>
              <Stack direction="row" alignItems="flex-start" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Box sx={{ flex: 1, minWidth: 280 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={flights.indexOf(f) + 1} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(20,150,140,0.15)', color: '#0d7a6a' }} />
                    {airName(f.flightNo, f.airlineName) && <Chip size="small" label={airName(f.flightNo, f.airlineName)} sx={{ bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a', fontWeight: 700 }} />}
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Hạng giá / xem & sửa chi tiết"><Button size="small" onClick={() => setEditing(f)} sx={{ color: '#0d7a6a' }}>
                      {(f.fares?.length ?? 0) > 0 ? `${f.fares.length} hạng · ${fmtFare(f.fares[0])}` : 'Thêm giá'}
                    </Button></Tooltip>
                  </Stack>
                  <Stack spacing={0.5}>
                    <Leg icon="🛫" label="Chiều đi" date={f.date} no={f.flightNo} dep={f.depAirport} arr={f.arrAirport} depTime={f.depTime} arrTime={f.arrTime} depOff={f.depDayOffset} arrOff={f.arrDayOffset} />
                    <Leg icon="🛬" label="Chiều về" date={f.retDate} no={f.retFlightNo} dep={f.retDepAirport} arr={f.retArrAirport} depTime={f.retDepTime} arrTime={f.retArrTime} depOff={f.retDepDayOffset} arrOff={f.retArrDayOffset} />
                  </Stack>
                  {f.note && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>📝 {f.note}</Typography>}
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Thêm vào bảng báo giá"><IconButton size="small" sx={{ color: '#0d7a6a' }} onClick={(e) => onClickLink(e.currentTarget, f)}><AddShoppingCartIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Sửa"><IconButton size="small" color="primary" onClick={() => setEditing(f)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Xoá"><IconButton size="small" color="error" onClick={() => del(f.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
              </Stack>
              {idx < 0 && null}
            </Paper>
          ))}
        </Stack>
      )}

      <Menu anchorEl={payPicker?.el} open={!!payPicker} onClose={() => setPayPicker(null)}>
        <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'text.secondary' }}>Chọn hạng giá đưa vào báo giá:</Typography>
        {(payPicker?.flight.fares ?? []).map((fr) => (
          <MenuItem key={fr.id} onClick={() => { const f = payPicker!.flight; setPayPicker(null); linkToQuote(f, fr); }}>
            {fr.label || '(hạng)'} — <b style={{ marginLeft: 4, color: '#0d7a6a' }}>{fmtFare(fr)}</b>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={aiOpen} onClose={() => !aiBusy && setAiOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>✨ Phân tích chuyến bay bằng AI</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Dán code/booking hoặc tải ảnh (kể cả khứ hồi). AI điền sẵn vào form khứ hồi để bạn duyệt rồi Lưu.
          </Typography>
          <TextField fullWidth multiline minRows={4} value={aiText} onChange={(e) => setAiText(e.target.value)} disabled={aiBusy}
            placeholder={'VD:\nVN310 01JAN HAN SGN 0800 1010\nVN317 05JAN SGN HAN 1830 2040'} />
          {aiErr && <Alert severity="error" sx={{ mt: 1.5 }}>{aiErr}</Alert>}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button component="label" variant="outlined" startIcon={<ImageIcon />} disabled={aiBusy}>Tải ảnh<input type="file" hidden accept="image/*" onChange={onPickImage} /></Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setAiOpen(false)} color="inherit" disabled={aiBusy}>Huỷ</Button>
          <Button variant="contained" disabled={aiBusy || !aiText.trim()} onClick={() => void runParse({ text: aiText.trim() })} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>{aiBusy ? 'Đang phân tích…' : 'Phân tích'}</Button>
        </DialogActions>
      </Dialog>

      {queue.length > 0 && (
        <FlightEditor key={queue[0].id} flight={queue[0]} onClose={() => setQueue((q) => q.slice(1))}
          onSave={(f) => { setFlights([...useQuoteStore.getState().draft.flights ?? [], f]); setQueue((q) => q.slice(1)); }} />
      )}
      {editing && <FlightEditor flight={editing} onClose={() => setEditing(null)} onSave={saveOne} />}
    </Box>
  );
}
