import { useEffect, useMemo } from 'react';
import {
  Alert, Box, Chip, Divider, LinearProgress, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { useQuoteStore } from '@/stores/quoteStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { getCATS } from './constants';
import { fmtVND } from './calc';
import { computeSettlement, slugifyTourKey } from './paymentUtils';

const fmtPct = (n: number): string => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`;
const fmtDelta = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtVND(Math.abs(n))}`;

export function SettlementView() {
  const draft = useQuoteStore((s) => s.draft);
  const tourName = draft.info.name ?? '';
  const tourKey = slugifyTourKey(tourName);
  const template = draft.template;

  const slot = usePaymentStore((s) => s.slots[tourKey]);
  const payments = useMemo(() => slot?.data.payments ?? {}, [slot]);
  const customItems = useMemo(() => slot?.data.customItems ?? [], [slot]);

  useEffect(() => {
    if (!tourName.trim()) return;
    const store = usePaymentStore.getState();
    store.ensureSubscribed(tourKey);
    return () => {
      usePaymentStore.getState().releaseSubscription(tourKey);
    };
  }, [tourKey, tourName]);

  const activeCats = useMemo(() => (template ? getCATS(template) : []), [template]);

  const s = useMemo(
    () => computeSettlement(draft, activeCats, payments, customItems),
    [draft, activeCats, payments, customItems],
  );

  if (!tourName.trim()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Đặt tên tour ở mục Thông tin trước khi quyết toán.
        </Alert>
      </Box>
    );
  }

  // Biên lợi thật thấp/âm hơn dự kiến → cảnh báo màu.
  const overrun = s.costVariance > 0;
  const marginColor = s.actualMarginPct < 0 ? '#dc3250' : s.actualMarginPct < s.plannedMarginPct ? '#e67e22' : '#27ae60';
  const paidPct = s.actualCost > 0 ? Math.round((s.paidCost / s.actualCost) * 100) : 0;
  const per = (n: number): string => (s.pax > 0 ? `${fmtVND(n / s.pax)}/khách` : '');

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      {/* A. Hero — biên lợi nhuận thật */}
      <Paper
        elevation={0}
        sx={{
          background: 'linear-gradient(135deg, #0f1c2d, #16314a)',
          color: '#fff',
          p: 3,
          borderRadius: 2,
          mb: 3,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap rowGap={1}>
          <Box>
            <Typography variant="h6" fontWeight={800}>
              🧾 Quyết toán tour — dự toán vs thực chi
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              {tourName} · {s.pax} khách · Doanh thu thuần {fmtVND(s.netRevenue)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Biên lợi nhuận thật</Typography>
            <Typography variant="h4" fontWeight={900} sx={{ color: marginColor, lineHeight: 1.1 }}>
              {fmtPct(s.actualMarginPct)}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              dự kiến {fmtPct(s.plannedMarginPct)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* B. 4 KPI: dự toán · thực chi · chênh lệch · lãi thật */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        <KpiCard from="#3498db" to="#2980b9" label="Giá vốn dự toán" value={fmtVND(s.budgetCost)} sub={per(s.budgetCost)} />
        <KpiCard from="#9b59b6" to="#8e44ad" label="Chi thực tế (đã chốt)" value={fmtVND(s.actualCost)} sub={per(s.actualCost)} />
        <KpiCard
          from={overrun ? '#dc3250' : '#27ae60'}
          to={overrun ? '#c0392b' : '#1e9e5a'}
          label={overrun ? 'Bội chi giá vốn' : 'Tiết kiệm giá vốn'}
          value={fmtDelta(s.costVariance)}
          sub={s.budgetCost > 0 ? `${fmtPct((s.costVariance / s.budgetCost) * 100)} so dự toán` : ''}
        />
        <KpiCard
          from="#0d7a6a" to="#14a08c"
          label="Lãi gộp thật"
          value={fmtVND(s.actualProfit)}
          sub={`dự kiến ${fmtVND(s.plannedProfit)}`}
        />
      </Box>

      {/* C. Tiến độ thực chi tiền */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} color="primary">
            💸 Đã thực chi tiền
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            {fmtVND(s.paidCost)} / {fmtVND(s.actualCost)} ({paidPct}%)
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, paidPct)}
          sx={{ height: 10, borderRadius: 5, '& .MuiLinearProgress-bar': { borderRadius: 5 } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
          Còn phải chi {fmtVND(Math.max(0, s.actualCost - s.paidCost))} cho nhà cung cấp.
        </Typography>
      </Paper>

      {/* D. Đối chiếu từng hạng mục */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>
          📊 Đối chiếu giá vốn từng hạng mục
        </Typography>

        {/* Header row */}
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '1.6fr 1fr 1fr 1.1fr 1fr', gap: 1, px: 1.5, mb: 1 }}>
          <HeadCell>Hạng mục</HeadCell>
          <HeadCell align="right">Dự toán</HeadCell>
          <HeadCell align="right">Thực chi</HeadCell>
          <HeadCell align="right">Chênh lệch</HeadCell>
          <HeadCell align="right">Đã trả</HeadCell>
        </Box>

        <Stack spacing={0.75}>
          {s.byCat.map((c) => {
            const isOverrun = c.delta > 0;
            const isSaving = c.delta < 0;
            const unbudgeted = c.budget === 0 && c.actual > 0;
            return (
              <Box
                key={c.catId}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 1fr 1.1fr 1fr' },
                  gap: 1,
                  alignItems: 'center',
                  px: 1.5, py: 1,
                  borderRadius: 1.5,
                  bgcolor: `${c.color}0d`,
                  border: `1px solid ${c.color}33`,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                  <Box sx={{ fontSize: 18 }}>{c.icon}</Box>
                  <Typography fontWeight={700} fontSize={14} noWrap>{c.label}</Typography>
                  {unbudgeted && (
                    <Tooltip title="Phát sinh ngoài dự toán">
                      <Chip label="Phát sinh" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: 'rgba(245,166,35,0.15)', color: '#d18a13' }} />
                    </Tooltip>
                  )}
                </Stack>
                <Cell label="Dự toán" align="right">{fmtVND(c.budget)}</Cell>
                <Cell label="Thực chi" align="right" bold>{fmtVND(c.actual)}</Cell>
                <Cell label="Chênh lệch" align="right" color={isOverrun ? '#dc3250' : isSaving ? '#27ae60' : 'text.disabled'} bold>
                  {c.delta === 0 ? '—' : fmtDelta(c.delta)}
                </Cell>
                <Cell label="Đã trả" align="right" color="text.secondary">{fmtVND(c.paid)}</Cell>
              </Box>
            );
          })}

          {s.byCat.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Chưa có dữ liệu chi phí. Nhập báo giá và theo dõi thanh toán để quyết toán.
            </Typography>
          )}
        </Stack>

        {/* Tổng */}
        {s.byCat.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 1fr 1.1fr 1fr' },
                gap: 1, alignItems: 'center', px: 1.5,
              }}
            >
              <Typography fontWeight={900} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>Tổng giá vốn</Typography>
              <Cell label="Dự toán" align="right" bold>{fmtVND(s.budgetCost)}</Cell>
              <Cell label="Thực chi" align="right" bold>{fmtVND(s.actualCost)}</Cell>
              <Cell label="Chênh lệch" align="right" bold color={s.costVariance > 0 ? '#dc3250' : s.costVariance < 0 ? '#27ae60' : 'text.disabled'}>
                {s.costVariance === 0 ? '—' : fmtDelta(s.costVariance)}
              </Cell>
              <Cell label="Đã trả" align="right" bold color="text.secondary">{fmtVND(s.paidCost)}</Cell>
            </Box>
          </>
        )}
      </Paper>

      {/* E. Tóm tắt lợi nhuận: dự kiến vs thật */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>
          📈 Lợi nhuận: dự kiến vs thật
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
          <ProfitColumn
            title="📋 Theo dự toán"
            revenue={s.netRevenue}
            cost={s.budgetCost}
            profit={s.plannedProfit}
            marginPct={s.plannedMarginPct}
            costLabel="Giá vốn dự toán"
            accent="#3498db"
          />
          <ProfitColumn
            title="🧾 Theo thực chi"
            revenue={s.netRevenue}
            cost={s.actualCost}
            profit={s.actualProfit}
            marginPct={s.actualMarginPct}
            costLabel="Chi thực tế"
            accent={marginColor}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
          Doanh thu thuần = giá bán cả đoàn ({fmtVND(s.grandTotal)}) − VAT ({fmtVND(s.totalVAT)}). Lãi gộp = doanh thu thuần − giá vốn (chưa trừ chi phí quản lý/bán hàng).
        </Typography>
      </Paper>
    </Box>
  );
}

