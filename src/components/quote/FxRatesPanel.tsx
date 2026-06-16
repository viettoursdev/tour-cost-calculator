import { useState } from 'react';
import { Box, Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { fxRank, fxLabel, CURRENCY_FLAGS } from '@/lib/currency';
import type { OutputCurrency } from '@/types';
import { LEGACY } from '@/theme';

/** Làm tròn giá trị tỷ giá để HIỂN THỊ khi quy về tiền tệ khác VND. */
function roundDisplay(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 0 : abs >= 1 ? 4 : 8;
  return Number(v.toFixed(decimals));
}

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
  const fxSyncedBy = useQuoteStore((s) => s.fxSyncedBy);
  const isCEO = useAuthStore((s) => s.currentUser?.role === 'CEO');

  const isGlobal = scope === 'global';
  const rates = isGlobal ? syncedRates : draftRates;
  const editable = isGlobal ? isCEO : true;       // global: chỉ CEO; quote: mọi user
  const editRate = isGlobal ? setSyncedRate : setRate;

  // Chọn tiền tệ HIỂN THỊ (chỉ báo giá nước ngoài & DMC). draft.rates luôn → VND.
  const allowBase = !isGlobal && (template === 'intl' || template === 'dmc');
  const base = allowBase ? (rateBase || 'VND') : 'VND';
  const vndPer = (c: string) => (c === 'VND' ? 1 : Number(rates[c]) || 0);
  const baseVnd = base === 'VND' ? 1 : vndPer(base);       // 0 ⇒ chưa có tỷ giá base
  const baseSym = base === 'VND' ? '₫' : fxLabel(base);
  const baseOptions = [...new Set(['VND', ...Object.keys(rates)])]
    .sort((a, b) => (a === 'VND' ? -1 : b === 'VND' ? 1 : fxRank(a) - fxRank(b)));

  const [showRates, setShowRates] = useState(defaultOpen);
  const [syncing, setSyncing] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const addCustomRate = () => {
    const raw = window.prompt('Nhập mã tiền tệ cần thêm (vd: MYR, HKD, TWD, CHF):');
    const code = raw?.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z]{2,5}$/.test(code)) { window.alert('⚠ Mã tiền tệ không hợp lệ (2–5 chữ cái, vd MYR).'); return; }
    if (code === 'VND') { window.alert('VND là tiền gốc, không cần thêm tỷ giá.'); return; }
    if (code === base) { window.alert(`${fxLabel(code)} đang là tiền tệ hiển thị.`); return; }
    if (rates[code] != null) { window.alert(`⚠ ${fxLabel(code)} đã có trong bảng tỷ giá.`); return; }
    const input = Number(window.prompt(`Tỷ giá: 1 ${fxLabel(code)} = ? ${baseSym}`, '0')) || 0;
    // Lưu luôn quy về VND, dù nhập theo tiền tệ hiển thị nào.
    editRate(code, base === 'VND' ? input : input * baseVnd);
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
    <Box sx={{ borderRadius: '12px', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(20,150,140,0.18)' }}>
      <Box
        onClick={() => setShowRates((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.25, py: 1.25, cursor: 'pointer' }}
      >
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Box component="span" sx={{ fontSize: 15 }}>💱</Box>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: LEGACY.navy, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {isGlobal ? 'Tỷ giá đồng bộ toàn hệ thống (→ VND)' : `Tỷ giá báo giá này (→ ${fxLabel(base)})`}
          </Typography>
          {allowBase && (
            <Select
              size="small" variant="standard" value={base} disableUnderline
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRateBase(e.target.value)}
              sx={{ fontSize: 12.5, fontWeight: 800, color: '#0d7a6a', '& .MuiSelect-select': { py: 0.25, pr: '20px !important', pl: 0.75 } }}
              renderValue={(c) => `Mặc định: ${CURRENCY_FLAGS[c as OutputCurrency] ?? ''} ${fxLabel(c)}`}
            >
              {baseOptions.map((c) => (
                <MenuItem key={c} value={c} sx={{ fontSize: 13 }}>{CURRENCY_FLAGS[c as OutputCurrency] ?? '🏳️'} {fxLabel(c)}</MenuItem>
              ))}
            </Select>
          )}
          <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 12 }}>
            {isGlobal
              ? (editable ? 'Chỉ CEO sửa · áp cho báo giá mới' : 'Chỉ CEO chỉnh sửa')
              : 'Riêng cho báo giá này'} · nhấp để {showRates ? 'ẩn' : 'xem'}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1.25} onClick={(e) => e.stopPropagation()}>
          {fxSyncedAt && (
            <Typography sx={{ color: 'rgba(15,58,74,0.45)', fontSize: 11 }}>
              ☁️ Đồng bộ {new Date(fxSyncedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              {fxSyncedBy ? ` · ${fxSyncedBy}` : ''}
            </Typography>
          )}
          {!isGlobal && (
            <Button
              size="small" variant="outlined"
              onClick={handleSaveLocal}
              sx={{ minWidth: 0, px: 1.5, py: 0.3, fontSize: 12, fontWeight: 800, borderColor: 'rgba(20,150,140,0.5)', color: '#0d7a6a' }}
            >
              {savedTick ? '✓ Đã lưu' : '💾 Lưu tỷ giá'}
            </Button>
          )}
          {isCEO && (
            <Button
              size="small" variant="contained" disabled={syncing}
              onClick={handleSync}
              sx={{ minWidth: 0, px: 1.5, py: 0.3, fontSize: 12, fontWeight: 800, background: LEGACY.headerGradient }}
            >
              {syncing ? 'Đang đồng bộ…' : '🔄 Đồng bộ tỷ giá'}
            </Button>
          )}
          <Box component="span" sx={{ color: 'rgba(15,58,74,0.5)', fontSize: 13 }}>{showRates ? '▲' : '▼'}</Box>
        </Stack>
      </Box>
      {showRates && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, px: 2.25, pb: 2.25, pt: 0.5 }}>
          {[...new Set(['VND', ...Object.keys(rates)])]
            .filter((c) => c !== base && (c === 'VND' ? base !== 'VND' : typeof rates[c] === 'number'))
            .sort((a, b) => fxRank(a) - fxRank(b))
            .map((c) => {
              const shown = base === 'VND' ? Number(rates[c]) : roundDisplay(baseVnd > 0 ? vndPer(c) / baseVnd : 0);
              const editableChip = editable && c !== 'VND'; // VND là gốc quy đổi → chỉ xem khi base khác VND
              return (
                <Box
                  key={c}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    background: 'rgba(168,230,221,0.25)', border: '1px solid rgba(20,150,140,0.2)',
                    borderRadius: '10px', px: 1.75, py: 1,
                  }}
                >
                  <Typography sx={{ color: '#0d7a6a', fontSize: 13, fontWeight: 700, minWidth: 36 }}>1 {fxLabel(c)}</Typography>
                  <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 12 }}>=</Typography>
                  <TextField
                    size="small" type="number" value={shown} disabled={!editableChip}
                    onChange={(e) => { const v = Number(e.target.value) || 0; editRate(c, base === 'VND' ? v : v * baseVnd); }}
                    variant="standard"
                    slotProps={{
                      input: {
                        disableUnderline: true,
                        endAdornment: <Box component="span" sx={{ color: '#f5a623', fontWeight: 700, fontSize: 13, ml: 0.25 }}>{baseSym}</Box>,
                      },
                      htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#f5a623', padding: 0, width: 72 } },
                    }}
                  />
                </Box>
              );
            })}
          {editable && (
            <Box
              onClick={addCustomRate}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                background: 'rgba(20,150,140,0.06)', border: '1px dashed rgba(20,150,140,0.45)',
                borderRadius: '10px', px: 1.75, py: 1, color: '#0d7a6a', fontSize: 13, fontWeight: 700,
                '&:hover': { background: 'rgba(20,150,140,0.14)' },
              }}
            >
              ➕ Thêm tỷ giá
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
