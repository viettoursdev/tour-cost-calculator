import { useMemo, useState } from 'react';
import {
  Box, Chip, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  Typography,
} from '@mui/material';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { fmtVND } from './calc';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './constants';
import type { CloudQuoteEntry, QuoteStatus } from '@/types';

const Stat = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <Paper variant="outlined" sx={{ px: 1.75, py: 1.25, flex: 1, minWidth: 150 }}>
    <Typography fontWeight={900} fontSize={18} sx={{ color: color ?? 'text.primary' }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{label}{sub ? ` · ${sub}` : ''}</Typography>
  </Paper>
);

const Bar = ({ pct, color }: { pct: number; color: string }) => (
  <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
    <Box sx={{ width: `${Math.max(2, pct)}%`, height: '100%', bgcolor: color, borderRadius: 4 }} />
  </Box>
);

export function SalesAnalytics() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const [owner, setOwner] = useState('');

  const owners = useMemo(() => [...new Set(visibleQuotes().map((q) => q.createdByName).filter(Boolean))].sort(), [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => {
    let list = visibleQuotes();
    if (owner) list = list.filter((q) => q.createdByName === owner);
    const stOf = (q: CloudQuoteEntry) => (q.status ?? 'in_progress') as QuoteStatus;
    const byStatus = QUOTE_STATUS_ORDER.map((st) => {
      const items = list.filter((q) => stOf(q) === st);
      return { st, count: items.length, value: items.reduce((s, q) => s + (q.totalCost ?? 0), 0) };
    });
    const wonItems = list.filter((q) => stOf(q) === 'won');
    const lostItems = list.filter((q) => stOf(q) === 'not_selected');
    const decided = wonItems.length + lostItems.length;
    const winRate = decided ? Math.round((wonItems.length / decided) * 100) : 0;
    const wonValue = wonItems.reduce((s, q) => s + (q.totalCost ?? 0), 0);
    const openItems = list.filter((q) => ['in_progress', 'sent', 'negotiating'].includes(stOf(q)));
    const openValue = openItems.reduce((s, q) => s + (q.totalCost ?? 0), 0);

    const bySaleMap = new Map<string, { total: number; won: number; wonValue: number }>();
    for (const q of list) {
      const k = q.createdByName || '—';
      const cur = bySaleMap.get(k) ?? { total: 0, won: 0, wonValue: 0 };
      cur.total++;
      if (stOf(q) === 'won') { cur.won++; cur.wonValue += q.totalCost ?? 0; }
      bySaleMap.set(k, cur);
    }
    const bySale = [...bySaleMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.wonValue - a.wonValue);

    const byMonthMap = new Map<string, number>();
    for (const q of wonItems) {
      const d = q.departDate || q.updatedAt;
      if (!d) continue;
      const m = d.slice(0, 7);
      byMonthMap.set(m, (byMonthMap.get(m) ?? 0) + (q.totalCost ?? 0));
    }
    const byMonth = [...byMonthMap.entries()].map(([month, value]) => ({ month, value })).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

    return { total: list.length, byStatus, winRate, wonItems: wonItems.length, wonValue, openItems: openItems.length, openValue, bySale, byMonth };
  }, [quotes, owner]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxStatusVal = Math.max(1, ...data.byStatus.map((s) => s.value));
  const maxMonthVal = Math.max(1, ...data.byMonth.map((m) => m.value));

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Typography fontWeight={900} fontSize={16}>📊 Phân tích bán hàng</Typography>
        <Select size="small" displayEmpty value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Mọi nhân viên</MenuItem>
          {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      </Stack>

      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Stat label="Tổng deal" value={String(data.total)} />
        <Stat label="Tỷ lệ chốt" sub={`${data.wonItems} thắng`} value={`${data.winRate}%`} color="#27ae60" />
        <Stat label="Doanh số đã chốt" value={fmtVND(data.wonValue)} color="#0d7a6a" />
        <Stat label="Đang theo đuổi" sub={`${data.openItems} deal`} value={fmtVND(data.openValue)} color="#2563eb" />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Phễu theo trạng thái</Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {data.byStatus.map((s) => (
            <Box key={s.st}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: QUOTE_STATUS_META[s.st].color, fontWeight: 700 }}>{QUOTE_STATUS_META[s.st].label} · {s.count}</Typography>
                <Typography variant="caption" color="text.secondary">{fmtVND(s.value)}</Typography>
              </Stack>
              <Bar pct={(s.value / maxStatusVal) * 100} color={QUOTE_STATUS_META[s.st].color} />
            </Box>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 0, mb: 2, overflowX: 'auto' }}>
        <Box sx={{ p: 1.5, pb: 0.5 }}><Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Theo nhân viên</Typography></Box>
        <Table size="small" sx={{ minWidth: 480, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 800 } }}>
              <TableCell>Nhân viên</TableCell>
              <TableCell align="right">Tổng deal</TableCell>
              <TableCell align="right">Đã chốt</TableCell>
              <TableCell align="right">Doanh số chốt</TableCell>
              <TableCell align="right">Tỷ lệ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.bySale.map((r) => (
              <TableRow key={r.name} hover>
                <TableCell><Typography fontSize={13} fontWeight={600}>{r.name}</Typography></TableCell>
                <TableCell align="right">{r.total}</TableCell>
                <TableCell align="right"><Chip size="small" label={r.won} sx={{ height: 18, bgcolor: 'rgba(39,174,96,0.15)', color: '#27ae60', fontWeight: 700 }} /></TableCell>
                <TableCell align="right"><Typography fontSize={13} fontWeight={700} sx={{ color: '#0d7a6a' }}>{fmtVND(r.wonValue)}</Typography></TableCell>
                <TableCell align="right">{r.total ? Math.round((r.won / r.total) * 100) : 0}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Doanh số đã chốt theo tháng (khởi hành)</Typography>
        {data.byMonth.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>Chưa có deal thắng nào có ngày khởi hành.</Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {data.byMonth.map((m) => (
              <Box key={m.month}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                  <Typography variant="caption" fontWeight={700}>{m.month.slice(5)}/{m.month.slice(0, 4)}</Typography>
                  <Typography variant="caption" color="text.secondary">{fmtVND(m.value)}</Typography>
                </Stack>
                <Bar pct={(m.value / maxMonthVal) * 100} color="#14a08c" />
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
        Số liệu từ báo giá thường đã lưu cloud (theo quyền xem). "Đã chốt" = trạng thái Thành công.
      </Typography>
    </Box>
  );
}
