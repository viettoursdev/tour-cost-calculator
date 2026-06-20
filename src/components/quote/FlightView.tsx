import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { AiButton } from '@/components/common/AiButton';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ImageIcon from '@mui/icons-material/Image';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { useQuoteStore } from '@/stores/quoteStore';
import { parseFlights } from '@/lib/flightParse';
import { deriveAirline, deriveAirport, migrateFlight, newFlight } from './flightConstants';
import { FlightEditor } from './FlightEditor';
import type { FlightFare, FlightSegment, QuoteFlight } from '@/types';

const fileToB64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
  r.onerror = reject;
  r.readAsDataURL(file);
});

const NO_FLIGHTS: QuoteFlight[] = [];
const airName = (no: string, override?: string) => override || deriveAirline(no).name;
const airCode = (no: string) => deriveAirline(no).code;
const fmtFare = (fr: FlightFare) => `${Math.round(fr.amount || 0).toLocaleString('vi-VN')} ${fr.cur}`;
const off = (n?: number) => ((n ?? 0) > 0 ? `+${n}` : '');

/** Tuyến rút gọn của booking: HAN→DOH→EDI…→HAN. */
const routeOf = (segs: FlightSegment[]) => {
  if (!segs.length) return '—';
  return [segs[0].depAirport || '?', ...segs.map((s) => s.arrAirport || '?')].join('→');
};
/** Tập hãng (tên) khác nhau trong booking. */
const airlinesOf = (segs: FlightSegment[]) =>
  [...new Set(segs.map((s) => airName(s.flightNo, s.airlineName)).filter(Boolean))];

/** Một dòng hiển thị 1 chặng bay. */
function SegRow({ idx, s }: { idx: number; s: FlightSegment }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" sx={{ width: 58, color: 'text.secondary', fontWeight: 700 }}>Chặng {idx + 1}</Typography>
      {s.date && <Chip size="small" variant="outlined" label={s.date} sx={{ height: 20 }} />}
      {s.flightNo && <Typography fontWeight={800} fontSize={13.5}>{s.flightNo}</Typography>}
      {airName(s.flightNo, s.airlineName) && <Typography variant="caption" color="text.secondary">· {airName(s.flightNo, s.airlineName)}</Typography>}
      <Typography fontSize={13.5}>
        <b>{s.depAirport}</b>{deriveAirport(s.depAirport) ? ` (${deriveAirport(s.depAirport)})` : ''} {s.depTime}{off(s.depDayOffset)}
        {'  →  '}
        <b>{s.arrAirport}</b>{deriveAirport(s.arrAirport) ? ` (${deriveAirport(s.arrAirport)})` : ''} {s.arrTime}{off(s.arrDayOffset)}
      </Typography>
    </Stack>
  );
}

