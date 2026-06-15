import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/Image';
import SellIcon from '@mui/icons-material/Sell';
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

const airlineName = (f: QuoteFlight) => f.airlineName || deriveAirline(f.flightNo).name;
const airlineCode = (f: QuoteFlight) => f.airlineCode || deriveAirline(f.flightNo).code;
const cityOf = (code: string, override?: string) => override || deriveAirport(code);
const fmtFare = (fr: FlightFare) => `${Math.round(fr.amount || 0).toLocaleString('vi-VN')} ${fr.cur}`;

const cellInput = { '& .MuiInputBase-input': { fontSize: 13, py: 0.5 } } as const;
const NO_FLIGHTS: QuoteFlight[] = [];

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
  const [queue, setQueue] = useState<QuoteFlight[]>([]); // chuyến bay AI parse, duyệt tuần tự

  const runParse = async (payload: { text?: string; imageB64?: string }) => {
    setAiBusy(true); setAiErr('');
    try {
      const parsed = await parseFlights(payload);
      if (!parsed.length) { setAiErr('Không nhận diện được chuyến bay nào. Hãy thử ảnh rõ hơn hoặc nhập tay.'); return; }
      setAiOpen(false); setAiText('');
      setQueue(parsed); // mở FlightEditor lần lượt để duyệt rồi Lưu
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };
  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const imageB64 = await fileToB64(file);
    void runParse({ imageB64, text: aiText.trim() || undefined });
  };

  const upd = (id: string, patch: Partial<QuoteFlight>) => setFlights(flights.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const del = (id: string) => setFlights(flights.filter((f) => f.id !== id));
  const add = () => setFlights([...flights, newFlight()]);

  const depAirports = useMemo(() => [...new Set(flights.map((f) => f.depAirport).filter(Boolean))].sort(), [flights]);
  const airlines = useMemo(() => [...new Set(flights.map((f) => airlineCode(f)).filter(Boolean))].sort(), [flights]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flights.filter((f) => {
      if (filterDep && f.depAirport !== filterDep) return false;
      if (filterAir && airlineCode(f) !== filterAir) return false;
      if (q) {
        const hay = [f.date, f.flightNo, airlineName(f), f.depAirport, f.arrAirport,
          cityOf(f.depAirport), cityOf(f.arrAirport)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [flights, search, filterDep, filterAir]);

  const linkToQuote = (f: QuoteFlight, fare?: FlightFare) => {
    const air = airlineName(f);
    addItem('flight', {
      name: `${f.flightNo} ${f.depAirport}-${f.arrAirport}${f.date ? ` ${f.date}` : ''}`.trim(),
      cur: fare?.cur ?? 'VND',
      price: fare?.amount ?? 0,
      qtyMode: 'per_pax',
      unit: '/người',
      note: [air, (f.depTime || f.arrTime) ? `${f.depTime}-${f.arrTime}` : ''].filter(Boolean).join(' · '),
    });
    if (window.confirm(`✅ Đã thêm "${f.flightNo}" vào bảng báo giá (Vé máy bay). Mở tab Bảng báo giá để xem?`)) setView('cost');
  };

  const onClickLink = (el: HTMLElement, f: QuoteFlight) => {
    const fares = f.fares ?? [];
    if (fares.length > 1) setPayPicker({ el, flight: f });
    else linkToQuote(f, fares[0]);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm số hiệu, hãng, sân bay…" sx={{ maxWidth: 280, flex: 1 }} />
        <Select size="small" displayEmpty value={filterDep} onChange={(e) => setFilterDep(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">Mọi điểm đi</MenuItem>
          {depAirports.map((a) => <MenuItem key={a} value={a}>{a} — {cityOf(a) || a}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={filterAir} onChange={(e) => setFilterAir(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">Mọi hãng</MenuItem>
          {airlines.map((a) => <MenuItem key={a} value={a}>{a} — {deriveAirline(a + '0').name || a}</MenuItem>)}
        </Select>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => { setAiErr(''); setAiOpen(true); }}
          sx={{ fontWeight: 700, borderColor: 'rgba(20,150,140,0.5)', color: '#0d7a6a' }}>
          Phân tích AI
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={add}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Thêm chuyến bay
        </Button>
      </Stack>

      {flights.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có chuyến bay. Bấm “Thêm chuyến bay” để nhập tay (gõ số hiệu như VN310 sẽ tự nhận diện hãng).
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: '#eafaf6', whiteSpace: 'nowrap' } }}>
                  <TableCell sx={{ width: 36 }}>#</TableCell>
                  <TableCell>Ngày (DD/MMM)</TableCell>
                  <TableCell>Số hiệu</TableCell>
                  <TableCell>Hãng</TableCell>
                  <TableCell>Điểm đi</TableCell>
                  <TableCell>Điểm đến</TableCell>
                  <TableCell>Giờ đi</TableCell>
                  <TableCell>Giờ đến</TableCell>
                  <TableCell>Hạng giá</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((f) => {
                  const i = flights.indexOf(f);
                  return (
                    <TableRow key={f.id} hover sx={{ '& td': { p: 0.5 } }}>
                      <TableCell sx={{ color: 'text.disabled' }}>{i + 1}</TableCell>
                      <TableCell>
                        <TextField variant="standard" value={f.date} placeholder="01JAN"
                          onChange={(e) => upd(f.id, { date: e.target.value.toUpperCase() })} sx={{ ...cellInput, width: 90 }} />
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" value={f.flightNo} placeholder="VN310"
                          onChange={(e) => upd(f.id, { flightNo: e.target.value.toUpperCase() })} sx={{ ...cellInput, width: 90 }} />
                      </TableCell>
                      <TableCell>
                        {airlineName(f)
                          ? <Chip size="small" label={airlineName(f)} sx={{ bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a', fontWeight: 700 }} />
                          : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" value={f.depAirport} placeholder="HAN"
                          onChange={(e) => upd(f.id, { depAirport: e.target.value.toUpperCase() })} sx={{ ...cellInput, width: 64 }} />
                        <Typography variant="caption" color="text.secondary" noWrap>{cityOf(f.depAirport, f.depCity)}</Typography>
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" value={f.arrAirport} placeholder="SGN"
                          onChange={(e) => upd(f.id, { arrAirport: e.target.value.toUpperCase() })} sx={{ ...cellInput, width: 64 }} />
                        <Typography variant="caption" color="text.secondary" noWrap>{cityOf(f.arrAirport, f.arrCity)}</Typography>
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" type="time" value={f.depTime}
                          onChange={(e) => upd(f.id, { depTime: e.target.value })} sx={{ ...cellInput, width: 100 }} />
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" type="time" value={f.arrTime}
                          onChange={(e) => upd(f.id, { arrTime: e.target.value })} sx={{ ...cellInput, width: 100 }} />
                      </TableCell>
                      <TableCell>
                        <Button size="small" startIcon={<SellIcon />} onClick={() => setEditing(f)} sx={{ color: '#0d7a6a', whiteSpace: 'nowrap' }}>
                          {(f.fares?.length ?? 0) > 0 ? `${f.fares.length} hạng · ${fmtFare(f.fares[0])}` : 'Thêm giá'}
                        </Button>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Thêm vào bảng báo giá">
                            <IconButton size="small" sx={{ color: '#0d7a6a' }} onClick={(e) => onClickLink(e.currentTarget, f)}><AddShoppingCartIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Xoá"><IconButton size="small" color="error" onClick={() => del(f.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
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
            Dán dòng code/booking chuyến bay, hoặc tải ảnh thông tin chuyến bay. AI sẽ điền sẵn vào form để bạn duyệt rồi Lưu.
          </Typography>
          <TextField fullWidth multiline minRows={4} value={aiText} onChange={(e) => setAiText(e.target.value)}
            placeholder={'VD:\nVN310 01JAN HAN SGN 0800 1010\nVJ142 02JAN SGN DAD 14:20 15:35'} disabled={aiBusy} />
          {aiErr && <Alert severity="error" sx={{ mt: 1.5 }}>{aiErr}</Alert>}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button component="label" variant="outlined" startIcon={<ImageIcon />} disabled={aiBusy}>
            Tải ảnh
            <input type="file" hidden accept="image/*" onChange={onPickImage} />
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setAiOpen(false)} color="inherit" disabled={aiBusy}>Huỷ</Button>
          <Button variant="contained" disabled={aiBusy || !aiText.trim()} onClick={() => void runParse({ text: aiText.trim() })}
            sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            {aiBusy ? 'Đang phân tích…' : 'Phân tích'}
          </Button>
        </DialogActions>
      </Dialog>

      {queue.length > 0 && (
        <FlightEditor
          key={queue[0].id}
          flight={queue[0]}
          onClose={() => setQueue((q) => q.slice(1))}
          onSave={(f) => { setFlights([...flights, f]); setQueue((q) => q.slice(1)); }}
        />
      )}

      {editing && <FlightEditor flight={editing} onClose={() => setEditing(null)} onSave={(f) => { upd(f.id, f); setEditing(null); }} />}
    </Box>
  );
}
