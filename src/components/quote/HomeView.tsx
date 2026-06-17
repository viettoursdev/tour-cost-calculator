import { useMemo } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useQuoteStore, type QuoteViewKey } from '@/stores/quoteStore';
import { daysUntil } from '@/lib/dateUtils';
import { fmtVND } from './calc';
import type { CloudQuoteEntry } from '@/types';

function Section({ icon, title, count, color, onAll, children }: {
  icon: string; title: string; count: number; color: string; onAll?: () => void; children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderTop: `3px solid ${color}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography fontWeight={800} fontSize={14}>{icon} {title}</Typography>
        <Chip size="small" label={count} sx={{ height: 20, fontWeight: 800, bgcolor: color + '22', color }} />
        <Box sx={{ flex: 1 }} />
        {onAll && count > 0 && <Button size="small" onClick={onAll} sx={{ color }}>Xem tất cả →</Button>}
      </Stack>
      {count === 0 ? <Typography variant="caption" color="text.disabled">Không có mục nào 🎉</Typography> : children}
    </Paper>
  );
}

const Row = ({ onClick, primary, secondary, right }: { onClick: () => void; primary: string; secondary?: string; right?: React.ReactNode }) => (
  <Paper variant="outlined" sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }} onClick={onClick}>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontSize={13} fontWeight={600} noWrap>{primary}</Typography>
        {secondary && <Typography variant="caption" color="text.secondary" noWrap>{secondary}</Typography>}
      </Box>
      {right}
    </Stack>
  </Paper>
);

export function HomeView() {
  const me = useAuthStore((s) => s.currentUser);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const customers = useCustomerStore((s) => s.customers);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const today = new Date().toISOString().slice(0, 10);
  const go = (v: QuoteViewKey) => setView(v);
  const openQuote = async (q: CloudQuoteEntry, v: QuoteViewKey) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView(v);
  };

  const data = useMemo(() => {
    const list = visibleQuotes();
    const soon = list.filter((q) => { const d = q.departDate ? daysUntil(q.departDate) : null; return d != null && d >= 0 && d <= 7; })
      .sort((a, b) => (a.departDate ?? '').localeCompare(b.departDate ?? ''));
    const myOverdue = list.flatMap((q) => (q.workflowDue ?? [])
      .filter((w) => (w.assignee ? w.assignee === me?.u : q.createdByUsername === me?.u) && w.dueDate < today)
      .map((w) => ({ q, w })))
      .sort((a, b) => a.w.dueDate.localeCompare(b.w.dueDate));
    const owing = list.filter((q) => (q.paymentSummary?.remaining ?? 0) > 0 && q.departDate != null && (daysUntil(q.departDate) ?? 1) < 0)
      .sort((a, b) => (b.paymentSummary!.remaining - a.paymentSummary!.remaining));
    const followups = customers.filter((c) => c.nextFollowUp && c.nextFollowUp.byU === me?.u && c.nextFollowUp.date <= today)
      .sort((a, b) => (a.nextFollowUp!.date).localeCompare(b.nextFollowUp!.date));
    return { soon, myOverdue, owing, followups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, customers, me]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Typography fontWeight={900} fontSize={18}>👋 Chào {me?.name ?? ''}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} · việc cần để ý hôm nay
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        <Section icon="🛫" title="Tour sắp khởi hành (7 ngày)" count={data.soon.length} color="#14a08c" onAll={() => go('departures')}>
          <Stack spacing={0.75}>
            {data.soon.slice(0, 5).map((q) => (
              <Row key={q.cloudId} onClick={() => void openQuote(q, 'workflow')}
                primary={q.name}
                secondary={`${q.customerName || q.createdByName} · ${q.pax} khách`}
                right={<Chip size="small" color={(daysUntil(q.departDate!) ?? 9) <= 2 ? 'error' : 'default'} variant="outlined"
                  label={daysUntil(q.departDate!) === 0 ? 'HÔM NAY' : `còn ${daysUntil(q.departDate!)}n`} sx={{ height: 20, fontWeight: 700 }} />} />
            ))}
          </Stack>
        </Section>

        <Section icon="⏱" title="Việc quá hạn của tôi" count={data.myOverdue.length} color="#dc3250" onAll={() => go('opsboard')}>
          <Stack spacing={0.75}>
            {data.myOverdue.slice(0, 5).map(({ q, w }, i) => (
              <Row key={`${q.cloudId}-${i}`} onClick={() => void openQuote(q, 'workflow')}
                primary={`${w.label}`}
                secondary={q.name}
                right={<Typography variant="caption" sx={{ color: '#dc3250', fontWeight: 700 }}>{new Date(w.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>} />
            ))}
          </Stack>
        </Section>

        <Section icon="💰" title="Đã khởi hành còn nợ NCC" count={data.owing.length} color="#f5a623" onAll={() => go('payboard')}>
          <Stack spacing={0.75}>
            {data.owing.slice(0, 5).map((q) => (
              <Row key={q.cloudId} onClick={() => void openQuote(q, 'payment')}
                primary={q.name}
                secondary={q.customerName || q.createdByName}
                right={<Typography variant="caption" sx={{ color: '#dc3250', fontWeight: 700 }}>{fmtVND(q.paymentSummary!.remaining)}</Typography>} />
            ))}
          </Stack>
        </Section>

        <Section icon="📅" title="Hẹn liên hệ khách hôm nay" count={data.followups.length} color="#2563eb" onAll={() => go('customer')}>
          <Stack spacing={0.75}>
            {data.followups.slice(0, 5).map((c) => (
              <Row key={c.id} onClick={() => go('customer')}
                primary={c.name}
                secondary={c.nextFollowUp!.note || 'Liên hệ lại'}
                right={<Typography variant="caption" sx={{ color: c.nextFollowUp!.date < today ? '#dc3250' : '#2563eb', fontWeight: 700 }}>
                  {new Date(c.nextFollowUp!.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>} />
            ))}
          </Stack>
        </Section>
      </Box>
    </Box>
  );
}
