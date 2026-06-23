import { useMemo } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { catTotal, computeTotals, fmtVND } from './calc';
import { getCATS } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import { EmailLinksPanel } from '@/components/email/EmailLinksPanel';
import type { CategoryId, Template } from '@/types';

type KpiPalette = { from: string; to: string };

const KPI_GRADIENTS: Record<'cost' | 'sc' | 'vat' | 'sell', KpiPalette> = {
  cost: { from: '#3498db', to: '#2980b9' },
  sc:   { from: '#9b59b6', to: '#8e44ad' },
  vat:  { from: '#f5a623', to: '#e67e22' },
  sell: { from: '#dc3250', to: '#c0392b' },
};

export function DashboardView() {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const quoteName = useQuoteStore((s) => s.draft.info?.name);
  const items = useQuoteStore((s) => s.draft.items);
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const margin = useQuoteStore((s) => s.draft.margin);
  const vat = useQuoteStore((s) => s.draft.vat);
  const svcBasis = useQuoteStore((s) => s.draft.svcBasis);
  const rounding = useQuoteStore((s) => s.draft.rounding);

  // Same draftSnapshot trick as CostView — keeps this component out of full-draft re-renders.
  const totals = useMemo(() => {
    return computeTotals({
      template,
      info: { name: '', dest: '', days: 1, nights: 0, startDate: null },
      pax,
      rates,
      margin,
      vat,
      svcBasis,
      rounding,
      items,
      catEnabled,
      currentQuoteId: null,
    });
  }, [template, items, catEnabled, pax, rates, margin, vat, svcBasis, rounding]);

  const cats = useMemo(() => getCATS(template), [template]);

  const catRows = useMemo(() => {
    return cats.map((c) => {
      const total = catEnabled[c.id as CategoryId]
        ? catTotal(items[c.id as CategoryId] ?? [], rates, pax)
        : 0;
      return { ...c, total, enabled: catEnabled[c.id as CategoryId] };
    });
  }, [cats, items, catEnabled, rates, pax]);

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      {/* A. Hero banner */}
      <Paper
        elevation={0}
        sx={{
          background: 'linear-gradient(135deg, #0d7a6a, #14a08c)',
          color: '#fff',
          p: 3,
          borderRadius: 2,
          mb: 3,
        }}
      >
        <Typography variant="h6" fontWeight={800}>
          📊 Phân tích biên lợi nhuận
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
          Chi phí {pax} khách → Giá bán {fmtVND(totals.roundedPPax)}/khách
        </Typography>
      </Paper>

      {/* B. 4 KPI cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        <KpiCard
          palette={KPI_GRADIENTS.cost}
          label="Tổng chi phí gốc"
          value={fmtVND(totals.totalCost)}
          sub={pax > 0 ? `${fmtVND(totals.totalCost / pax)}/khách` : ''}
        />
        <KpiCard
          palette={KPI_GRADIENTS.sc}
          label={`Service Charge (${margin}%)`}
          value={fmtVND(totals.totalProfit)}
          sub={pax > 0 ? `${fmtVND(totals.totalProfit / pax)}/khách` : ''}
        />
        <KpiCard
          palette={KPI_GRADIENTS.vat}
          label={`VAT (${vat}%)`}
          value={fmtVND(totals.totalVAT)}
          sub={pax > 0 ? `${fmtVND(totals.totalVAT / pax)}/khách` : ''}
        />
        <KpiCard
          palette={KPI_GRADIENTS.sell}
          label="Giá bán cả đoàn"
          value={fmtVND(totals.grandTotal)}
          sub={`${fmtVND(totals.roundedPPax)}/khách`}
        />
      </Box>

      {/* C. Per-category breakdown */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>
          💰 Phân tích chi phí từng hạng mục
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 1.5,
          }}
        >
          {catRows
            .filter((c) => c.enabled && c.total > 0)
            .map((cat) => {
              const costPct = totals.totalCost > 0 ? (cat.total / totals.totalCost) * 100 : 0;
              const marginAlloc =
                totals.totalCost > 0 ? (cat.total / totals.totalCost) * totals.totalProfit : 0;
              const profitPct =
                cat.total + marginAlloc > 0
                  ? (marginAlloc / (cat.total + marginAlloc)) * 100
                  : 0;
              return (
                <Box
                  key={cat.id}
                  sx={{
                    bgcolor: `${cat.color}10`,
                    border: `1px solid ${cat.color}40`,
                    borderRadius: 1.5,
                    p: 2,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                    <Box sx={{ fontSize: 20 }}>{cat.icon}</Box>
                    <Typography fontWeight={700}>{cat.label}</Typography>
                  </Stack>
                  <Stack spacing={0.5}>
                    <StatRow
                      label="Chi phí gốc"
                      value={fmtVND(cat.total)}
                      valueColor={cat.color}
                    />
                    <StatRow
                      label="% của tổng"
                      value={`${costPct.toFixed(1)}%`}
                      valueColor={cat.color}
                    />
                    <StatRow
                      label="Service charge phân bổ"
                      value={fmtVND(marginAlloc)}
                      valueColor="primary.main"
                    />
                    <Divider sx={{ my: 0.5 }} />
                    <StatRow
                      label="Margin %"
                      value={`${profitPct.toFixed(1)}%`}
                      valueColor={cat.color}
                      valueBold
                    />
                  </Stack>
                </Box>
              );
            })}
        </Box>
      </Paper>

      {/* D. Full vs per-pax summary */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>
          📈 Tóm tắt lợi nhuận
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 3,
            bgcolor: 'rgba(20,150,140,0.05)',
            borderRadius: 1.5,
            p: 2,
          }}
        >
          <SummaryColumn
            title={`Cả đoàn (${pax} khách)`}
            rows={[
              { label: 'Tổng chi phí gốc', value: totals.totalCost, color: 'text.primary' },
              { label: `Service Charge ${margin}%`, value: totals.totalProfit, color: 'primary.main' },
              { label: `VAT ${vat}%`, value: totals.totalVAT, color: 'warning.main' },
              { label: 'Giá bán cả đoàn', value: totals.grandTotal, color: 'secondary.main', big: true },
            ]}
          />
          <SummaryColumn
            title="/ Khách"
            rows={[
              { label: 'Giá vốn', value: pax > 0 ? totals.totalCost / pax : 0, color: 'text.primary' },
              { label: 'Service Charge', value: pax > 0 ? totals.totalProfit / pax : 0, color: 'primary.main' },
              { label: 'VAT', value: pax > 0 ? totals.totalVAT / pax : 0, color: 'warning.main' },
              { label: 'Giá bán / khách', value: totals.roundedPPax, color: 'secondary.main', big: true },
            ]}
          />
        </Box>
      </Paper>

      {/* E. Email liên quan (hiện khi báo giá đã lưu đám mây) */}
      {currentQuoteId && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mt: 3 }}>
          <EmailLinksPanel
            targetType="quote" targetId={currentQuoteId} targetName={quoteName || undefined}
            searchHint={quoteName || ''}
          />
        </Paper>
      )}
    </Box>
  );
}