export function FlightView() {
  const rawFlights = useQuoteStore((s) => s.draft.flights) ?? NO_FLIGHTS;
  const setFlights = useQuoteStore((s) => s.setFlights);
  const addItem = useQuoteStore((s) => s.addItem);
  const setView = useQuoteStore((s) => s.setView);

  // Chuẩn hoá dữ liệu cũ (phẳng/khứ hồi) → segments khi đọc.
  const flights = useMemo(() => rawFlights.map(migrateFlight), [rawFlights]);

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

  const depAirports = useMemo(() => [...new Set(flights.map((f) => f.segments[0]?.depAirport).filter(Boolean))].sort(), [flights]);
  const airlineCodes = useMemo(() => [...new Set(flights.flatMap((f) => f.segments.map((s) => airCode(s.flightNo))).filter(Boolean))].sort(), [flights]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flights.filter((f) => {
      if (filterDep && f.segments[0]?.depAirport !== filterDep) return false;
      if (filterAir && !f.segments.some((s) => airCode(s.flightNo) === filterAir)) return false;
      if (q) {
        const hay = f.segments.flatMap((s) => [s.date, s.flightNo, airName(s.flightNo, s.airlineName), s.depAirport, s.arrAirport, deriveAirport(s.depAirport), deriveAirport(s.arrAirport)]).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [flights, search, filterDep, filterAir]);

  const linkToQuote = (f: QuoteFlight, fare?: FlightFare) => {
    const segs = f.segments;
    const first = segs[0]; const last = segs[segs.length - 1];
    addItem('flight', {
      name: `${first?.flightNo ?? ''} ${routeOf(segs)}${segs.length > 1 ? ` (${segs.length} chặng)` : ''}${first?.date ? ` ${first.date}` : ''}`.trim(),
      cur: fare?.cur ?? 'VND', price: fare?.amount ?? 0, qtyMode: 'per_pax', unit: '/người',
      note: [airlinesOf(segs).join(', '), first ? `Đi ${first.date} ${first.depTime}` : '', last ? `Đến ${last.arrAirport} ${last.arrTime}` : ''].filter(Boolean).join(' · '),
    });
    if (window.confirm(`✅ Đã thêm "${first?.flightNo ?? 'chuyến bay'}" vào bảng báo giá (Vé máy bay). Mở tab Bảng báo giá?`)) setView('cost');
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
          {airlineCodes.map((a) => <MenuItem key={a} value={a}>{a} — {deriveAirline(a + '0').name || a}</MenuItem>)}
        </Select>
        <Box sx={{ flex: 1 }} />
        <AiButton onClick={() => { setAiErr(''); setAiOpen(true); }}>Phân tích AI</AiButton>
        <Button variant="contained" startIcon={<AddIcon />} onClick={add} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Thêm chuyến bay</Button>
      </Stack>

      {flights.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có chuyến bay. Bấm “Thêm chuyến bay” hoặc “Phân tích AI” — mỗi booking có thể gồm 1, 2 hay nhiều chặng.
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {visible.map((f) => {
            const segs = f.segments;
            return (
              <Paper key={f.id} variant="outlined" sx={{ p: 1.75, borderLeft: '4px solid #0d7a6a' }}>
                <Stack direction="row" alignItems="flex-start" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <Box sx={{ flex: 1, minWidth: 280 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={flights.indexOf(f) + 1} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(20,150,140,0.15)', color: '#0d7a6a' }} />
                      <Typography fontWeight={800} fontSize={14}>{routeOf(segs)}</Typography>
                      <Chip size="small" variant="outlined" label={`${segs.length} chặng`} sx={{ height: 20 }} />
                      {airlinesOf(segs).map((a) => <Chip key={a} size="small" label={a} sx={{ height: 20, bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a', fontWeight: 700 }} />)}
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title="Hạng giá / xem & sửa chi tiết"><Button size="small" onClick={() => setEditing(f)} sx={{ color: '#0d7a6a' }}>
                        {(f.fares?.length ?? 0) > 0 ? `${f.fares.length} hạng · ${fmtFare(f.fares[0])}` : 'Thêm giá'}
                      </Button></Tooltip>
                    </Stack>
                    <Stack spacing={0.5}>
                      {segs.map((s, i) => <SegRow key={i} idx={i} s={s} />)}
                    </Stack>
                    {f.note && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>📝 {f.note}</Typography>}
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Thêm vào bảng báo giá"><IconButton size="small" sx={{ color: '#0d7a6a' }} onClick={(e) => onClickLink(e.currentTarget, f)}><AddShoppingCartIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Sửa"><IconButton size="small" color="primary" onClick={() => setEditing(f)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Xoá"><IconButton size="small" color="error" onClick={() => del(f.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
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
            Dán code/booking hoặc tải ảnh. AI tự nhận diện số chặng (1, 2 hay nhiều chặng) và điền sẵn vào form để bạn duyệt rồi Lưu.
          </Typography>
          <TextField fullWidth multiline minRows={5} value={aiText} onChange={(e) => setAiText(e.target.value)} disabled={aiBusy}
            placeholder={'VD (booking 4 chặng):\n1  QR 977 N 20NOV 5 HANDOH HK1  1910 2310\n2  QR 031 N 21NOV 6 DOHEDI HK1  0120 0600\n3  QR 008 N 26NOV 4 LHRDOH HK1  1455 0035+1\n4  QR 976 N 27NOV 5 DOHHAN HK1  0150 1220'} />
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
          onSave={(f) => { setFlights([...(useQuoteStore.getState().draft.flights ?? []).map(migrateFlight), f]); setQueue((q) => q.slice(1)); }} />
      )}
      {editing && <FlightEditor flight={editing} onClose={() => setEditing(null)} onSave={saveOne} />}
    </Box>
  );
}
