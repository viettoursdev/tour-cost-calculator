import { useState } from 'react';
import { Box, Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { fxRank, fxLabel, CURRENCY_FLAGS } from '@/lib/currency';
import type { OutputCurrency } from '@/types';
import { LEGACY } from '@/theme';

type Scope = 'quote' | 'global';

/**
 * Panel tỷ giá quy đổi (→ VND).
 *
 * - scope="quote" (mặc định): chỉnh tỷ giá RIÊNG của báo giá đang mở (draft.rates).
 *   Mọi user sửa được. "💾 Lưu tỷ giá" ghim vào báo giá này (local). CEO có thêm
 *   "🔄 Đồng bộ tỷ giá" để đẩy bảng tỷ giá lên đồng bộ toàn hệ thống (chỉ áp cho
 *   báo giá MỚI tạo về sau).
 * - scope="global" (Visa): chỉnh bảng tỷ giá ĐỒNG BỘ toàn hệ thống (syncedRates).
 *   Chỉ CEO sửa & "🔄 Đồng bộ tỷ giá"; user khác xem.
 */
export function FxRatesPanel({ scope = 'quote', defaultOpen = false }: { scope?: Scope; defaultOpen?: boolean }) {
  const draftRates = useQuoteStore((s) => s.draft.rates);
  const template = useQuoteStore((s) => s.draft.template);
  const rateBase = useQuoteStore((s) => s.draft.rateBase);
  const setRateBase = useQuoteStore((s) => s.setRateBase);
  const syncedRates = useQuoteStore((s) => s.syncedRates);
  const setRate = useQuoteStore((s) => s.setRate);
  const setSyncedRate = useQuoteStore((s) => s.setSyncedRate);
  const pushGlobalRates = useQuoteStore((s) => s.pushGlobalRates);
  const saveDraftRatesLocal = useQuoteStore((s) => s.saveDraftRatesLocal);
  const fxSyncedAt = useQuoteStore((s) => s.fxSyncedAt);
  const isCEO = useAuthStore((s) => s.currentUser?.role === 'CEO');

  const isGlobal = scope === 'global';
  const rates = isGlobal ? syncedRates : draftRates;
  const editable = isGlobal ? isCEO : true;       // global: chỉ CEO; quote: mọi user
  const editRate = isGlobal ? setSyncedRate : setRate;

  // Tiền tệ mặc định cho ô Đơn giá khi thêm dòng mới (chỉ báo giá nước ngoài & DMC).
  // Bảng tỷ giá vẫn luôn hiển thị → VND; lựa chọn này chỉ ảnh hưởng cur dòng mới.
  const allowBase = !isGlobal && (template === 'intl' || template === 'dmc');
  const base = allowBase ? (rateBase || 'USD') : 'VND'; // báo giá nước ngoài/DMC mặc định USD
  const baseOptions = [...new Set(['VND', ...Object.keys(rates)])]
    .sort((a, b) => (a === 'VND' ? -1 : b === 'VND' ? 1 : fxRank(a) - fxRank(b)));

  // Danh sách tỷ giá (bỏ VND) — dùng cho cả preview gọn (khi thu) lẫn ô sửa (khi mở).
  const rateEntries = (Object.entries(rates)
    .filter(([c, r]) => c !== 'VND' && typeof r === 'number') as [string, number][])
    .sort((a, b) => fxRank(a[0]) - fxRank(b[0]));

  const [showRates, setShowRates] = useState(defaultOpen);
  const [syncing, setSyncing] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const addCustomRate = () => {
    const raw = window.prompt('Nhập mã tiền tệ cần thêm (vd: MYR, HKD, TWD, CHF):');
    const code = raw?.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z]{2,5}$/.test(code)) { window.alert('⚠ Mã tiền tệ không hợp lệ (2–5 chữ cái, vd MYR).'); return; }
    if (code === 'VND') { window.alert('VND là tiền gốc, không cần thêm tỷ giá.'); return; }
    if (rates[code] != null) { window.alert(`⚠ ${fxLabel(code)} đã có trong bảng tỷ giá.`); return; }
    const rate = Number(window.prompt(`Tỷ giá: 1 ${fxLabel(code)} = ? VND`, '0')) || 0;
    editRate(code, rate);
    setShowRates(true);
  };

  const handleSaveLocal = () => {
    saveDraftRatesLocal();
    setSavedTick(true);
    window.setTimeout(() => setSavedTick(false), 1500);
  };

  const handleSync = async () => {
    if (!window.confirm('Đồng bộ bảng tỷ giá này lên toàn hệ thống? Tỷ giá đồng bộ chỉ áp dụng cho các báo giá MỚI tạo, không thay đổi báo giá cũ.')) return;
    setSyncing(true);
    try {
      await pushGlobalRates(rates);
    } catch (err) {
      window.alert('❌ Đồng bộ tỷ giá thất bại (ghi cloud bị chặn?): ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Box sx={{ borderRadius: '10px', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(20,150,140,0.18)' }}>
      {/* Hàng tỷ giá — toolbar mảnh: nhãn · preview tỷ giá (khi thu) · điều khiển bên phải */}
      <Box
        onClick={() => setShowRates((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, cursor: 'pointer', minHeight: 36 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
          <Box component="span" sx={{ fontSize: 13 }}>💱</Box>
          <Typography sx={{ fontWeight: 800, fontSize: 11.5, color: LEGACY.navy, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
            {isGlobal ? 'TỶ GIÁ ĐỒNG BỘ' : 'TỶ GIÁ'} <Box component="span" sx={{ color: 'rgba(15,58,74,0.4)', fontWeight: 600 }}>→ VND</Box>
          </Typography>
        </Stack>

        {/* Preview gọn các tỷ giá ngay trên hàng (chỉ khi đang thu) */}
        <Stack
          direction="row" alignItems="center" spacing={0.5} useFlexGap flexWrap="wrap"
          sx={{ flex: 1, minWidth: 0, overflow: 'hidden', maxHeight: 22 }}
        >
          {!showRates && (rateEntries.length
            ? rateEntries.map(([c, r]) => (
                <Box key={c} sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.4, background: 'rgba(15,58,74,0.05)', borderRadius: '6px', px: 0.7, py: 0.1, whiteSpace: 'nowrap' }}>
                  <Box component="span" sx={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(15,58,74,0.5)' }}>{fxLabel(c)}</Box>
                  <Box component="span" sx={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(15,58,74,0.7)' }}>{r.toLocaleString('vi-VN')}</Box>
                </Box>
              ))
            : <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 11 }}>Chưa có tỷ giá ngoại tệ</Typography>)}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.75} onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
          {allowBase && (
            <Select
              size="small" variant="standard" value={base} disableUnderline
              onChange={(e) => setRateBase(e.target.value)}
              sx={{ fontSize: 11.5, fontWeight: 800, color: '#0d7a6a', '& .MuiSelect-select': { py: 0.1, pr: '18px !important', pl: 0.5 } }}
              renderValue={(c) => `${CURRENCY_FLAGS[c as OutputCurrency] ?? ''} ${fxLabel(c)}`}
            >
              {baseOptions.map((c) => (
                <MenuItem key={c} value={c} sx={{ fontSize: 13 }}>{CURRENCY_FLAGS[c as OutputCurrency] ?? '🏳️'} {fxLabel(c)}</MenuItem>
              ))}
            </Select>
          )}
          {fxSyncedAt && (
            <Typography sx={{ color: 'rgba(15,58,74,0.45)', fontSize: 10.5, display: { xs: 'none', lg: 'block' } }}>
              ☁️ {new Date(fxSyncedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </Typography>
          )}
          {!isGlobal && (
            <Button
              size="small" variant="outlined"
              onClick={handleSaveLocal}
              sx={{ minWidth: 0, px: 1, py: 0.15, fontSize: 11, fontWeight: 800, borderColor: 'rgba(20,150,140,0.5)', color: '#0d7a6a' }}
            >
              {savedTick ? '✓' : '💾 Lưu'}
            </Button>
          )}
          {isCEO && (
            <Button
              size="small" variant="contained" disabled={syncing}
              onClick={handleSync}
              sx={{ minWidth: 0, px: 1, py: 0.15, fontSize: 11, fontWeight: 800, background: LEGACY.headerGradient }}
            >
              {syncing ? '…' : '🔄 Đồng bộ'}
            </Button>
          )}
          <Box component="span" sx={{ color: 'rgba(15,58,74,0.45)', fontSize: 11 }}>{showRates ? '▲' : '▼'}</Box>
        </Stack>
      </Box>

      {showRates && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, px: 1.5, pb: 1.25, pt: 0.25, borderTop: '1px dashed rgba(20,150,140,0.2)' }}>
          {rateEntries.map(([c, r]) => (
            <Box
              key={c}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.6,
                background: 'rgba(168,230,221,0.22)', border: '1px solid rgba(20,150,140,0.2)',
                borderRadius: '8px', px: 1, py: 0.4,
              }}
            >
              <Typography sx={{ color: '#0d7a6a', fontSize: 12, fontWeight: 700, minWidth: 30 }}>1 {fxLabel(c)}</Typography>
              <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 11 }}>=</Typography>
              <TextField
                size="small" type="number" value={r} disabled={!editable}
                onChange={(e) => editRate(c, Number(e.target.value) || 0)}
                variant="standard"
                slotProps={{
                  input: {
                    disableUnderline: true,
                    endAdornment: <Box component="span" sx={{ color: '#f5a623', fontWeight: 700, fontSize: 12, ml: 0.25 }}>₫</Box>,
                  },
                  htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#f5a623', padding: 0, width: 64 } },
                }}
              />
            </Box>
          ))}
          {editable && (
            <Box
              onClick={addCustomRate}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                background: 'rgba(20,150,140,0.06)', border: '1px dashed rgba(20,150,140,0.45)',
                borderRadius: '8px', px: 1, py: 0.4, color: '#0d7a6a', fontSize: 12, fontWeight: 700,
                '&:hover': { background: 'rgba(20,150,140,0.14)' },
              }}
            >
              ➕ Thêm
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
