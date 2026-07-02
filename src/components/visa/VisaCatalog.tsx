import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, IconButton, MenuItem, Paper, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import { useAuthStore } from '@/stores/authStore';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { FxRatesPanel } from '@/components/quote/FxRatesPanel';
import { MENU_CUR } from '@/components/menu/constants';
import {
  VISAP_TYPES, VISA_FEE_PRESET, VISA_LOCS, VISA_VALIDITY, newVisaFee, newVisaProduct,
} from './constants';
import { VisaCatalogHistoryModal } from './VisaCatalogHistoryModal';
import type { VisaFee, VisaProduct } from '@/types';

export function VisaCatalog() {
  const products = useVisaProductsStore((s) => s.products);
  // Visa dùng tỷ giá ĐỒNG BỘ toàn hệ thống (chỉ CEO sửa qua nút Đồng bộ tỷ giá).
  const rates = useQuoteStore((s) => s.syncedRates);
  const loaded = useVisaProductsStore((s) => s.loaded);
  const user = useAuthStore((s) => s.currentUser);
  const savedBy = user ? `${user.name} (${user.role})` : 'unknown';

  const [search, setSearch] = useState('');
  const [outCur, setOutCur] = useState('VND');
  const [showFx, setShowFx] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  // ── Lưu AN TOÀN: per-row (KHÔNG còn xoá-sạch-ghi-lại toàn catalog mỗi keystroke). ──
  //  • setLocal: hiện sửa NGAY (mượt khi gõ).
  //  • upsert: debounce 500ms/sản-phẩm → chỉ ghi ĐÚNG sản phẩm vừa sửa.
  //  • snapshot: debounce 3s → mỗi đợt sửa chỉ tạo 1 mốc khôi phục (hết churn version).
  //  • rời trang: flush mọi sửa đang chờ để không mất thao tác cuối.
  const upsertTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pending = useRef<Map<string, VisaProduct>>(new Map());
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratesRef = useRef(rates);
  ratesRef.current = rates;

  const scheduleSnapshot = () => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      void useVisaProductsStore.getState().snapshot(ratesRef.current, savedBy);
    }, 3000);
  };
  const flushUpsert = (id: string) => {
    const t = upsertTimers.current.get(id);
    if (t) { clearTimeout(t); upsertTimers.current.delete(id); }
    const p = pending.current.get(id);
    if (!p) return;
    pending.current.delete(id);
    void useVisaProductsStore.getState().upsertProduct(p).then(scheduleSnapshot).catch(() => {});
  };
  const scheduleUpsert = (p: VisaProduct) => {
    pending.current.set(p.id, p);
    const t = upsertTimers.current.get(p.id);
    if (t) clearTimeout(t);
    upsertTimers.current.set(p.id, setTimeout(() => flushUpsert(p.id), 500));
  };

  useEffect(() => () => {
    // Unmount: ghi nốt mọi sửa đang chờ + 1 snapshot, tránh mất thao tác cuối.
    pending.current.forEach((p) => { void useVisaProductsStore.getState().upsertProduct(p).catch(() => {}); });
    upsertTimers.current.forEach((t) => clearTimeout(t));
    if (snapTimer.current) { clearTimeout(snapTimer.current); void useVisaProductsStore.getState().snapshot(ratesRef.current, savedBy); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocal = (next: VisaProduct[]) => useVisaProductsStore.getState().setLocal(next);

  const addP = () => {
    const np = newVisaProduct();
    setLocal([np, ...useVisaProductsStore.getState().products]);
    void useVisaProductsStore.getState().upsertProduct(np).then(scheduleSnapshot).catch(() => {});
  };
  const updP = (id: string, patch: Partial<VisaProduct>) => {
    const cur = useVisaProductsStore.getState().products;
    const found = cur.find((p) => p.id === id);
    if (!found) return;
    const merged = { ...found, ...patch };
    setLocal(cur.map((p) => (p.id === id ? merged : p)));
    scheduleUpsert(merged);
  };
  const delP = (id: string) => {
    if (!window.confirm('Xoá sản phẩm visa này?')) return;
    const t = upsertTimers.current.get(id);
    if (t) { clearTimeout(t); upsertTimers.current.delete(id); }
    pending.current.delete(id);
    void useVisaProductsStore.getState().removeProduct(id).then(scheduleSnapshot).catch(() => {});
  };

  const addFee = (pid: string) => {
    const p = useVisaProductsStore.getState().products.find((x) => x.id === pid);
    if (!p) return;
    updP(pid, { fees: [...(p.fees ?? []), newVisaFee('Phí khác')] });
  };
  const updFee = (pid: string, fid: string, patch: Partial<VisaFee>) => {
    const p = useVisaProductsStore.getState().products.find((x) => x.id === pid);
    if (!p) return;
    updP(pid, { fees: p.fees.map((f) => (f.id === fid ? { ...f, ...patch } : f)) });
  };
  const delFee = (pid: string, fid: string) => {
    const p = useVisaProductsStore.getState().products.find((x) => x.id === pid);
    if (!p) return;
    updP(pid, { fees: p.fees.filter((f) => f.id !== fid) });
  };

  const toVND = (amt: number, cur: string) => (+amt || 0) * (rates[cur] || 1);
  const conv = (vnd: number, cur: string) => (cur === 'VND' ? vnd : vnd / (rates[cur] || 1));
  const fmtO = (vnd: number) => Math.round(conv(vnd, outCur)).toLocaleString('vi-VN') + ' ' + outCur;
  const calc = (p: VisaProduct) => {
    const base = (p.fees ?? []).filter((f) => f.perPax !== false).reduce((s, f) => s + toVND(f.amount, f.cur), 0);
    const perGroup = (p.fees ?? []).filter((f) => f.perPax === false).reduce((s, f) => s + toVND(f.amount, f.cur), 0);
    let unit = base;
    if (p.markupType === 'fixed') unit += toVND(p.markupValue, p.markupCur || 'VND');
    else unit *= (1 + (+p.markupValue || 0) / 100);
    return { unit, perGroup };
  };

  const countryOpts = useMemo(() => {
    const set = new Set(products.map((p) => p.country).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [products]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return [p.country, p.visaType, p.validity, p.location]
      .join(' ').toLowerCase().includes(q);
  });

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField size="small" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm quốc gia, loại, nơi nộp..."
          sx={{ maxWidth: 340, flex: 1 }} />
        <Stack direction="row" spacing={0.5} alignItems="center"
          sx={{ bgcolor: 'var(--vte-surface)', border: '1.5px solid rgba(20,150,140,0.25)', borderRadius: 1.5, px: 1 }}>
          <Typography variant="caption" color="text.secondary">Hiển thị giá:</Typography>
          <Select size="small" value={outCur} variant="standard" disableUnderline
            onChange={(e) => setOutCur(e.target.value)}
            sx={{ fontWeight: 800, color: '#0d7a6a' }}>
            {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </Stack>
        <Button size="small" variant="outlined"
          onClick={() => setShowFx((s) => !s)}>
          💱 Tỷ giá
        </Button>
        <Button size="small" variant="outlined" startIcon={<HistoryIcon />}
          onClick={() => setHistOpen(true)}>
          Lịch sử
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={addP}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Thêm sản phẩm visa
        </Button>
      </Stack>

      {showFx && (
        <Box sx={{ mb: 2 }}>
          <FxRatesPanel scope="global" defaultOpen />
        </Box>
      )}

      <VisaCatalogHistoryModal
        open={histOpen}
        onClose={() => setHistOpen(false)}
        onRestore={(restored) => {
          // Khôi phục = thay TOÀN BỘ catalog về 1 phiên bản cũ (hành động chủ động, hiếm)
          // → dùng full-overwrite + tạo mốc khôi phục mới.
          void useVisaProductsStore.getState().save({ products: restored, rates }, savedBy);
          setHistOpen(false);
        }}
      />

      {!loaded && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>⏳ Đang tải...</Box>
      )}
      {loaded && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography fontSize={42} sx={{ mb: 1.5 }}>🛂</Typography>
          <Typography variant="subtitle1" fontWeight={600}>
            {products.length === 0 ? 'Chưa có sản phẩm visa nào' : 'Không tìm thấy'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Bấm "Thêm sản phẩm visa" để bắt đầu
          </Typography>
        </Box>
      )}

      <Stack spacing={2}>
        {filtered.map((p) => {
          const r = calc(p);
          return (
            <Paper key={p.id} sx={{ p: 2.25, opacity: p.active === false ? 0.55 : 1 }} variant="outlined">
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1.3fr 0.9fr auto auto', gap: 1.25, alignItems: 'center', mb: 1.5 }}>
                <TextField size="small" value={p.country}
                  onChange={(e) => updP(p.id, { country: e.target.value })}
                  placeholder="Quốc gia ▾"
                  inputProps={{ list: `vc-country-${p.id}` }}
                  InputProps={{ sx: { fontWeight: 700 } }} />
                <Box component="datalist" id={`vc-country-${p.id}`}>
                  {countryOpts.map((o) => <option key={o} value={o} />)}
                </Box>
                <Select size="small" value={p.visaType}
                  onChange={(e) => updP(p.id, { visaType: e.target.value })}>
                  {VISAP_TYPES.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
                <Select size="small" value={p.validity}
                  onChange={(e) => updP(p.id, { validity: e.target.value })}>
                  {VISA_VALIDITY.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
                <Select size="small" value={p.location}
                  onChange={(e) => updP(p.id, { location: e.target.value })}>
                  {VISA_LOCS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
                <Switch checked={p.active !== false}
                  onChange={() => updP(p.id, { active: p.active === false })}
                  color="success" />
                <IconButton size="small" color="error" onClick={() => delP(p.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

              <Typography variant="caption" fontWeight={800} color="text.secondary"
                sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Các thành phần phí
              </Typography>
              <Stack spacing={0.75}>
                {(p.fees ?? []).map((f) => (
                  <Box key={f.id} sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.9fr 30px', gap: 1, alignItems: 'center' }}>
                    <TextField size="small" value={f.name}
                      onChange={(e) => updFee(p.id, f.id, { name: e.target.value })}
                      placeholder="Tên phí"
                      inputProps={{ list: `vf-name-${p.id}` }} />
                    <Select size="small" value={f.perPax !== false ? 'pax' : 'group'}
                      onChange={(e) => updFee(p.id, f.id, { perPax: e.target.value === 'pax' })}>
                      <MenuItem value="pax">/ khách</MenuItem>
                      <MenuItem value="group">/ đoàn</MenuItem>
                    </Select>
                    <TextField size="small" type="number" value={f.amount}
                      onChange={(e) => updFee(p.id, f.id, { amount: +e.target.value })}
                      placeholder="Số tiền"
                      InputProps={{ sx: { textAlign: 'right' } }} />
                    <Select size="small" value={f.cur}
                      onChange={(e) => updFee(p.id, f.id, { cur: e.target.value })}>
                      {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                    <IconButton size="small" color="error" onClick={() => delFee(p.id, f.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Box component="datalist" id={`vf-name-${p.id}`}>
                  {VISA_FEE_PRESET.map((o) => <option key={o} value={o} />)}
                </Box>
              </Stack>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addFee(p.id)}
                sx={{ mt: 1, color: '#0d7a6a' }}>
                Thêm phí
              </Button>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 1.5, mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(20,150,140,0.12)' }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" fontWeight={700} color="text.secondary">Markup:</Typography>
                  <Select size="small" value={p.markupType}
                    onChange={(e) => updP(p.id, { markupType: e.target.value as 'percent' | 'fixed' })}>
                    <MenuItem value="percent">%</MenuItem>
                    <MenuItem value="fixed">Cố định</MenuItem>
                  </Select>
                  <TextField size="small" type="number" value={p.markupValue}
                    onChange={(e) => updP(p.id, { markupValue: +e.target.value })}
                    sx={{ width: 100 }}
                    InputProps={{ sx: { textAlign: 'right' } }} />
                  {p.markupType === 'fixed' && (
                    <Select size="small" value={p.markupCur || 'VND'}
                      onChange={(e) => updP(p.id, { markupCur: e.target.value })}>
                      {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  )}
                </Stack>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Đơn giá / khách
                  </Typography>
                  <Typography fontWeight={900} fontSize={22} sx={{ color: '#0d7a6a', lineHeight: 1.1 }}>
                    {fmtO(r.unit)}
                  </Typography>
                  {r.perGroup > 0 && (
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#b8761e', mt: 0.25, display: 'block' }}>
                      + phí đoàn: {fmtO(r.perGroup)}
                    </Typography>
                  )}
                </Box>
              </Box>

              <TextField fullWidth size="small" sx={{ mt: 1.25 }}
                value={p.note ?? ''}
                onChange={(e) => updP(p.id, { note: e.target.value })}
                placeholder="📝 Ghi chú (thời gian xử lý, hồ sơ yêu cầu, lưu ý...)" />
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
