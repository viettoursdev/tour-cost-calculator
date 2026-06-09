import { useMemo, useState } from 'react';
import {
  Box, Button, IconButton, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { ITIN_TYPE, ITIN_CONTINENT, ITIN_COUNTRY, generateItinCode } from './itinCode';
import { ITIN_DEFAULT_INC, ITIN_DEFAULT_EXC, newDay } from './constants';
import { parseFlights } from './parseFlights';
import type { Flight, Itinerary, ItineraryType, User } from '@/types';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BoltIcon from '@mui/icons-material/Bolt';
import AddIcon from '@mui/icons-material/Add';

type Props = {
  initial: Itinerary | null;
  user: User;
  onBack: () => void;
};

function freshItinerary(): Itinerary {
  return {
    id: 'it' + Date.now(),
    type: 'NN',
    continent: 'CA',
    country: 'TQ',
    seq: 1,
    title: 'CHƯƠNG TRÌNH THAM QUAN DU LỊCH',
    destination: '',
    days: 4,
    nights: 3,
    intro: '',
    flights: [{ id: 'f1', group: 'Nhóm 1', leg: 'Đi · Ngày 1', flightNo: '', dep: '', arr: '' }],
    schedule: [newDay(1), newDay(2), newDay(3), newDay(4)],
    includes: [...ITIN_DEFAULT_INC],
    excludes: [...ITIN_DEFAULT_EXC],
    linkedQuoteId: null,
    linkedQuoteName: '',
  };
}

export function ItineraryBuilder({ initial, user, onBack }: Props) {
  const [it, setIt] = useState<Itinerary>(() => initial ?? freshItinerary());
  const [saving, setSaving] = useState(false);
  const [flightPaste, setFlightPaste] = useState('');
  const quotes = useQuoteHistoryStore((s) => s.quotes);

  const code = useMemo(
    () => generateItinCode(it.type, it.continent, it.country, it.seq),
    [it.type, it.continent, it.country, it.seq],
  );

  const set = <K extends keyof Itinerary>(k: K, v: Itinerary[K]) =>
    setIt((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const savedBy = `${user.name} (${user.role})`;
      await useItineraryStore.getState().save({ ...it, code }, savedBy);
    } catch (e) {
      window.alert('Lỗi lưu: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addFlight = () => setIt((p) => ({
    ...p,
    flights: [...p.flights, { id: 'f' + Date.now(), group: 'Nhóm', leg: '', flightNo: '', dep: '', arr: '' }],
  }));
  const delFlight = (id: string) => setIt((p) => ({ ...p, flights: p.flights.filter((f) => f.id !== id) }));
  const updFlight = (id: string, patch: Partial<Flight>) =>
    setIt((p) => ({ ...p, flights: p.flights.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const doParseFlights = () => {
    const parsed = parseFlights(flightPaste);
    if (parsed.length === 0) {
      window.alert('Không nhận diện được chuyến bay. Thử dán dạng: CA904 TSN 05:40 PEK 11:35');
      return;
    }
    setIt((p) => ({ ...p, flights: parsed }));
    setFlightPaste('');
  };

  const linkQuote = (qId: string) => {
    if (!qId) {
      setIt((p) => ({ ...p, linkedQuoteId: null, linkedQuoteName: '' }));
      return;
    }
    const q = quotes.find((x) => String(x.id) === qId || x.cloudId === qId);
    if (!q) {
      setIt((p) => ({ ...p, linkedQuoteId: null, linkedQuoteName: '' }));
      return;
    }
    setIt((p) => ({
      ...p,
      linkedQuoteId: q.cloudId,
      linkedQuoteName: q.name ?? '',
    }));
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f4fefa' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>🗺️ Trình tạo Chương trình tour</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Mã: <strong style={{ fontFamily: 'monospace' }}>{code}</strong>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button color="inherit" variant="outlined" startIcon={<SettingsIcon />} disabled>
              AI
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<SaveIcon />}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
            <Button color="inherit" variant="contained"
              startIcon={<DescriptionIcon />} disabled
              sx={{ bgcolor: '#fff', color: '#0d7a6a' }}>
              Xuất Word
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
              Quay lại
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>
            📋 Thông tin chương trình
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 0.8fr', gap: 1.5, mb: 2 }}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Loại</Typography>
              <Select fullWidth size="small" value={it.type}
                onChange={(e) => set('type', e.target.value as ItineraryType)}>
                {Object.entries(ITIN_TYPE).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Châu lục</Typography>
              <Select fullWidth size="small" value={it.continent}
                onChange={(e) => {
                  const c = e.target.value;
                  const first = Object.keys(ITIN_COUNTRY[c] ?? {})[0] ?? '';
                  setIt((p) => ({ ...p, continent: c, country: first }));
                }}>
                {Object.entries(ITIN_CONTINENT).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Quốc gia</Typography>
              <Select fullWidth size="small" value={it.country}
                onChange={(e) => set('country', e.target.value)}>
                {Object.entries(ITIN_COUNTRY[it.continent] ?? {}).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">STT</Typography>
              <TextField fullWidth size="small" type="number"
                value={it.seq} onChange={(e) => set('seq', +e.target.value)} />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 0.6fr', gap: 1.5, mb: 2 }}>
            <TextField label="Tên chương trình" size="small" value={it.title}
              onChange={(e) => set('title', e.target.value)} />
            <TextField label="Điểm đến" size="small" value={it.destination}
              onChange={(e) => set('destination', e.target.value)} placeholder="VD: BẮC KINH" />
            <TextField label="Số ngày" size="small" type="number"
              value={it.days} onChange={(e) => set('days', +e.target.value)} />
            <TextField label="Số đêm" size="small" type="number"
              value={it.nights} onChange={(e) => set('nights', +e.target.value)} />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Giới thiệu điểm đến (3-4 câu)
              </Typography>
              <Button size="small" disabled
                sx={{ color: '#8e44ad', borderColor: '#8e44ad' }} variant="outlined">
                ✨ Tạo bằng AI
              </Button>
            </Stack>
            <TextField fullWidth multiline minRows={3} size="small"
              value={it.intro} onChange={(e) => set('intro', e.target.value)}
              placeholder="Đoạn thuyết minh ngắn về điểm đến..." />
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              🔗 Link báo giá (tự lấy điểm đến từ báo giá)
            </Typography>
            <Select fullWidth size="small" value={it.linkedQuoteId ?? ''}
              onChange={(e) => linkQuote(e.target.value)} displayEmpty>
              <MenuItem value="">— Không liên kết —</MenuItem>
              {quotes.map((q) => (
                <MenuItem key={q.cloudId} value={q.cloudId}>
                  {q.quoteCode ? `[${q.quoteCode}] ` : ''}{q.name}
                  {q.customerName ? ` · ${q.customerName}` : ''}
                </MenuItem>
              ))}
            </Select>
            {it.linkedQuoteName && (
              <Typography variant="caption" sx={{ color: '#14a08c', fontWeight: 600, mt: 0.5, display: 'block' }}>
                ✓ Đã liên kết báo giá: {it.linkedQuoteName}
              </Typography>
            )}
          </Box>
        </Paper>

        <Paper sx={{ p: 3, mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={800}>✈️ Thông tin chuyến bay</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addFlight} variant="outlined">
              Thêm chuyến
            </Button>
          </Stack>

          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'rgba(41,128,185,0.05)', border: '1px dashed rgba(41,128,185,0.3)' }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#2980b9', display: 'block', mb: 0.5 }}>
              📋 Dán đoạn thông tin chuyến bay → tự phân tích
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth size="small" multiline minRows={2}
                value={flightPaste}
                onChange={(e) => setFlightPaste(e.target.value)}
                placeholder={"Dán code GDS/PNR, VD:\n1  BR 396 10JUN SGN TPE  1545 2010\n2  BR 051 24JUN IAH TPE  0120 0605"}
                InputProps={{ sx: { fontSize: 12, fontFamily: 'monospace' } }}
              />
              <Button variant="contained" startIcon={<BoltIcon />} onClick={doParseFlights}
                sx={{ background: 'linear-gradient(135deg,#2980b9,#3498db)', whiteSpace: 'nowrap' }}>
                Phân tích
              </Button>
            </Stack>
          </Paper>

          <Stack spacing={1}>
            {it.flights.map((f) => (
              <Box key={f.id} sx={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 1fr 1.1fr 1.1fr 40px', gap: 1, alignItems: 'center' }}>
                <TextField size="small" value={f.group}
                  onChange={(e) => updFlight(f.id, { group: e.target.value })}
                  placeholder="Nhóm" />
                <TextField size="small" value={f.leg}
                  onChange={(e) => updFlight(f.id, { leg: e.target.value })}
                  placeholder="Đi · Ngày 1" />
                <TextField size="small" value={f.flightNo}
                  onChange={(e) => updFlight(f.id, { flightNo: e.target.value })}
                  placeholder="CA904" />
                <TextField size="small" value={f.dep}
                  onChange={(e) => updFlight(f.id, { dep: e.target.value })}
                  placeholder="TSN 05:40" />
                <TextField size="small" value={f.arr}
                  onChange={(e) => updFlight(f.id, { arr: e.target.value })}
                  placeholder="PEK 11:35" />
                <IconButton size="small" color="error" onClick={() => delFlight(f.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
