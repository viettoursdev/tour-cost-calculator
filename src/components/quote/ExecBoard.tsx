import { useMemo } from 'react';
import { Box, Button, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore, type QuoteViewKey } from '@/stores/quoteStore';
import { daysUntil } from '@/lib/dateUtils';
import { fmtVND } from './calc';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './constants';
import type { CloudQuoteEntry, QuoteStatus } from '@/types';

const OPEN: QuoteStatus[] = ['in_progress', 'sent', 'negotiating'];
const LOST: QuoteStatus[] = ['not_selected', 'cancelled'];

/** Rút gọn VND cho thẻ KPI: 1.250.000.000 → "1,3 tỷ". */
const fmtShort = (n: number): string => {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' tỷ';
  if (Math.abs(n) >= 1e6) return Math.round(n / 1e6).toLocaleString('vi-VN') + ' tr';
  return fmtVND(n);
};

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 150px', minWidth: 150, borderTop: `3px solid ${color ?? '#0d7a6a'}` }}>
      <Typography fontWeight={900} fontSize={20} sx={{ color: color ?? 'text.primary', lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
    </Paper>
  );
}

function Panel({ title, color, onAll, children }: { title: string; color: string; onAll?: () => void; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, flex: '1 1 360px', minWidth: 300, borderTop: `3px solid ${color}` }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography fontWeight={800} fontSize={14}>{title}</Typography>
        <Box sx={{ flex: 1 }} />
        {onAll && <Button size="small" onClick={onAll} sx={{ color }}>Xem tất cả →</Button>}
      </Stack>
      {children}
    </Paper>
  );
}