// ────────── helpers ──────────

function KpiCard({ from, to, label, value, sub }: { from: string; to: string; label: string; value: string; sub: string }) {
  return (
    <Paper elevation={0} sx={{ background: `linear-gradient(135deg, ${from}, ${to})`, color: '#fff', p: 2, borderRadius: 2 }}>
      <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 600 }}>{label}</Typography>
      <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
      {sub && <Typography variant="caption" sx={{ opacity: 0.75, mt: 0.5, display: 'block' }}>{sub}</Typography>}
    </Paper>
  );
}

function HeadCell({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textAlign: align ?? 'left' }}>
      {children}
    </Typography>
  );
}

function Cell({
  children, label, align, color, bold,
}: { children: React.ReactNode; label: string; align?: 'right'; color?: string; bold?: boolean }) {
  return (
    <Box sx={{ textAlign: align ?? 'left' }}>
      <Typography variant="caption" color="text.disabled" sx={{ display: { xs: 'block', sm: 'none' } }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: color ?? 'text.primary', fontWeight: bold ? 800 : 600, fontSize: 13.5 }}>
        {children}
      </Typography>
    </Box>
  );
}

function ProfitColumn({
  title, revenue, cost, profit, marginPct, costLabel, accent,
}: { title: string; revenue: number; cost: number; profit: number; marginPct: number; costLabel: string; accent: string }) {
  const rows = [
    { label: 'Doanh thu thuần', value: fmtVND(revenue), color: 'text.primary' as string },
    { label: costLabel, value: fmtVND(cost), color: 'text.primary' as string },
  ];
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 1, display: 'block' }}>{title}</Typography>
      <Stack spacing={1}>
        {rows.map((r, i) => (
          <Box key={i}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">{r.label}</Typography>
              <Typography variant="caption" sx={{ color: r.color, fontWeight: 700 }}>{r.value}</Typography>
            </Stack>
            <Divider sx={{ mt: 1 }} />
          </Box>
        ))}
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" sx={{ color: accent, fontWeight: 800 }}>Lãi gộp</Typography>
          <Stack alignItems="flex-end">
            <Typography variant="body1" sx={{ color: accent, fontWeight: 900 }}>{fmtVND(profit)}</Typography>
            <Typography variant="caption" sx={{ color: accent, fontWeight: 700 }}>{fmtPct(marginPct)}</Typography>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
