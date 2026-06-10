import { useState } from 'react';
import {
  Box, Button, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { CatBlock } from './CatBlock';
import { GroupSizeTabs } from './GroupSizeTabs';
import { HistPanel } from './HistPanel';
import { CurrencySelector } from './CurrencySelector';
import { DMCComparePanel } from './DMCComparePanel';
import { VisaPickerModal } from './VisaPickerModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { computeTotals, fmtVND } from './calc';
import { fmtOutput } from '@/lib/currency';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import type { CategoryId, Item, OutputCurrency, Template } from '@/types';

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

  const outputCurrency = (useQuoteStore((s) => s.draft.outputCurrency) ?? 'USD') as OutputCurrency;
  const dmcPrices = useQuoteStore((s) => s.draft.dmcPrices);
  const dmcMargin = useQuoteStore((s) => s.draft.dmcMargin);
  const setOutputCurrency = useQuoteStore((s) => s.setOutputCurrency);
  const setDmcPrice = useQuoteStore((s) => s.setDmcPrice);
  const setDmcMargin = useQuoteStore((s) => s.setDmcMargin);

  // Rate-card picker (opened from each category's "📋 Rate card" header button).
  const [visaPickerOpen, setVisaPickerOpen] = useState(false);
  const [picker, setPicker] = useState<
    | { kind: 'hotel'; catId: CategoryId }
    | { kind: 'rate'; catId: CategoryId; type: string; label: string }
    | null
  >(null);

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

        <GroupSizeTabs />

        {cats.map((cat) => {
          const catId = cat.id as CategoryId;
          let onOpenRate: (() => void) | undefined;
          if (cat.id === 'visa') onOpenRate = () => setVisaPickerOpen(true);
          else if (cat.id === 'hotel') onOpenRate = () => setPicker({ kind: 'hotel', catId: 'hotel' });
          else if (cat.rateCard) {
            const type = cat.rateCard;
            const label = cat.label;
            onOpenRate = () => setPicker({ kind: 'rate', catId, type, label });
          }
          return (
            <CatBlock
              key={cat.id}
              cat={cat}
              items={items[catId] ?? []}
              enabled={catEnabled[catId]}
              pax={pax}
              rates={rates}
              onToggleCat={() => toggleCat(catId)}
              onUpd={(it) => updItem(catId, it)}
              onAdd={() => addItem(catId)}
              onDel={(id) => delItem(catId, id)}
              onOpenRate={onOpenRate}
            />
          );
        })}

        <VisaPickerModal
          open={visaPickerOpen}
          onClose={() => setVisaPickerOpen(false)}
          onPick={(lines: Partial<Item>[]) => lines.forEach((l) => addItem('visa', l))}
        />

        {picker?.kind === 'hotel' && (
          <HotelModal
            open
            pax={pax}
            template={template}
            onClose={() => setPicker(null)}
            onPick={(line) => { addItem(picker.catId, line); setPicker(null); }}
          />
        )}

        {picker?.kind === 'rate' && (
          <RateCardModal
            open
            type={picker.type}
            label={picker.label}
            onClose={() => setPicker(null)}
            onPick={(line) => { addItem(picker.catId, line); setPicker(null); }}
          />
        )}

        {isDMC && dmcMargin !== undefined && (() => {
          const marginVND = dmcMargin.type === 'percent'
            ? Math.round(totals.totalCost * (dmcMargin.value || 0) / 100)
            : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
          const totalWithMarginVND = totals.totalCost + marginVND;
          return (
            <Paper
              variant="outlined"
              sx={{ borderColor: 'rgba(15,58,74,0.25)', borderRadius: 1.5, p: 1.75, mt: 1.25 }}
            >
              <Stack direction="row" alignItems="center" gap={1.75} flexWrap="wrap">
                <Typography fontWeight={700} fontSize={14} color="#0f3a4a" sx={{ flex: 1, minWidth: 180 }}>
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
                        background: dmcMargin.type === opt.v ? '#0f3a4a' : 'rgba(15,58,74,0.08)',
                        color: dmcMargin.type === opt.v ? '#fff' : '#0f3a4a',
                        border: '1.5px solid rgba(15,58,74,0.3)',
                        '&:hover': {
                          background: dmcMargin.type === opt.v ? '#0a2a38' : 'rgba(15,58,74,0.15)',
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
                    slotProps={{ htmlInput: { min: 0, step: dmcMargin.type === 'percent' ? 0.5 : 1, style: { textAlign: 'right', width: 80, fontWeight: 700, color: '#0f3a4a' } } }}
                    placeholder="0"
                  />
                  <Typography fontSize={13} color="#0f3a4a" fontWeight={700}>
                    {dmcMargin.type === 'percent' ? '%' : outputCurrency}
                  </Typography>
                </Stack>
                <Box sx={{ textAlign: 'right', minWidth: 140 }}>
                  <Typography fontSize={12} color="rgba(15,58,74,0.5)">
                    Margin:{' '}
                    <Typography component="strong" color="#0f3a4a">
                      {fmtOutput(marginVND, outputCurrency, rates)}
                    </Typography>
                  </Typography>
                  <Typography fontSize={13} fontWeight={800} color="#0f3a4a" mt={0.25}>
                    Tổng + margin:{' '}
                    <Typography component="span" color="#0f3a4a">
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
              breakdownTotalVNDAt={(gs) => {
                // Recompute the breakdown cost AT this group size (per-pax items
                // scale with pax), then add the DMC margin.
                const t = computeTotals({ ...draftSnapshot, pax: gs });
                const m = dmcMargin.type === 'percent'
                  ? Math.round(t.totalCost * (dmcMargin.value || 0) / 100)
                  : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
                return t.totalCost + m;
              }}
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

        {!isDMC && <HistPanel />}
      </Box>
    </Box>
  );
}
