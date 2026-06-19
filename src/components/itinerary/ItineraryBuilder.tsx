import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Autocomplete, Box, Button, IconButton, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { ITIN_TYPE, ITIN_CONTINENT, ITIN_COUNTRY, generateItinCode } from './itinCode';
import {
  ITIN_DEFAULT_INC, ITIN_DEFAULT_EXC, cloneDay, newActivity, newDay, newSegment, TRANSPORT_PRESETS,
} from './constants';
import { parseFlights } from './parseFlights';
import { parseFlights as parseFlightsAI } from '@/lib/flightParse';
import { flightDep, flightArr, normalizeFlight } from './flightFields';
import { SortableList } from './SortableList';
import { AISettingsModal } from './AISettingsModal';
import { ItineraryCheckDialog } from './ItineraryCheckDialog';
import { ItineraryPreviewDialog } from './ItineraryPreviewDialog';
import { AIScheduleDialog } from './AIScheduleDialog';
import { callAIWorker } from '@/lib/aiWorker';
// Trình xuất lịch trình nạp động khi bấm.
import { useMenuStore } from '@/stores/menuStore';
import { usePoiStore } from '@/stores/poiStore';
import { filterRank } from '@/lib/search';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { ItineraryExecEditor } from './ItineraryExecEditor';
import type { Activity, Day, Flight, Itinerary, ItineraryType, QuoteFlight, Segment, User } from '@/types';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BoltIcon from '@mui/icons-material/Bolt';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';

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
  const initialIt = useMemo(() => {
    const base = initial ?? freshItinerary();
    return { ...base, flights: (base.flights ?? []).map(normalizeFlight) };
  }, [initial]);
  const { state: it, set: setIt, undo, redo, canUndo, canRedo } = useHistoryState<Itinerary>(initialIt);
  useUndoRedoShortcuts(undo, redo);
  const [saving, setSaving] = useState(false);
  const [flightPaste, setFlightPaste] = useState('');
  const [flightAiBusy, setFlightAiBusy] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiSchedOpen, setAiSchedOpen] = useState(false);
  const applyAISchedule = (days: Day[], mode: 'replace' | 'append') => setIt((p) => {
    const merged = mode === 'append' ? [...p.schedule, ...days] : days;
    return { ...p, schedule: merged.map((d, i) => ({ ...d, dayNum: i + 1 })) };
  });
  const doExportWord = () => void import('@/lib/exports/exportItineraryDocx').then((m) => m.exportItineraryDocx(it, code));
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const pois = usePoiStore((s) => s.pois);

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

  // Xuất Bản điều hành tour — tự tìm thực đơn đã link với chương trình + contact nhà hàng.
  const handleExec = async (format: 'pdf' | 'docx') => {
    const withCode = { ...it, code };
    const idx = useMenuStore.getState().list.find((x) => x.linkedItineraryId === it.id);
    const menu = idx ? await useMenuStore.getState().load(idx.id) : null;
    const restaurants = useRestaurantStore.getState().list;
    if (format === 'pdf') await import('@/lib/exports/exportItineraryExecutionPDF').then((m) => m.exportItineraryExecutionPDF(withCode, menu, restaurants));
    else await import('@/lib/exports/exportItineraryExecutionDocx').then((m) => m.exportItineraryExecutionDocx(withCode, menu, restaurants));
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
    setIt((p) => ({ ...p, flights: parsed.map(normalizeFlight) }));
    setFlightPaste('');
  };

  // AI: phân tích chuyến bay từ text/ảnh (dùng /chat Sonnet) → map MỖI chặng sang 1 Flight lịch trình.
  const qfToFlights = (qf: QuoteFlight): Flight[] => qf.segments.map((s) => normalizeFlight({
    id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + s.flightNo,
    group: 'Nhóm 1', leg: s.date || '', flightNo: s.flightNo, dep: '', arr: '',
    depAirport: s.depAirport, depTime: s.depTime, depDayOffset: s.depDayOffset,
    arrAirport: s.arrAirport, arrTime: s.arrTime, arrDayOffset: s.arrDayOffset,
  }));
  const runFlightAI = async (payload: { text?: string; imageB64?: string }) => {
    setFlightAiBusy(true);
    try {
      const qfs = await parseFlightsAI(payload);
      if (!qfs.length) { window.alert('Không nhận diện được chuyến bay. Thử ảnh rõ hơn hoặc dán code.'); return; }
      setIt((p) => ({ ...p, flights: qfs.flatMap(qfToFlights) }));
      setFlightPaste('');
    } catch (e) {
      window.alert('❌ ' + (e as Error).message);
    } finally {
      setFlightAiBusy(false);
    }
  };
  const onPickFlightImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result ?? '').split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file); });
    void runFlightAI({ imageB64: b64, text: flightPaste.trim() || undefined });
  };

  // ── Day / Segment / Activity ops ──

  const reorder = <T,>(arr: T[], from: number, to: number): T[] => {
    const a = [...arr];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return a;
  };

  const updDayById = (dayId: string, fn: (d: Day) => Day) =>
    setIt((p) => ({ ...p, schedule: p.schedule.map((d) => (d.id === dayId ? fn(d) : d)) }));
  const updSegById = (dayId: string, segId: string, fn: (s: Segment) => Segment) =>
    updDayById(dayId, (d) => ({
      ...d,
      segments: d.segments.map((s) => (s.id === segId ? fn(s) : s)),
    }));

  const addDay = () => setIt((p) => ({
    ...p,
    schedule: [...p.schedule, newDay(p.schedule.length + 1)],
  }));
  const dupDay = (id: string) => setIt((p) => {
    const idx = p.schedule.findIndex((d) => d.id === id);
    if (idx < 0) return p;
    const copy: Day = { ...cloneDay(p.schedule[idx]), date: '' };
    const arr = [...p.schedule];
    arr.splice(idx + 1, 0, copy);
    return { ...p, schedule: arr.map((d, i) => ({ ...d, dayNum: i + 1 })) };
  });
  const delDay = (id: string) => setIt((p) => ({
    ...p,
    schedule: p.schedule.filter((d) => d.id !== id).map((d, i) => ({ ...d, dayNum: i + 1 })),
  }));
  // Tự điền ngày tháng cho Ngày 1..N từ ngày khởi hành (định dạng dd/MM/yyyy).
  const fillDates = (startISO: string) => setIt((p) => {
    const base = new Date(startISO + 'T00:00:00');
    if (Number.isNaN(base.getTime())) return { ...p, startDate: startISO };
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return { ...p, startDate: startISO, schedule: p.schedule.map((d, i) => ({ ...d, date: fmt(new Date(base.getTime() + i * 86400000)) })) };
  });
  const updDay = (id: string, patch: Partial<Day>) =>
    updDayById(id, (d) => ({ ...d, ...patch }));
  const reorderDays = (from: number, to: number) =>
    setIt((p) => ({
      ...p,
      schedule: reorder(p.schedule, from, to).map((d, i) => ({ ...d, dayNum: i + 1 })),
    }));

  const addSeg = (dayId: string) =>
    updDayById(dayId, (d) => ({ ...d, segments: [...d.segments, newSegment('▸ NHÓM ...')] }));
  const delSeg = (dayId: string, segId: string) =>
    updDayById(dayId, (d) => ({ ...d, segments: d.segments.filter((s) => s.id !== segId) }));
  const updSeg = (dayId: string, segId: string, patch: Partial<Segment>) =>
    updSegById(dayId, segId, (s) => ({ ...s, ...patch }));

  const addAct = (dayId: string, segId: string) =>
    updSegById(dayId, segId, (s) => ({ ...s, activities: [...s.activities, newActivity()] }));
  const delAct = (dayId: string, segId: string, actId: string) =>
    updSegById(dayId, segId, (s) => ({ ...s, activities: s.activities.filter((a) => a.id !== actId) }));
  const updAct = (dayId: string, segId: string, actId: string, patch: Partial<Activity>) =>
    updSegById(dayId, segId, (s) => ({
      ...s,
      activities: s.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)),
    }));
  const reorderActs = (dayId: string, segId: string, from: number, to: number) =>
    updSegById(dayId, segId, (s) => ({ ...s, activities: reorder(s.activities, from, to) }));

  // ── Includes / Excludes ops ──
  const updList = (key: 'includes' | 'excludes', i: number, v: string) =>
    setIt((p) => {
      const l = [...p[key]];
      l[i] = v;
      return { ...p, [key]: l };
    });
  const addListItem = (key: 'includes' | 'excludes') =>
    setIt((p) => ({ ...p, [key]: [...p[key], ''] }));
  const delListItem = (key: 'includes' | 'excludes', i: number) =>
    setIt((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));

  // ── AI ──
  const genIntro = async () => {
    if (!it.destination) {
      window.alert('Nhập Điểm đến trước');
      return;
    }
    setAiBusy('intro');
    try {
      const d = await callAIWorker('/ai', {
        prompt: `Viết đoạn giới thiệu 3-4 câu súc tích, chuyên nghiệp về điểm đến "${it.destination}" cho chương trình tour đoàn doanh nghiệp. Văn phong sang trọng, gợi cảm hứng. Chỉ trả về đoạn văn, không tiêu đề.`,
      });
      if (d.text) set('intro', d.text.trim());
    } catch (e) {
      window.alert('❌ ' + (e as Error).message);
    } finally {
      setAiBusy(null);
    }
  };

  const genActivity = async (dayId: string, segId: string, actId: string, placeText: string) => {
    if (!placeText.trim()) {
      window.alert('Nhập tên địa điểm trước');
      return;
    }
    setAiBusy(actId);
    try {
      const d = await callAIWorker('/ai', {
        prompt: `Viết 1-2 câu thuyết minh ngắn gọn, súc tích, chuyên nghiệp về địa điểm/hoạt động: "${placeText}" tại ${it.destination || 'điểm đến'}. Dành cho khách đoàn doanh nghiệp. Chỉ trả về câu thuyết minh, giữ lại tên địa điểm ở đầu nếu có.`,
      });
      if (d.text) {
        const commentary = d.text.trim();
        updAct(dayId, segId, actId, { text: commentary });
        // Lưu vào thư viện thuyết minh để tái dùng (dedupe theo địa điểm).
        void usePoiStore.getState().upsertMany([{ place: placeText.trim(), commentary, destination: it.destination }]);
      }
    } catch (e) {
      window.alert('❌ ' + (e as Error).message);
    } finally {
      setAiBusy(null);
    }
  };

  const genDistance = async (dayId: string, segId: string, routeText: string) => {
    const parts = (routeText || '').split(/→|->|–|-/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      window.alert("Điền tuyến ngày dạng 'Điểm A → Điểm B' để tính khoảng cách");
      return;
    }
    setAiBusy('dist' + segId);
    try {
      const d = await callAIWorker('/distance', {
        origin: parts[0],
        destination: parts[parts.length - 1],
        mode: 'driving',
      });
      if (d.distance || d.duration) {
        updSeg(dayId, segId, { transport: `🚗 Xe ô tô · ${d.distance || '~'} · ${d.duration || '~'} di chuyển` });
      } else {
        window.alert('Không tính được khoảng cách cho tuyến này');
      }
    } catch (e) {
      window.alert('❌ ' + (e as Error).message);
    } finally {
      setAiBusy(null);
    }
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
            <Button color="inherit" variant="outlined" startIcon={<SettingsIcon />}
              onClick={(e) => { e.currentTarget.blur(); setAiSettingsOpen(true); }}>
              AI
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<SaveIcon />}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<span>✅</span>}
              onClick={() => setCheckOpen(true)}>
              Kiểm tra
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<span>👁</span>}
              onClick={() => setPreviewOpen(true)}>
              Xem trước
            </Button>
            <Button color="inherit" variant="contained"
              startIcon={<DescriptionIcon />}
              onClick={doExportWord}
              sx={{ bgcolor: '#fff', color: '#0d7a6a' }}>
              Xuất Word
            </Button>
            <Button color="inherit" variant="contained" startIcon={<span>🧭</span>}
              onClick={() => void handleExec('pdf')}
              sx={{ bgcolor: '#0f3a4a', color: '#fff' }}>
              Execution PDF
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<span>🧭</span>}
              onClick={() => void handleExec('docx')}>
              Execution Word
            </Button>
            <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} color="#fff" />
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
              <Button size="small" variant="outlined" onClick={genIntro}
                disabled={aiBusy === 'intro'}
                sx={{ color: '#8e44ad', borderColor: 'rgba(142,68,173,0.3)' }}>
                {aiBusy === 'intro' ? '⏳ Đang tạo...' : '✨ Tạo bằng AI'}
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
              📋 Dán code GDS (Phân tích nhanh) — hoặc dán thông tin bất kỳ / tải ảnh để AI nhận diện
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                fullWidth size="small" multiline minRows={2}
                value={flightPaste} disabled={flightAiBusy}
                onChange={(e) => setFlightPaste(e.target.value)}
                placeholder={"Dán code GDS/PNR, VD:\n1  BR 396 10JUN SGN TPE  1545 2010\nHoặc dán text/ảnh vé → bấm ✨ AI"}
                InputProps={{ sx: { fontSize: 12, fontFamily: 'monospace' } }}
              />
              <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
                <Button variant="contained" size="small" startIcon={<BoltIcon />} onClick={doParseFlights} disabled={flightAiBusy}
                  sx={{ background: 'linear-gradient(135deg,#2980b9,#3498db)', whiteSpace: 'nowrap' }}>
                  Phân tích
                </Button>
                <Button variant="outlined" size="small" startIcon={<AutoAwesomeIcon />} disabled={flightAiBusy || !flightPaste.trim()}
                  onClick={() => void runFlightAI({ text: flightPaste.trim() })} sx={{ whiteSpace: 'nowrap' }}>
                  {flightAiBusy ? 'Đang…' : '✨ AI'}
                </Button>
                <Button component="label" variant="outlined" size="small" startIcon={<ImageIcon />} disabled={flightAiBusy} sx={{ whiteSpace: 'nowrap' }}>
                  Ảnh
                  <input type="file" hidden accept="image/*" onChange={onPickFlightImage} />
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 36px', gap: 1, px: 0.25 }}>
              {['Nhóm', 'Chặng', 'Số hiệu', 'Sân bay đi', 'Giờ bay', 'Sân bay đến', 'Giờ đáp', ''].map((h, i) => (
                <Typography key={i} variant="caption" fontWeight={700} color="text.secondary">{h}</Typography>
              ))}
            </Box>
            {it.flights.map((f) => (
              <Box key={f.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 36px', gap: 1, alignItems: 'center' }}>
                <TextField size="small" value={f.group}
                  onChange={(e) => updFlight(f.id, { group: e.target.value })}
                  placeholder="Nhóm" />
                <TextField size="small" value={f.leg}
                  onChange={(e) => updFlight(f.id, { leg: e.target.value })}
                  placeholder="Đi · Ngày 1" />
                <TextField size="small" value={f.flightNo}
                  onChange={(e) => updFlight(f.id, { flightNo: e.target.value })}
                  placeholder="CA904" />
                <TextField size="small" value={flightDep(f).airport}
                  onChange={(e) => updFlight(f.id, { depAirport: e.target.value.toUpperCase() })}
                  placeholder="TSN" />
                <TextField size="small" value={flightDep(f).time}
                  onChange={(e) => updFlight(f.id, { depTime: e.target.value })}
                  placeholder="05:40"
                  InputProps={flightDep(f).offset > 0 ? { endAdornment: <Typography component="sup" sx={{ color: '#dc3250', fontWeight: 800, fontSize: 11 }}>+{flightDep(f).offset}</Typography> } : undefined} />
                <TextField size="small" value={flightArr(f).airport}
                  onChange={(e) => updFlight(f.id, { arrAirport: e.target.value.toUpperCase() })}
                  placeholder="PEK" />
                <TextField size="small" value={flightArr(f).time}
                  onChange={(e) => updFlight(f.id, { arrTime: e.target.value })}
                  placeholder="11:35"
                  InputProps={flightArr(f).offset > 0 ? { endAdornment: <Typography component="sup" sx={{ color: '#dc3250', fontWeight: 800, fontSize: 11 }}>+{flightArr(f).offset}</Typography> } : undefined} />
                <IconButton size="small" color="error" onClick={() => delFlight(f.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
        </Paper>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={800}>
            📅 Lịch trình theo ngày
            <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
              · kéo ⋮⋮ để đổi thứ tự
            </Typography>
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField size="small" type="date" label="Ngày khởi hành" InputLabelProps={{ shrink: true }}
              value={it.startDate ?? ''} onChange={(e) => fillDates(e.target.value)}
              sx={{ width: 168 }} title="Chọn ngày khởi hành → tự điền ngày cho từng Ngày" />
            <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setAiSchedOpen(true)}
              sx={{ borderColor: '#7c3aed', color: '#7c3aed' }}>
              AI lịch trình
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={addDay}
              sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
              Thêm ngày
            </Button>
          </Stack>
        </Stack>

        <SortableList
          onReorder={reorderDays}
          handle=".day-handle"
          deps={[it.schedule.length]}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {it.schedule.map((d) => (
            <Paper key={d.id} data-sid={d.id} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff', px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box component="span" className="day-handle" sx={{ cursor: 'grab', fontSize: 16, opacity: 0.7, userSelect: 'none' }}>⋮⋮</Box>
                <Typography fontWeight={900} fontSize={14}>NGÀY {d.dayNum}</Typography>
                <TextField size="small" variant="outlined"
                  value={d.date} onChange={(e) => updDay(d.id, { date: e.target.value })}
                  placeholder="Date (tuỳ chọn)"
                  sx={{ width: 140, '& .MuiInputBase-input': { color: '#fff', fontSize: 12 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }} />
                <TextField size="small" variant="outlined" fullWidth
                  value={d.title} onChange={(e) => updDay(d.id, { title: e.target.value })}
                  placeholder="Điểm đến / tuyến (VD: TP.HCM → BẮC KINH)"
                  sx={{ flex: 1, minWidth: 200, '& .MuiInputBase-input': { color: '#fff', fontWeight: 600 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }} />
                <IconButton size="small" title="Nhân bản ngày" sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff' }}
                  onClick={() => dupDay(d.id)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title="Xoá ngày" sx={{ bgcolor: 'rgba(220,50,80,0.25)', color: '#fff' }}
                  onClick={() => delDay(d.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ p: 2 }}>
                {d.segments.map((seg, si) => (
                  <Box key={seg.id} sx={{ mb: si < d.segments.length - 1 ? 2 : 0 }}>
                    {d.segments.length > 1 && (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                        <TextField size="small" fullWidth
                          value={seg.groupLabel}
                          onChange={(e) => updSeg(d.id, seg.id, { groupLabel: e.target.value })}
                          placeholder="▸ NHÓM HCM — CA904"
                          sx={{ '& .MuiInputBase-input': { fontSize: 12, fontWeight: 700, color: '#2980b9' } }} />
                        <Button size="small" color="error" onClick={() => delSeg(d.id, seg.id)}
                          sx={{ flexShrink: 0, fontSize: 11 }}>
                          ✕ nhóm
                        </Button>
                      </Stack>
                    )}

                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      <Select size="small" value="" displayEmpty
                        onChange={(e) => {
                          const pr = TRANSPORT_PRESETS.find((x) => x.label === e.target.value);
                          if (pr) updSeg(d.id, seg.id, { transport: pr.tpl });
                        }}
                        sx={{ width: 150, flexShrink: 0, color: '#14a08c', fontWeight: 600, fontSize: 12 }}
                      >
                        <MenuItem value=""><em>+ Phương tiện</em></MenuItem>
                        {TRANSPORT_PRESETS.map((pr) => (
                          <MenuItem key={pr.label} value={pr.label}>{pr.icon} {pr.label}</MenuItem>
                        ))}
                      </Select>
                      <TextField fullWidth size="small"
                        value={seg.transport}
                        onChange={(e) => updSeg(d.id, seg.id, { transport: e.target.value })}
                        placeholder="Phương tiện · khoảng cách · thời gian"
                        sx={{ '& .MuiInputBase-input': { fontSize: 12, color: '#14a08c', fontWeight: 600 } }} />
                      <Button size="small" variant="outlined"
                        disabled={aiBusy === 'dist' + seg.id}
                        onClick={() => genDistance(d.id, seg.id, d.title)}
                        title="Tự tính khoảng cách/thời gian từ tuyến ngày (Google Maps)"
                        sx={{ color: '#2980b9', borderColor: 'rgba(41,128,185,0.3)', whiteSpace: 'nowrap', fontSize: 11 }}>
                        {aiBusy === 'dist' + seg.id ? '⏳' : '📍 Tính'}
                      </Button>
                    </Stack>

                    <SortableList
                      onReorder={(f, t) => reorderActs(d.id, seg.id, f, t)}
                      handle=".act-handle"
                      deps={[seg.activities.length, d.id]}
                      sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}
                    >
                      {seg.activities.map((a) => (
                        <Stack key={a.id} data-sid={a.id} direction="row" spacing={0.75} alignItems="center">
                          <Box component="span" className="act-handle" sx={{ cursor: 'grab', color: 'rgba(15,58,74,0.3)', fontSize: 13, flexShrink: 0 }}>⋮⋮</Box>
                          <TextField size="small" sx={{ width: 80, flexShrink: 0 }}
                            value={a.time}
                            onChange={(e) => updAct(d.id, seg.id, a.id, { time: e.target.value })}
                            placeholder="08:00"
                            InputProps={{ sx: { fontSize: 12, fontWeight: 700, color: '#14a08c' } }} />
                          <Autocomplete
                            fullWidth freeSolo size="small" options={pois}
                            inputValue={a.text}
                            onInputChange={(_, v) => updAct(d.id, seg.id, a.id, { text: v })}
                            onChange={(_, v) => {
                              if (v && typeof v !== 'string') {
                                updAct(d.id, seg.id, a.id, { text: `${v.place} – ${v.commentary}` });
                              }
                            }}
                            getOptionLabel={(o) => (typeof o === 'string' ? o : o.place)}
                            filterOptions={(opts, st) => (st.inputValue.trim()
                              ? filterRank(opts, st.inputValue, (p) => `${p.place} ${p.commentary}`).slice(0, 6)
                              : [])}
                            renderOption={(props, o) => (
                              <li {...props} key={typeof o === 'string' ? o : o.id}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={700}>{typeof o === 'string' ? o : o.place}</Typography>
                                  {typeof o !== 'string' && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{o.commentary}</Typography>
                                  )}
                                </Box>
                              </li>
                            )}
                            renderInput={(params) => (
                              <TextField {...params} placeholder="Nội dung hoạt động / thuyết minh… (gõ tên điểm để gợi ý)" />
                            )}
                          />
                          <Button size="small" variant="outlined"
                            disabled={aiBusy === a.id}
                            onClick={() => void genActivity(d.id, seg.id, a.id, a.text)}
                            title="AI tạo thuyết minh cho địa điểm này"
                            sx={{ color: '#8e44ad', borderColor: 'rgba(142,68,173,0.3)', minWidth: 0, px: 1, flexShrink: 0 }}>
                            {aiBusy === a.id ? '⏳' : '✨'}
                          </Button>
                          <IconButton size="small" color="error" onClick={() => delAct(d.id, seg.id, a.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </SortableList>
                    <Button size="small" onClick={() => addAct(d.id, seg.id)}
                      sx={{ mt: 0.75, color: '#0d7a6a', fontSize: 12 }}>
                      + hoạt động
                    </Button>
                  </Box>
                ))}

                <Button size="small" variant="outlined" onClick={() => addSeg(d.id)}
                  sx={{ mt: 1, borderStyle: 'dashed', borderColor: 'rgba(41,128,185,0.3)', color: '#2980b9', fontSize: 12 }}>
                  + Tách nhóm (ngày đầu/cuối nhiều chuyến bay)
                </Button>

                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed rgba(20,150,140,0.18)', display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    🍽 Bữa ăn bao gồm:
                  </Typography>
                  {(['B', 'L', 'D'] as const).map((m) => {
                    const name = m === 'B' ? 'Sáng' : m === 'L' ? 'Trưa' : 'Tối';
                    const on = d.meals[m];
                    return (
                      <Button key={m} size="small" variant={on ? 'contained' : 'outlined'}
                        color="success"
                        onClick={() => updDay(d.id, { meals: { ...d.meals, [m]: !on } })}
                        sx={{ fontSize: 11, py: 0.25 }}>
                        {on ? '✓ ' : ''}{name}
                      </Button>
                    );
                  })}
                  <TextField fullWidth size="small" sx={{ flex: 1, minWidth: 180 }}
                    value={d.mealNote ?? ''}
                    onChange={(e) => updDay(d.id, { mealNote: e.target.value })}
                    placeholder="Ghi chú bữa ăn (VD: buffet KS, đặc sản địa phương...)" />
                </Box>
              </Box>
            </Paper>
          ))}
        </SortableList>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 3 }}>
          {(['includes', 'excludes'] as const).map((key) => {
            const isInc = key === 'includes';
            return (
              <Paper key={key} sx={{ p: 2.25 }}>
                <Typography fontWeight={800} fontSize={13} sx={{ mb: 1.25, color: isInc ? '#27ae60' : '#c0392b' }}>
                  {isInc ? '✓ GIÁ BAO GỒM' : '✕ KHÔNG BAO GỒM'}
                </Typography>
                <Stack spacing={0.75}>
                  {it[key].map((x, i) => (
                    <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                      <TextField fullWidth size="small" value={x}
                        onChange={(e) => updList(key, i, e.target.value)} />
                      <IconButton size="small" color="error" onClick={() => delListItem(key, i)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addListItem(key)}
                  sx={{ mt: 1, color: '#0d7a6a', fontSize: 12 }}>
                  thêm mục
                </Button>
              </Paper>
            );
          })}
        </Box>

        <ItineraryExecEditor exec={it.exec} days={it.schedule} onChange={(exec) => set('exec', exec)} />

        <Box sx={{ height: 40 }} />
      </Box>

      <AISettingsModal open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
      <ItineraryCheckDialog itinerary={checkOpen ? it : null} onClose={() => setCheckOpen(false)} onExportWord={doExportWord}
        onPreview={() => setPreviewOpen(true)} />
      <ItineraryPreviewDialog itinerary={previewOpen ? it : null} code={code} onClose={() => setPreviewOpen(false)} />
      <AIScheduleDialog open={aiSchedOpen} onClose={() => setAiSchedOpen(false)}
        defaultDestination={it.destination} defaultDays={it.days || it.schedule.length || 4}
        hasSchedule={it.schedule.length > 0} onApply={applyAISchedule} />
    </Box>
  );
}
