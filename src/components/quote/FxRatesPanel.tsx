import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useQuoteStore } from '@/stores/quoteStore';
import { fxRank, fxLabel } from '@/lib/currency';
import { LEGACY } from '@/theme';

/**
 * Panel tỷ giá quy đổi (→ VND) DÙNG CHUNG cho Báo giá và Visa — đọc/ghi tỷ giá
 * toàn cục ở quoteStore, nên sửa ở đâu cũng đồng bộ mọi nơi & mọi tài khoản.
 */
export function FxRatesPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const rates = useQuoteStore((s) => s.draft.rates);
  const setRate = useQuoteStore((s) => s.setRate);
  const syncFxNow = useQuoteStore((s) => s.syncFxNow);
  const fxSyncedAt = useQuoteStore((s) => s.fxSyncedAt);
  const fxSyncedBy = useQuoteStore((s) => s.fxSyncedBy);

  const [showRates, setShowRates] = useState(defaultOpen);
  const [fxSyncing, setFxSyncing] = useState(false);

  const addCustomRate = () => {
    const raw = window.prompt('Nhập mã tiền tệ cần thêm (vd: MYR, HKD, TWD, CHF):');
    const code = raw?.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z]{2,5}$/.test(code)) { window.alert('⚠ Mã tiền tệ không hợp lệ (2–5 chữ cái, vd MYR).'); return; }
    if (code === 'VND') { window.alert('VND là tiền gốc, không cần thêm tỷ giá.'); return; }
    if (rates[code] != null) { window.alert(`⚠ ${fxLabel(code)} đã có trong bảng tỷ giá.`); return; }
    const rate = Number(window.prompt(`Tỷ giá: 1 ${fxLabel(code)} = ? VND`, '0')) || 0;
    setRate(code, rate);
    setShowRates(true);
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
            Tỷ giá quy đổi (→ VND)
          </Typography>
          <Typography sx={{ color: 'rgba(15,58,74,0.4)', fontSize: 12 }}>
            Đồng bộ mọi user · nhấp để {showRates ? 'ẩn' : 'chỉnh sửa'}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          {fxSyncedAt && (
            <Typography sx={{ color: 'rgba(15,58,74,0.45)', fontSize: 11 }}>
              ☁️ Cập nhật {new Date(fxSyncedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              {fxSyncedBy ? ` · ${fxSyncedBy}` : ''}
            </Typography>
          )}
          <Button
            size="small" variant="contained" disabled={fxSyncing}
            onClick={async (e) => {
              e.stopPropagation();
              setFxSyncing(true);
              try {
                await syncFxNow();
              } catch (err) {
                window.alert('❌ Lưu tỷ giá thất bại (ghi cloud bị chặn?): ' + (err instanceof Error ? err.message : String(err)));
              } finally {
                setFxSyncing(false);
              }
            }}
            sx={{ minWidth: 0, px: 1.5, py: 0.3, fontSize: 12, fontWeight: 800, background: LEGACY.headerGradient }}
          >
            {fxSyncing ? 'Đang lưu…' : '💾 Lưu tỷ giá'}
          </Button>
          <Box component="span" sx={{ color: 'rgba(15,58,74,0.5)', fontSize: 13 }}>{showRates ? '▲' : '▼'}</Box>
        </Stack>
      </Box>
      {showRates && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, px: 2.25, pb: 2.25, pt: 0.5 }}>
          {Object.entries(rates)
            .filter(([c, r]) => c !== 'VND' && typeof r === 'number')
            .sort((a, b) => fxRank(a[0]) - fxRank(b[0]))
            .map(([c, r]) => (
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
                  size="small" type="number" value={r}
                  onChange={(e) => setRate(c, Number(e.target.value) || 0)}
                  variant="standard"
                  slotProps={{
                    input: {
                      disableUnderline: true,
                      endAdornment: <Box component="span" sx={{ color: '#f5a623', fontWeight: 700, fontSize: 13, ml: 0.25 }}>₫</Box>,
                    },
                    htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#f5a623', padding: 0, width: 72 } },
                  }}
                />
              </Box>
            ))}
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
        </Box>
      )}
    </Box>
  );
}
