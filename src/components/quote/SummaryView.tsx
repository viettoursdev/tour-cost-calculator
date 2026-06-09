import type { ReactNode } from 'react';
import { Box, Button, Paper, Slider, Stack, TextField, Typography } from '@mui/material';
import { catTotal, computeTotals, fmtVND } from './calc';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import { LEGACY } from '@/theme';
import type { CategoryId, Template } from '@/types';

const ROUNDING_OPTS = [10000, 50000, 100000, 500000];

/** Section label — small uppercase caption used above each panel (legacy style). */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        color: 'rgba(15,58,74,0.55)', fontSize: 11, fontWeight: 700,
        letterSpacing: 2, textTransform: 'uppercase', mb: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

export function SummaryView() {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const info = useQuoteStore((s) => s.draft.info);
  const items = useQuoteStore((s) => s.draft.items);
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const margin = useQuoteStore((s) => s.draft.margin);
  const vat = useQuoteStore((s) => s.draft.vat);
  const svcBasis = useQuoteStore((s) => s.draft.svcBasis);
  const rounding = useQuoteStore((s) => s.draft.rounding);
  const setMargin = useQuoteStore((s) => s.setMargin);
  const setVat = useQuoteStore((s) => s.setVat);
  const setSvcBasis = useQuoteStore((s) => s.setSvcBasis);
  const setRounding = useQuoteStore((s) => s.setRounding);

  const totals = computeTotals({
    template, info, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled,
    currentQuoteId: null,
  });
  const { totalCost, totalProfit, totalVAT, roundedPPax } = totals;

  const cats = getCATS(template);
  const catRows = cats
    .filter((c) => catEnabled[c.id as CategoryId])
    .map((c) => ({
      ...c,
      total: catTotal(items[c.id as CategoryId] ?? [], rates, pax),
    }));

  const basis = svcBasis > 0 ? totalCost + svcBasis : totalCost;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Quote header band */}
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', px: 3, py: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={800}>{info.name || '(không tên)'}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.85 }}>
          {info.dest || '—'} · {info.days} ngày {info.nights} đêm · {pax} khách
          {info.startDate ? ` · khởi hành ${new Date(info.startDate).toLocaleDateString('vi-VN')}` : ''}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* ── Left: cost by category ── */}
        <Box>
          <SectionLabel>Chi phí theo hạng mục</SectionLabel>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {catRows.map((cat, i) => {
              const pct = totalCost > 0 ? (cat.total / totalCost) * 100 : 0;
              return (
                <Stack
                  key={cat.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    px: 2.25, py: 1.5,
                    borderBottom: i < catRows.length - 1 ? '1px solid rgba(20,150,140,0.08)' : 'none',
                  }}
                >
                  <Box sx={{ fontSize: 18, width: 24, textAlign: 'center' }}>{cat.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography fontSize={13} fontWeight={500}>{cat.label}</Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography fontSize={13} fontWeight={700} sx={{ color: cat.color }}>
                          {fmtVND(cat.total)}
                        </Typography>
                        <Typography fontSize={11} sx={{ color: 'rgba(15,58,74,0.4)' }}>
                          {pax > 0 ? fmtVND(cat.total / pax) : '–'}/khách
                        </Typography>
                      </Box>
                    </Stack>
                    <Box sx={{ height: 5, background: 'rgba(20,150,140,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${pct}%`, background: cat.color }} />
                    </Box>
                  </Box>
                  <Typography
                    fontSize={11} fontWeight={600}
                    sx={{ color: 'rgba(15,58,74,0.4)', minWidth: 38, textAlign: 'right' }}
                  >
                    {pct.toFixed(1)}%
                  </Typography>
                </Stack>
              );
            })}
            <Stack
              direction="row" justifyContent="space-between" alignItems="center"
              sx={{ px: 2.25, py: 1.75, borderTop: '2px solid rgba(20,150,140,0.2)', background: 'rgba(168,230,221,0.2)' }}
            >
              <Typography fontWeight={700} fontSize={15}>Tổng chi phí gốc</Typography>
              <Box sx={{ textAlign: 'right' }}>
                <Typography fontWeight={800} fontSize={20} sx={{ color: LEGACY.teal }}>
                  {fmtVND(totalCost)}
                </Typography>
                <Typography fontSize={12} sx={{ color: 'rgba(15,58,74,0.45)' }}>
                  {pax > 0 ? fmtVND(totalCost / pax) : '–'}/khách
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Box>

        {/* ── Right: pricing ── */}
        <Box>
          <SectionLabel>Định giá bán</SectionLabel>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.75 }}>
            {/* Profit margin */}
            <Box sx={{ mb: 2.25 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography fontSize={14} fontWeight={600}>💹 Profit margin (%)</Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Slider
                    size="small" value={margin} min={0} max={50} step={0.5}
                    onChange={(_, v) => setMargin(v as number)}
                    sx={{ width: 110, color: LEGACY.tealLight }}
                  />
                  <TextField
                    size="small" type="number" value={margin}
                    onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))}
                    slotProps={{ htmlInput: { min: 0, style: { width: 48, textAlign: 'right', color: LEGACY.tealLight, fontWeight: 700 } } }}
                    variant="standard"
                  />
                </Stack>
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ fontSize: 12 }}>
                <Typography fontSize={12} sx={{ color: 'rgba(15,58,74,0.5)' }}>
                  Service Charge Basis (tuỳ chọn)
                </Typography>
                <TextField
                  size="small" type="number" value={svcBasis}
                  onChange={(e) => setSvcBasis(Math.max(0, Number(e.target.value) || 0))}
                  slotProps={{ htmlInput: { min: 0, step: 100000, style: { width: 110, textAlign: 'right', color: LEGACY.tealLight, fontWeight: 700 } } }}
                  variant="standard"
                />
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography fontSize={11} sx={{ color: 'rgba(15,58,74,0.4)' }}>
                  Basis tính lợi nhuận = Chi phí + SC Basis
                </Typography>
                <Typography fontSize={11} sx={{ color: 'rgba(15,58,74,0.4)' }}>{fmtVND(basis)}</Typography>
              </Stack>
              <Stack
                direction="row" justifyContent="space-between"
                sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(20,150,140,0.1)' }}
              >
                <Typography fontSize={12} fontWeight={600} sx={{ color: 'rgba(15,58,74,0.7)' }}>
                  💰 Lợi nhuận thu được
                </Typography>
                <Typography fontSize={14} fontWeight={800} sx={{ color: LEGACY.tealLight }}>
                  {fmtVND(totalProfit)}
                </Typography>
              </Stack>
            </Box>

            {/* VAT */}
            <Box sx={{ mb: 2.25, pt: 1.75, borderTop: '1px solid rgba(20,150,140,0.1)' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography fontSize={14} fontWeight={600}>🧾 Thuế VAT</Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Slider
                    size="small" value={vat} min={0} max={15} step={0.5}
                    onChange={(_, v) => setVat(v as number)}
                    sx={{ width: 110, color: '#f5a623' }}
                  />
                  <TextField
                    size="small" type="number" value={vat}
                    onChange={(e) => setVat(Math.max(0, Number(e.target.value) || 0))}
                    slotProps={{ htmlInput: { min: 0, style: { width: 48, textAlign: 'right', color: '#f5a623', fontWeight: 700 } } }}
                    variant="standard"
                  />
                </Stack>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography fontSize={12} sx={{ color: 'rgba(15,58,74,0.5)' }}>Tiền thuế</Typography>
                <Typography fontSize={12} fontWeight={700} sx={{ color: '#f5a623' }}>{fmtVND(totalVAT)}</Typography>
              </Stack>
            </Box>

            {/* Rounding */}
            <Box sx={{ mb: 2.5, pt: 1.75, borderTop: '1px solid rgba(20,150,140,0.1)' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontSize={14} fontWeight={600}>🔢 Làm tròn</Typography>
                <Stack direction="row" spacing={0.75}>
                  {ROUNDING_OPTS.map((r) => {
                    const active = rounding === r;
                    return (
                      <Button
                        key={r} size="small" onClick={() => setRounding(r)}
                        sx={{
                          minWidth: 0, px: 1.25, py: 0.5, fontSize: 12,
                          fontWeight: active ? 700 : 500,
                          background: active ? LEGACY.headerGradient : '#fff',
                          color: active ? '#fff' : 'rgba(15,58,74,0.6)',
                          border: '1px solid',
                          borderColor: active ? 'transparent' : 'rgba(20,150,140,0.2)',
                          '&:hover': { background: active ? LEGACY.headerGradient : 'rgba(20,150,140,0.06)' },
                        }}
                      >
                        {r / 1000}K
                      </Button>
                    );
                  })}
                </Stack>
              </Stack>
            </Box>

            {/* Final price card */}
            <Box sx={{ background: LEGACY.headerGradient, borderRadius: 2, p: 2.25, color: '#fff' }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, fontSize: 13 }}>
                <Typography fontSize={13} sx={{ opacity: 0.8 }}>Giá vốn/khách</Typography>
                <Typography fontSize={13} fontWeight={600}>{fmtVND(pax > 0 ? totalCost / pax : 0)}</Typography>
              </Stack>
              {svcBasis > 0 && (
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, fontSize: 13 }}>
                  <Typography fontSize={13} sx={{ opacity: 0.8 }}>+ Service Charge Basis</Typography>
                  <Typography fontSize={13} fontWeight={600} sx={{ color: '#ffd6e0' }}>
                    {fmtVND(pax > 0 ? svcBasis / pax : 0)}
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, fontSize: 13 }}>
                <Typography fontSize={13} sx={{ opacity: 0.8 }}>+ Lợi nhuận ({margin}%)</Typography>
                <Typography fontSize={13} fontWeight={600} sx={{ color: '#a8e6dd' }}>
                  {fmtVND(pax > 0 ? totalProfit / pax : 0)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.5, fontSize: 13 }}>
                <Typography fontSize={13} sx={{ opacity: 0.8 }}>+ VAT ({vat}%)</Typography>
                <Typography fontSize={13} fontWeight={600} sx={{ color: LEGACY.gold }}>
                  {fmtVND(pax > 0 ? totalVAT / pax : 0)}
                </Typography>
              </Stack>
              <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.25)', pt: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography fontSize={14} fontWeight={600} sx={{ opacity: 0.85 }}>Giá bán / khách</Typography>
                  <Typography fontWeight={900} fontSize={24}>{fmtVND(roundedPPax)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontSize={13} sx={{ opacity: 0.65 }}>Cả đoàn ({pax} khách)</Typography>
                  <Typography fontSize={16} fontWeight={700} sx={{ color: LEGACY.gold }}>
                    {fmtVND(roundedPPax * pax)}
                  </Typography>
                </Stack>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