// ────────── Local helper components ──────────

function KpiCard({
  palette, label, value, sub,
}: {
  palette: KpiPalette;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
        color: '#fff',
        p: 2,
        borderRadius: 2,
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ opacity: 0.75, mt: 0.5, display: 'block' }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

function StatRow({
  label, value, valueColor, valueBold,
}: {
  label: string;
  value: string;
  valueColor: string;
  valueBold?: boolean;
}) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ color: valueColor, fontWeight: valueBold ? 800 : 700 }}>
        {value}
      </Typography>
    </Stack>
  );
}

type SummaryRow = { label: string; value: number; color: string; big?: boolean };

function SummaryColumn({ title, rows }: { title: string; rows: SummaryRow[] }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
        {title}
      </Typography>
      <Stack spacing={1}>
        {rows.map((r, i) => (
          <Box key={i}>
            <Stack direction="row" justifyContent="space-between">
              <Typography
                variant={r.big ? 'body2' : 'caption'}
                sx={{ color: r.color, fontWeight: r.big ? 700 : 500 }}
              >
                {r.label}
              </Typography>
              <Typography
                variant={r.big ? 'body1' : 'caption'}
                sx={{ color: r.color, fontWeight: r.big ? 900 : 700 }}
              >
                {fmtVND(r.value)}
              </Typography>
            </Stack>
            {i < rows.length - 1 && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
