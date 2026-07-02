import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, Skeleton, Stack, Tab, Tabs,
  Tooltip, Typography,
} from '@mui/material';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import HistoryIcon from '@mui/icons-material/History';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import { useQuoteStore } from '@/stores/quoteStore';
import { useFlightSearchStore } from '@/stores/flightSearchStore';
import { toast } from '@/stores/toastStore';
import { migrateFlight } from '@/components/quote/flightConstants';
import {
  searchFlights, sortOptions, flightSearchToQuoteFlight,
  type FlightSearchParams, type FlightSearchResult, type FlightOption, type SortBy, type SavedFlightSearch,
} from '@/lib/flightSearch';
import { FlightSearchForm } from './FlightSearchForm';
import { FlightOptionCard } from './FlightOptionCard';

const TEAL = '#0d7a6a';

const emptyParams = (): FlightSearchParams => ({
  origin: '', destination: '', departDate: '', pax: { adults: 1, children: 0, infants: 0 }, cabin: 'economy',
});

const SORTS: { key: SortBy; label: string }[] = [
  { key: 'best', label: 'Tốt nhất' },
  { key: 'cheapest', label: 'Rẻ nhất' },
  { key: 'fastest', label: 'Nhanh nhất' },
];

export function FlightSearchView() {
  const [params, setParams] = useState<FlightSearchParams>(emptyParams);
  const [result, setResult] = useState<FlightSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('best');
  const [showHistory, setShowHistory] = useState(false);

  const searches = useFlightSearchStore((s) => s.searches);
  const loadHistory = useFlightSearchStore((s) => s.load);
  const saveSearch = useFlightSearchStore((s) => s.saveSearch);
  const removeSearch = useFlightSearchStore((s) => s.remove);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const patch = (p: Partial<FlightSearchParams>) => setParams((prev) => ({ ...prev, ...p }));

  const runSearch = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await searchFlights(params);
      setResult(r);
      setSortBy('best');
      if (!r.options.length) {
        setError(r.warning ? 'AI không đọc được kết quả — thử lại hoặc đổi từ khoá.' : 'Không tìm thấy chuyến bay phù hợp. Thử nới điều kiện hoặc đổi ngày.');
      }
    } catch (e) {
      setError((e as Error).message || 'Lỗi tra cứu chuyến bay.');
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(
    () => (result ? sortOptions(result.options, sortBy) : []),
    [result, sortBy],
  );

  const pushToQuote = (opt: FlightOption) => {
    const cur = (useQuoteStore.getState().draft.flights ?? []).map(migrateFlight);
    useQuoteStore.getState().setFlights([...cur, flightSearchToQuoteFlight(opt)]);
    toast('✈️ Đã thêm chuyến bay vào báo giá', 'success', {
      label: 'Mở tab Chuyến bay',
      onClick: () => useQuoteStore.getState().setView('flights'),
    });
  };

  const onSave = async () => {
    if (!result || !result.options.length) return;
    const rec = await saveSearch(params, result);
    if (rec) toast('💾 Đã lưu lần tra cứu này', 'success');
  };

  const openSaved = (s: SavedFlightSearch) => {
    setParams(s.params);
    setResult(s.result);
    setSortBy('best');
    setError(s.result.options.length ? null : 'Lần tra cứu này không có kết quả.');
    setShowHistory(false);
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={900}>🔎 Tìm chuyến bay</Typography>
          <Typography color="text.secondary" fontSize={13}>
            Tổng hợp từ nhiều nguồn web — nhập yêu cầu, xem option bay, transit & giá tham khảo.
          </Typography>
        </Box>
        <Tooltip title="Lịch sử tra cứu đã lưu">
          <IconButton onClick={() => setShowHistory((v) => !v)} sx={{ color: showHistory ? TEAL : undefined }}>
            <HistoryIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {showHistory && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(0,0,0,0.1)', bgcolor: '#fafafa' }}>
          <Typography fontWeight={700} fontSize={13} sx={{ mb: 1 }}>Lịch sử tra cứu của tôi</Typography>
          {searches.length === 0 ? (
            <Typography color="text.secondary" fontSize={13}>Chưa có lần tra cứu nào được lưu.</Typography>
          ) : (
            <Stack spacing={0.5}>
              {searches.map((s) => (
                <Stack key={s.id} direction="row" alignItems="center" spacing={1}
                  sx={{ px: 1, py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' } }}>
                  <ReplayIcon sx={{ fontSize: 16, color: TEAL }} />
                  <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openSaved(s)}>
                    <Typography fontSize={13} fontWeight={600} noWrap>{s.label}</Typography>
                    <Typography color="text.secondary" fontSize={11}>
                      {s.result.options.length} option · {new Date(s.createdAt).toLocaleString('vi-VN')}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => void removeSearch(s.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      )}

      <FlightSearchForm params={params} onChange={patch} onSearch={runSearch} loading={loading} />

      {/* Kết quả */}
      <Box sx={{ mt: 2 }}>
        {loading && (
          <Stack spacing={1.5}>
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={96} />)}
          </Stack>
        )}

        {!loading && error && (
          <Alert severity={result && !result.options.length ? 'info' : 'error'} sx={{ mt: 1 }}>{error}</Alert>
        )}

        {!loading && result && result.options.length > 0 && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Tabs value={sortBy} onChange={(_e, v) => setSortBy(v)}
                sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 700 }, '& .Mui-selected': { color: TEAL + ' !important' }, '& .MuiTabs-indicator': { bgcolor: TEAL } }}>
                {SORTS.map((s) => <Tab key={s.key} value={s.key} label={s.label} />)}
              </Tabs>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography color="text.secondary" fontSize={13}>{result.options.length} option</Typography>
                <Button size="small" startIcon={<BookmarkAddOutlinedIcon />} onClick={() => void onSave()}
                  sx={{ color: TEAL, textTransform: 'none', fontWeight: 700 }}>Lưu tra cứu</Button>
              </Stack>
            </Stack>

            <Stack spacing={1.2}>
              {sorted.map((o) => <FlightOptionCard key={o.id} option={o} onPush={pushToQuote} />)}
            </Stack>

            {/* Nguồn tham khảo */}
            {result.citations.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography fontSize={12} color="text.secondary" sx={{ mb: 0.5 }}>Nguồn tham khảo:</Typography>
                <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                  {result.citations.slice(0, 12).map((c, i) => (
                    <Chip key={i} size="small" component="a" clickable label={c.title || c.url}
                      href={c.url} target="_blank" rel="noopener"
                      sx={{ maxWidth: 260, height: 22, fontSize: 11 }} />
                  ))}
                </Stack>
              </>
            )}
            <Typography fontSize={11} color="text.secondary" sx={{ mt: 2 }}>
              ⚠️ Kết quả do AI tổng hợp từ web ({new Date(result.generatedAt).toLocaleString('vi-VN')}). Giá & lịch bay
              mang tính tham khảo — luôn xác nhận lại với hãng/đại lý trước khi báo khách hoặc xuất vé.
            </Typography>
          </>
        )}

        {!loading && !result && !error && (
          <Stack alignItems="center" spacing={1} sx={{ py: 6, color: 'text.secondary' }}>
            <Typography fontSize={40}>🛫</Typography>
            <Typography fontSize={14}>Nhập điểm đi, điểm đến và ngày rồi bấm <b>Tìm chuyến bay</b>.</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
