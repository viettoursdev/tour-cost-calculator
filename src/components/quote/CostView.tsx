import {
  Box, Button, Divider, MenuItem, Paper, Select, Slider, Stack, TextField, Typography,
} from '@mui/material';
import { CatBlock } from './CatBlock';
import { CurrencySelector } from './CurrencySelector';
import { DMCComparePanel } from './DMCComparePanel';
import { computeTotals, fmtVND } from './calc';
import { fmtOutput } from '@/lib/currency';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import type { CategoryId, OutputCurrency, Template } from '@/types';

const ROUNDING_STEPS = [1000, 10000, 50000, 100000, 500000, 1000000];

export function CostView() {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const items = useQuoteStore((s) => s.draft.items);
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const margin = useQuoteStore((s) => s.draft.margin);
  const vat = useQuoteStore((s) => s.draft.vat);
  const svcBasis = useQuoteStore((s) => s.draft.svcBasis);
  const rounding = useQuoteStore((s) => s.draft.rounding);

  const toggleCat = useQuoteStore((s) => s.toggleCat);
  const addItem = useQuoteStore((s) => s.addItem);
  const updItem = useQuoteStore((s) => s.updItem);
  const delItem = useQuoteStore((s) => s.delItem);
  const setMargin = useQuoteStore((s) => s.setMargin);
  const setVat = useQuoteStore((s) => s.setVat);
  const setSvcBasis = useQuoteStore((s) => s.setSvcBasis);
  const setRounding = useQuoteStore((s) => s.setRounding);

  const outputCurrency = (useQuoteStore((s) => s.draft.outputCurrency) ?? 'USD') as OutputCurrency;
  const dmcPrices = useQuoteStore((s) => s.draft.dmcPrices);
  const dmcMargin = useQuoteStore((s) => s.draft.dmcMargin);
  const setOutputCurrency = useQuoteStore((s) => s.setOutputCurrency);
  const setDmcPrice = useQuoteStore((s) => s.setDmcPrice);
  const setDmcMargin = useQuoteStore((s) => s.setDmcMargin);

  const isDMC = template === 'dmc';

  // Recompute totals on every relevant change. computeTotals reads draft directly,
  // so we pass a shallow projection. (Reading the whole draft via a selector would
  // re-render this component on every keystroke; instead we recompute from slices.)
  const draftSnapshot = { template, info: { name: '', dest: '', days: 1, nights: 0, startDate: null }, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled, currentQuoteId: null };
  const totals = computeTotals(draftSnapshot);

  const cats = getCATS(template);

  return (
    <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {isDMC && (
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.75} flexWrap="wrap" gap={1.25}>
            <Typography fontSize={14} fontWeight={700} color="rgba(15,58,74,0.6)">
              📋 Breakdown chi phí DMC — nhập giá theo từng hạng mục
            </Typography>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <Typography fontSize={12} color="rgba(15,58,74,0.5)">Hiển thị tổng theo:</Typography>
              <CurrencySelector value={outputCurrency} onChange={setOutputCurrency} />
            </Stack>
          </Stack>
        )}

        {cats.map((cat) => (
          <CatBlock
            key={cat.id}
            cat={cat}
            items={items[cat.id as CategoryId] ?? []}
            enabled={catEnabled[cat.id as CategoryId]}
            pax={pax}
            rates={rates}
            onToggleCat={() => toggleCat(cat.id as CategoryId)}
            onUpd={(it) => updItem(cat.id as CategoryId, it)}
            onAdd={() => addItem(cat.id as CategoryId)}
            onDel={(id) => delItem(cat.id as CategoryId, id)}
          />
        ))}

        {isDMC && dmcMargin !== undefined && (() => {
          const marginVND = dmcMargin.type === 'percent'
            ? Math.round(totals.totalCost * (dmcMargin.value || 0) / 100)
            : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
          const totalWithMarginVND = totals.totalCost + marginVND;
          return (
            <Paper
              variant="outlined"
              sx={{ borderColor: 'rgba(142,68,173,0.25)', borderRadius: 1.5, p: 1.75, mt: 1.25 }}
            >
              <Stack direction="row" alignItems="center" gap={1.75} flexWrap="wrap">
                <Typography fontWeight={700} fontSize={14} color="#8e44ad" sx={{ flex: 1, minWidth: 180 }}>
                  💼 Profit Margin & Service Charge
                </Typography>
                <Stack direction="row" gap={0.75}>
                  {([
                    { v: 'percent' as const, l: '% tổng chi phí' },
                    { v: 'fixed'   as const, l: 'Số tiền cố định' },
                  ]).map((opt) => (
                    <Button
                      key={opt.v}
                      size="small"
                      onClick={() => setDmcMargin({ type: opt.v, value: 0 })}
                      sx={{
                        px: 1.5, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 600, textTransform: 'none',
                        background: dmcMargin.type === opt.v ? '#8e44ad' : 'rgba(142,68,173,0.08)',
                        color: dmcMargin.type === opt.v ? '#fff' : '#8e44ad',
                        border: '1.5px solid rgba(142,68,173,0.3)',
                        '&:hover': {
                          background: dmcMargin.type === opt.v ? '#7d3c98' : 'rgba(142,68,173,0.15)',
                        },
                      }}
                    >
                      {opt.l}
                    </Button>
                  ))}
                </Stack>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <TextField
                    type="number"
                    size="small"
                    value={dmcMargin.value || ''}
                    onChange={(e) => setDmcMargin({ value: +e.target.value })}
                    slotProps={{ htmlInput: { min: 0, step: dmcMargin.type === 'percent' ? 0.5 : 1, style: { textAlign: 'right', width: 80, fontWeight: 700, color: '#8e44ad' } } }}
                    placeholder="0"
                  />
                  <Typography fontSize={13} color="#8e44ad" fontWeight={700}>
                    {dmcMargin.type === 'percent' ? '%' : outputCurrency}
                  </Typography>
                </Stack>
                <Box sx={{ textAlign: 'right', minWidth: 140 }}>
                  <Typography fontSize={12} color="rgba(15,58,74,0.5)">
                    Margin:{' '}
                    <Typography component="strong" color="#8e44ad">
                      {fmtOutput(marginVND, outputCurrency, rates)}
                    </Typography>
                  </Typography>
                  <Typography fontSize={13} fontWeight={800} color="#0f3a4a" mt={0.25}>
                    Tổng + margin:{' '}
                    <Typography component="span" color="#8e44ad">
                      {fmtOutput(totalWithMarginVND, outputCurrency, rates)}
                    </Typography>
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          );
        })()}

        {isDMC && dmcPrices && dmcMargin && (() => {
          const marginVND = dmcMargin.type === 'percent'
            ? Math.round(totals.totalCost * (dmcMargin.value || 0) / 100)
            : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
          return (
            <DMCComparePanel
              totalCostVND={totals.totalCost + marginVND}
              pax={pax}
              rates={rates}
              outputCurrency={outputCurrency}
              dmcPrices={dmcPrices}
              setDmcPrice={setDmcPrice}
            />
          );
        })()}

        {isDMC && (
          <Paper
            variant="outlined"
            sx={{ borderRadius: 2, p: 2.5, mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}
          >
            <Typography color="rgba(15,58,74,0.55)" fontSize={13}>
              {Object.values(items).reduce((s, arr) => s + (arr?.length ?? 0), 0)} dòng · Tổng: {fmtOutput(totals.totalCost, outputCurrency, rates)}
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography color="rgba(15,58,74,0.5)" fontSize={12}>Tổng chi phí gốc cả đoàn</Typography>
              <Typography color="#0d7a6a" fontWeight={800} fontSize={22}>
                {fmtVND(totals.totalCost)}
              </Typography>
            </Box>
          </Paper>
        )}
      </Box>

      {!isDMC && (
        <Paper sx={{ width: 340, p: 2, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
          <Typography variant="overline" color="text.secondary">TỔNG CHI PHÍ</Typography>

          <Stack spacing={1} sx={{ mt: 1 }}>
            <Row label="Cost"        value={fmtVND(totals.totalCost)} />
            <Row label="Svc basis"   value={`+ ${fmtVND(svcBasis)}`} />
            <Row label={`Profit (${margin}%)`}  value={`+ ${fmtVND(totals.totalProfit)}`} />
            <Row label={`VAT (${vat}%)`}       value={`+ ${fmtVND(totals.totalVAT)}`} />
            <Divider />
            <Row label="Selling /pax (raw)" value={fmtVND(totals.sellingPPax)} muted />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ flex: 1 }}>Rounding step</Typography>
              <Select size="small" value={rounding} onChange={(e) => setRounding(Number(e.target.value))}>
                {ROUNDING_STEPS.map((s) => (
                  <MenuItem key={s} value={s}>{s.toLocaleString('vi-VN')} ₫</MenuItem>
                ))}
              </Select>
            </Stack>
            <Row label="Selling /pax" value={fmtVND(totals.roundedPPax)} strong />
            <Row label="Grand total"  value={fmtVND(totals.grandTotal)} strong />
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={2}>
            <Stack>
              <Typography variant="caption">Svc basis (VND)</Typography>
              <TextField
                size="small" type="number" value={svcBasis}
                onChange={(e) => setSvcBasis(Number(e.target.value) || 0)}
                slotProps={{ htmlInput: { min: 0, step: 100000 } }}
              />
            </Stack>
            <Stack>
              <Typography variant="caption">Margin {margin}%</Typography>
              <Slider size="small" value={margin} min={0} max={50} step={0.5}
                onChange={(_, v) => setMargin(v as number)} />
            </Stack>
            <Stack>
              <Typography variant="caption">VAT {vat}%</Typography>
              <Slider size="small" value={vat} min={0} max={20} step={0.5}
                onChange={(_, v) => setVat(v as number)} />
            </Stack>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} fontWeight={strong ? 700 : 400}>{label}</Typography>
      <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} fontWeight={strong ? 800 : 600}>{value}</Typography>
    </Stack>
  );
}
