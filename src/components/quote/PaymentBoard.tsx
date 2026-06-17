import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableFooter, TableHead,
  TableRow, TextField, ToggleButton, Tooltip, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { daysUntil } from '@/lib/dateUtils';
import { filterRank } from '@/lib/search';
import { ROLE_RANK } from '@/auth/ROLES';
import { fbGetQuoteProject, fbGetTourPayments, fbBackfillPaymentIndex } from '@/lib/firebase';
import { fmtVND } from './calc';
import { getCATS } from './constants';
import { computePaymentSummary, slugifyTourKey } from './paymentUtils';
import type { CloudQuoteEntry } from '@/types';

type Filter = 'all' | 'owing' | 'overdue';

/** Tour đã khởi hành nhưng còn phải trả NCC → công nợ quá hạn. */
const isOverdue = (q: CloudQuoteEntry) =>
  (q.paymentSummary?.remaining ?? 0) > 0 && q.departDate != null && (daysUntil(q.departDate) ?? 1) < 0;

export function PaymentBoard() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const me = useAuthStore((s) => s.currentUser);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [filter, setFilter] = useState<Filter>('owing');
  const [search, setSearch] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const canBackfill = !!me && ROLE_RANK[me.role] >= ROLE_RANK['Trưởng Phòng'];

  const rows = useMemo(() => {
    let list = visibleQuotes().filter((q) => q.paymentSummary);
    if (filter === 'owing') list = list.filter((q) => (q.paymentSummary!.remaining ?? 0) > 0);
    if (filter === 'overdue') list = list.filter(isOverdue);
    const ranked = filterRank(list, search, (q) => [q.name, q.quoteCode, q.customerName].filter(Boolean).join(' '));
    // Còn nợ nhiều nhất / quá hạn lên đầu.
    return [...ranked].sort((a, b) => (Number(isOverdue(b)) - Number(isOverdue(a))) || ((b.paymentSummary!.remaining ?? 0) - (a.paymentSummary!.remaining ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, filter, search]);

  const sum = useMemo(() => rows.reduce((a, q) => ({
    payable: a.payable + (q.paymentSummary!.payable ?? 0),
    paid: a.paid + (q.paymentSummary!.paid ?? 0),
    remaining: a.remaining + (q.paymentSummary!.remaining ?? 0),
  }), { payable: 0, paid: 0, remaining: 0 }), [rows]);

  const runBackfill = async () => {
    const missing = visibleQuotes().filter((q) => !q.paymentSummary);
    if (!missing.length) { window.alert('Tất cả báo giá đã có số liệu công nợ.'); return; }
    if (!window.confirm(`Quét ${missing.length} báo giá để tổng hợp công nợ NCC? (đọc dữ liệu từng báo giá)`)) return;
    setBackfilling(true);
    try {
      const updates: Record<string, { payable: number; paid: number; remaining: number }> = {};
      for (const q of missing) {
        const proj = await fbGetQuoteProject(q.cloudId).catch(() => null);
        const draft = proj?.currentState;
        if (!draft?.template) continue;
        const pay = await fbGetTourPayments(slugifyTourKey(draft.info.name ?? '')).catch(() => null);
        const sumI = computePaymentSummary(draft, getCATS(draft.template), pay?.payments ?? {}, pay?.customItems ?? []);
        if (sumI.payable > 0) updates[q.cloudId] = sumI;
      }
      const n = await fbBackfillPaymentIndex(updates);
      window.alert(n ? `✅ Đã tổng hợp công nợ cho ${n} báo giá.` : 'Không có báo giá nào có chi phí NCC để tổng hợp.');
    } catch (e) {
      window.alert('❌ Tổng hợp công nợ lỗi: ' + (e as Error).message);
    } finally {
      setBackfilling(false);
    }
  };

  const open = async (q: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId &&
      !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView('payment');
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1180, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>💰 Công nợ phải trả NCC — toàn hệ thống</Typography>
          <Typography variant="caption" color="text.secondary">
            Còn phải trả: <b style={{ color: '#dc3250' }}>{fmtVND(sum.remaining)}</b> / Tổng {fmtVND(sum.payable)} ({rows.length} tour)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tour, mã, khách…" sx={{ minWidth: 200 }} />
          <ToggleButton size="small" value="owing" selected={filter === 'owing'} onChange={() => setFilter('owing')}>Còn nợ</ToggleButton>
          <ToggleButton size="small" value="overdue" selected={filter === 'overdue'} onChange={() => setFilter('overdue')} color="error">⚠ Đã đi còn nợ</ToggleButton>
          <ToggleButton size="small" value="all" selected={filter === 'all'} onChange={() => setFilter('all')}>Tất cả</ToggleButton>
          {canBackfill && (
            <Tooltip title="Tổng hợp công nợ cho báo giá chưa có số liệu">
              <span><Button size="small" variant="outlined" startIcon={<RefreshIcon />} disabled={backfilling} onClick={() => void runBackfill()}>
                {backfilling ? 'Đang tổng hợp…' : 'Tổng hợp'}
              </Button></span>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Không có công nợ khớp bộ lọc. Số liệu cập nhật khi mở tab Thanh toán của báo giá (hoặc bấm “Tổng hợp”).
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)' } }}>
                <TableCell>Báo giá</TableCell>
                <TableCell align="right">Phải trả NCC</TableCell>
                <TableCell align="right">Đã trả</TableCell>
                <TableCell align="right">Còn phải trả</TableCell>
                <TableCell align="center">Khởi hành</TableCell>
                <TableCell align="right">Mở</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((q) => {
                const p = q.paymentSummary!;
                const overdue = isOverdue(q);
                const pct = p.payable > 0 ? Math.round((p.paid / p.payable) * 100) : 0;
                return (
                  <TableRow key={q.cloudId} hover sx={{ cursor: 'pointer', ...(overdue ? { bgcolor: 'rgba(220,50,80,0.05)' } : {}) }} onClick={() => void open(q)}>
                    <TableCell>
                      <Typography fontSize={13.5} fontWeight={700}>{q.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{q.quoteCode ? `${q.quoteCode} · ` : ''}{q.customerName || q.createdByName}</Typography>
                    </TableCell>
                    <TableCell align="right"><Typography fontSize={13}>{fmtVND(p.payable)}</Typography></TableCell>
                    <TableCell align="right"><Typography fontSize={13} sx={{ color: '#27ae60' }}>{fmtVND(p.paid)} <Typography component="span" variant="caption" color="text.secondary">· {pct}%</Typography></Typography></TableCell>
                    <TableCell align="right"><Typography fontSize={13} fontWeight={700} sx={{ color: p.remaining > 0 ? '#dc3250' : 'text.secondary' }}>{fmtVND(p.remaining)}</Typography></TableCell>
                    <TableCell align="center">
                      {q.departDate
                        ? <Chip size="small" variant={overdue ? 'filled' : 'outlined'} color={overdue ? 'error' : 'default'}
                            icon={overdue ? <WarningAmberIcon sx={{ fontSize: 15 }} /> : undefined}
                            label={new Date(q.departDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            sx={{ height: 20, fontWeight: 700 }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<OpenInNewIcon />} onClick={(e) => { e.stopPropagation(); void open(q); }} sx={{ color: '#0d7a6a' }}>Mở</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 800, color: 'text.primary', borderTop: '2px solid rgba(0,0,0,0.12)' } }}>
                <TableCell>Tổng cộng</TableCell>
                <TableCell align="right">{fmtVND(sum.payable)}</TableCell>
                <TableCell align="right" sx={{ color: '#27ae60' }}>{fmtVND(sum.paid)}</TableCell>
                <TableCell align="right" sx={{ color: '#dc3250' }}>{fmtVND(sum.remaining)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
