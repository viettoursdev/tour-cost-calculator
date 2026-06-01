import {
  Box, Divider, MenuItem, Paper, Select, Slider, Stack, TextField, Typography,
} from '@mui/material';
import { CatBlock } from './CatBlock';
import { computeTotals, fmtVND } from './calc';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import type { CategoryId, Template } from '@/types';

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

  // Recompute totals on every relevant change. computeTotals reads draft directly,
  // so we pass a shallow projection. (Reading the whole draft via a selector would
  // re-render this component on every keystroke; instead we recompute from slices.)
  const draftSnapshot = { template, info: { name: '', dest: '', days: 1, nights: 0, startDate: null }, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled, currentQuoteId: null };
  const totals = computeTotals(draftSnapshot);

  const cats = getCATS(template);

  return (
    <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
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
      </Box>

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
