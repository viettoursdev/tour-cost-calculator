import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { deadlineMeta } from '@/components/visa/constants';
import { filterRank } from '@/lib/search';
import { QUOTE_STATUS_META } from './constants';
import type { CloudQuoteEntry } from '@/types';

type Scope = 'all' | 'mine';

/** Bước sắp/đã đến hạn gần nhất (chưa xong) của 1 báo giá. */
const nextDue = (q: CloudQuoteEntry) =>
  [...(q.workflowDue ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

export function WorkflowBoard() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const users = useAuthStore((s) => s.users);
  const me = useAuthStore((s) => s.currentUser);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [scope, setScope] = useState<Scope>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState('');

  const nameOf = (u?: string) => users.find((x) => x.u === u)?.name ?? u ?? '';

  // Báo giá CÓ quy trình (đã lưu tóm tắt workflow), đã lọc theo quyền xem.
  const rows = useMemo(() => {
    const base = visibleQuotes().filter((q) => q.workflowSummary && (q.workflowSummary.total ?? 0) > 0);
    const today = new Date().toISOString().slice(0, 10);
    let list = base;
    if (scope === 'mine' && me) {
      list = list.filter((q) => q.workflowSummary?.currentAssignee === me.u || (q.workflowDue ?? []).some((w) => w.assignee === me.u));
    }
    if (overdueOnly) list = list.filter((q) => (q.workflowSummary?.overdue ?? 0) > 0 || (q.workflowDue ?? []).some((w) => w.dueDate < today));
    const ranked = filterRank(list, search, (q) => [q.name, q.quoteCode, q.customerName, q.workflowSummary?.current].filter(Boolean).join(' '));
    // Ưu tiên: quá hạn nhiều trước, rồi tiến độ thấp trước.
    return [...ranked].sort((a, b) =>
      (b.workflowSummary!.overdue - a.workflowSummary!.overdue) || (a.workflowSummary!.donePct - b.workflowSummary!.donePct));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, scope, overdueOnly, search, me]);

  const stats = useMemo(() => {
    const withWf = visibleQuotes().filter((q) => q.workflowSummary && q.workflowSummary.total > 0);
    return {
      total: withWf.length,
      running: withWf.filter((q) => (q.workflowSummary!.donePct ?? 0) < 100).length,
      overdue: withWf.filter((q) => (q.workflowSummary!.overdue ?? 0) > 0).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);

  const open = async (q: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId &&
      !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView('workflow');
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>🧭 Bảng điều phối — tiến độ vận hành toàn hệ thống</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
            <Chip size="small" label={`${stats.total} tour có quy trình`} />
            <Chip size="small" color="info" variant="outlined" label={`${stats.running} đang chạy`} />
            <Chip size="small" color="error" variant={stats.overdue ? 'filled' : 'outlined'} label={`${stats.overdue} có bước quá hạn`} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tour, mã, khách, bước…" sx={{ minWidth: 220 }} />
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => v && setScope(v)}>
            <ToggleButton value="all">Tất cả</ToggleButton>
            <ToggleButton value="mine">Việc của tôi</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButton size="small" value="overdue" selected={overdueOnly} onChange={() => setOverdueOnly((v) => !v)} color="error">⏱ Chỉ quá hạn</ToggleButton>
        </Stack>
      </Stack>

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Không có báo giá nào khớp. Quy trình được tổng hợp khi báo giá được <b>lưu cloud</b> (tab Quy trình → Lưu).
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Table size="small" sx={{ '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)' } }}>
                <TableCell>Báo giá</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Bước hiện tại</TableCell>
                <TableCell sx={{ minWidth: 150 }}>Tiến độ</TableCell>
                <TableCell>Sắp đến hạn</TableCell>
                <TableCell align="right">Mở</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((q) => {
                const wf = q.workflowSummary!;
                const due = nextDue(q);
                const dl = due ? deadlineMeta(due.dueDate, false) : null;
                const stMeta = q.status ? QUOTE_STATUS_META[q.status] : null;
                return (
                  <TableRow key={q.cloudId} hover sx={{ cursor: 'pointer', ...(wf.overdue ? { bgcolor: 'rgba(220,50,80,0.04)' } : {}) }} onClick={() => void open(q)}>
                    <TableCell>
                      <Typography fontSize={13.5} fontWeight={700}>{q.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {q.quoteCode ? `${q.quoteCode} · ` : ''}{q.customerName || q.createdByName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {stMeta && <Chip size="small" label={stMeta.label} sx={{ height: 20, bgcolor: stMeta.color + '22', color: stMeta.color, fontWeight: 700 }} />}
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={13}>{wf.current ?? '— hoàn tất —'}</Typography>
                      {wf.currentAssignee && <Typography variant="caption" color="text.secondary">👤 {nameOf(wf.currentAssignee)}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 70 }}>
                          <LinearProgress variant="determinate" value={wf.donePct} sx={{ height: 7, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: wf.donePct === 100 ? '#27ae60' : '#14a08c' } }} />
                        </Box>
                        <Typography variant="caption" fontWeight={700} sx={{ width: 34 }}>{wf.donePct}%</Typography>
                        {wf.overdue > 0 && <Chip size="small" color="error" label={`${wf.overdue} trễ`} sx={{ height: 18, fontWeight: 700 }} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {due ? (
                        <Tooltip title={due.label}>
                          <Typography variant="caption" sx={{ color: dl?.color, fontWeight: 700 }}>
                            ⏱ {dl?.text}{due.assignee ? ` · ${nameOf(due.assignee)}` : ''}
                          </Typography>
                        </Tooltip>
                      ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<OpenInNewIcon />} onClick={(e) => { e.stopPropagation(); void open(q); }} sx={{ color: '#0d7a6a' }}>Mở</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
