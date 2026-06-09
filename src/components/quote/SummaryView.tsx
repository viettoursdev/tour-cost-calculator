import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { catTotal, computeTotals, fmtVND } from './calc';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import { LEGACY } from '@/theme';
import type { CategoryId, Template } from '@/types';

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

  const totals = computeTotals({
    template, info, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled,
    currentQuoteId: null,
  });
  const cats = getCATS(template);

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Card variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ background: LEGACY.headerGradient, color: '#fff', px: 3, py: 2.5 }}>
          <Typography variant="h5" fontWeight={800}>{info.name || '(không tên)'}</Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            {info.dest || '—'} · {info.days} ngày {info.nights} đêm · {pax} khách
            {info.startDate ? ` · khởi hành ${new Date(info.startDate).toLocaleDateString('vi-VN')}` : ''}
          </Typography>
        </Box>
        <CardContent>

          <Typography variant="overline" color="text.secondary">Chi tiết theo hạng mục</Typography>
          <Stack spacing={0.5} sx={{ mt: 1, mb: 2 }}>
            {cats
              .filter((c) => catEnabled[c.id as CategoryId] && (items[c.id as CategoryId]?.length ?? 0) > 0)
              .map((c) => {
                const t = catTotal(items[c.id as CategoryId] ?? [], rates, pax);
                return (
                  <Stack key={c.id} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{c.icon} {c.label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtVND(t)}</Typography>
                  </Stack>
                );
              })}
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={0.5}>
            <Row label="Cost" value={fmtVND(totals.totalCost)} />
            {svcBasis > 0 && <Row label="Svc basis" value={fmtVND(svcBasis)} />}
            <Row label={`Profit (${margin}%)`} value={fmtVND(totals.totalProfit)} />
            <Row label={`VAT (${vat}%)`} value={fmtVND(totals.totalVAT)} />
            <Divider sx={{ my: 1 }} />
            <Row label="Selling /pax" value={fmtVND(totals.roundedPPax)} strong />
            <Row label="Grand total" value={fmtVND(totals.grandTotal)} strong />
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" fontWeight={strong ? 700 : 400}>{label}</Typography>
      <Typography
        variant="body2"
        fontWeight={strong ? 800 : 600}
        sx={strong ? { color: LEGACY.teal } : undefined}
      >
        {value}
      </Typography>
    </Stack>
  );
}