export function ExecBoard() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const go = (v: QuoteViewKey) => setView(v);
  const openTour = async (q: CloudQuoteEntry, v: QuoteViewKey) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView(v);
  };

  const d = useMemo(() => {
    const all = visibleQuotes();
    const stOf = (q: CloudQuoteEntry) => q.status ?? 'in_progress';
    const open = all.filter((q) => OPEN.includes(stOf(q)));
    const won = all.filter((q) => stOf(q) === 'won');
    const lost = all.filter((q) => LOST.includes(stOf(q)));
    const decided = won.length + lost.length;
    const ym = new Date().toISOString().slice(0, 7);
    const wonThisMonth = won.filter((q) => (q.updatedAt || '').slice(0, 7) === ym);

    const byStatus = QUOTE_STATUS_ORDER.map((st) => {
      const items = all.filter((q) => stOf(q) === st);
      return { st, count: items.length, value: items.reduce((s, q) => s + (q.totalCost ?? 0), 0) };
    });
    const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

    const owing = all.filter((q) => (q.paymentSummary?.remaining ?? 0) > 0)
      .sort((a, b) => (b.paymentSummary!.remaining) - (a.paymentSummary!.remaining));
    const owingTotal = owing.reduce((s, q) => s + (q.paymentSummary!.remaining ?? 0), 0);

    const upcoming = all.filter((q) => { const x = q.departDate ? daysUntil(q.departDate) : null; return x != null && x >= 0 && x <= 30; })
      .sort((a, b) => (a.departDate ?? '').localeCompare(b.departDate ?? ''));

    const overdue = all.filter((q) => (q.workflowSummary?.overdue ?? 0) > 0);

    // Quyết toán: biên lợi THẬT toàn danh mục (chỉ tour đã có chỉ mục settlement).
    const settled = all.filter((q) => q.settlementSummary);
    const realProfit = settled.reduce((s, q) => s + (q.settlementSummary!.actualProfit ?? 0), 0);
    const realCost = settled.reduce((s, q) => s + (q.settlementSummary!.actualCost ?? 0), 0);
    const realMarginPct = realProfit + realCost > 0 ? (realProfit / (realProfit + realCost)) * 100 : 0;
    const lowMargin = [...settled]
      .sort((a, b) => (a.settlementSummary!.actualMarginPct ?? 0) - (b.settlementSummary!.actualMarginPct ?? 0))
      .slice(0, 5);

    const saleMap = new Map<string, { value: number; count: number }>();
    for (const q of won) {
      const k = q.createdByName || '—';
      const cur = saleMap.get(k) ?? { value: 0, count: 0 };
      cur.value += q.totalCost ?? 0; cur.count++; saleMap.set(k, cur);
    }
    const bySale = [...saleMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value).slice(0, 5);
    const maxSale = Math.max(1, ...bySale.map((s) => s.value));

    return {
      pipelineValue: open.reduce((s, q) => s + (q.totalCost ?? 0), 0),
      openCount: open.length,
      wonValue: won.reduce((s, q) => s + (q.totalCost ?? 0), 0),
      wonMonthValue: wonThisMonth.reduce((s, q) => s + (q.totalCost ?? 0), 0),
      wonMonthCount: wonThisMonth.length,
      winRate: decided ? Math.round((won.length / decided) * 100) : 0,
      decided,
      byStatus, maxStatus, owing, owingTotal, upcoming, overdue, bySale, maxSale,
      realProfit, realMarginPct, lowMargin, settledCount: settled.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography fontWeight={900} fontSize={18}>🎯 Tổng quan điều hành</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Bức tranh bán hàng · vận hành · công nợ toàn hệ thống (theo dữ liệu đã lưu cloud)
      </Typography>

      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
        <Kpi label="Giá trị pipeline" value={fmtShort(d.pipelineValue)} sub={`${d.openCount} deal đang mở`} color="#2563eb" />
        <Kpi label="Thắng tháng này" value={fmtShort(d.wonMonthValue)} sub={`${d.wonMonthCount} deal`} color="#27ae60" />
        <Kpi label="Tỉ lệ thắng" value={`${d.winRate}%`} sub={`${d.decided} deal đã chốt`} color="#0d9488" />
        <Kpi label="Công nợ NCC còn lại" value={fmtShort(d.owingTotal)} sub={`${d.owing.length} tour`} color={d.owingTotal > 0 ? '#dc3250' : '#64748b'} />
        <Kpi label="Tour khởi hành ≤30 ngày" value={String(d.upcoming.length)} color="#14a08c" />
        <Kpi label="Tour có việc quá hạn" value={String(d.overdue.length)} color={d.overdue.length ? '#dc3250' : '#64748b'} />
        <Kpi label="Biên lợi THẬT (đã quyết toán)" value={d.settledCount ? `${d.realMarginPct.toFixed(1)}%` : '—'}
          sub={d.settledCount ? `${fmtShort(d.realProfit)} lãi · ${d.settledCount} tour` : 'chưa có tour quyết toán'}
          color={d.realMarginPct < 0 ? '#dc3250' : d.realMarginPct < 10 ? '#e67e22' : '#0d7a6a'} />
      </Stack>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Panel title="Phễu trạng thái deal" color="#2563eb" onAll={() => go('pipeline')}>
          <Stack spacing={0.75}>
            {d.byStatus.map(({ st, count, value }) => {
              const m = QUOTE_STATUS_META[st];
              return (
                <Box key={st}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontSize={12.5} sx={{ flex: 1, color: m.color, fontWeight: 700 }}>{m.label}</Typography>
                    <Typography fontSize={12.5} fontWeight={700}>{count}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72, textAlign: 'right' }}>{fmtShort(value)}</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={(count / d.maxStatus) * 100}
                    sx={{ height: 5, borderRadius: 3, mt: 0.25, bgcolor: 'rgba(0,0,0,0.06)', '& .MuiLinearProgress-bar': { bgcolor: m.color } }} />
                </Box>
              );
            })}
          </Stack>
        </Panel>

        <Panel title="Top tour còn nợ NCC" color="#dc3250" onAll={() => go('payboard')}>
          {d.owing.length === 0 ? <Typography variant="caption" color="text.disabled">Không có công nợ NCC 🎉</Typography> : (
            <Stack spacing={0.75}>
              {d.owing.slice(0, 5).map((q) => (
                <Paper key={q.cloudId} variant="outlined" sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }} onClick={() => void openTour(q, 'payment')}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={13} fontWeight={600} noWrap>{q.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{q.customerName || q.createdByName}</Typography>
                    </Box>
                    <Typography fontSize={13} fontWeight={700} sx={{ color: '#dc3250' }}>{fmtShort(q.paymentSummary!.remaining)}</Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Panel>

        <Panel title="Sắp khởi hành (30 ngày)" color="#14a08c" onAll={() => go('departures')}>
          {d.upcoming.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có tour sắp khởi hành.</Typography> : (
            <Stack spacing={0.75}>
              {d.upcoming.slice(0, 5).map((q) => {
                const dd = daysUntil(q.departDate!);
                return (
                  <Paper key={q.cloudId} variant="outlined" sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }} onClick={() => void openTour(q, 'workflow')}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontSize={13} fontWeight={600} noWrap>{q.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{q.customerName || q.createdByName} · {q.pax} khách</Typography>
                      </Box>
                      <Chip size="small" variant="outlined" color={(dd ?? 9) <= 3 ? 'error' : 'default'} sx={{ height: 20, fontWeight: 700 }}
                        label={dd === 0 ? 'HÔM NAY' : `còn ${dd}n`} />
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Panel>

        <Panel title="Top nhân viên (giá trị thắng)" color="#7c3aed" onAll={() => go('salesanalytics')}>
          {d.bySale.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có deal thắng.</Typography> : (
            <Stack spacing={0.9}>
              {d.bySale.map((s) => (
                <Box key={s.name}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontSize={12.5} fontWeight={700} sx={{ flex: 1 }} noWrap>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.count} deal</Typography>
                    <Typography fontSize={12.5} fontWeight={700} sx={{ minWidth: 72, textAlign: 'right' }}>{fmtShort(s.value)}</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={(s.value / d.maxSale) * 100}
                    sx={{ height: 5, borderRadius: 3, mt: 0.25, bgcolor: 'rgba(0,0,0,0.06)', '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed' } }} />
                </Box>
              ))}
            </Stack>
          )}
        </Panel>
        <Panel title="Tour biên lợi thật thấp/âm" color="#e67e22">
          {d.lowMargin.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có tour nào quyết toán.</Typography> : (
            <Stack spacing={0.75}>
              {d.lowMargin.map((q) => {
                const m = q.settlementSummary!.actualMarginPct ?? 0;
                const mc = m < 0 ? '#dc3250' : m < 10 ? '#e67e22' : '#27ae60';
                return (
                  <Paper key={q.cloudId} variant="outlined" sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }} onClick={() => void openTour(q, 'settlement')}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontSize={13} fontWeight={600} noWrap>{q.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {q.customerName || q.createdByName} · lãi {fmtShort(q.settlementSummary!.actualProfit ?? 0)}
                          {q.settlementSummary!.locked ? ' · đã chốt' : ''}
                        </Typography>
                      </Box>
                      <Typography fontSize={14} fontWeight={800} sx={{ color: mc }}>{m.toFixed(1)}%</Typography>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Panel>
      </Stack>
    </Box>
  );
}
