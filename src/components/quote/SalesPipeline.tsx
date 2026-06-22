import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import Sortable from 'sortablejs';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { sbSetQuoteStatus } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { filterRank } from '@/lib/search';
import { fmtVND } from './calc';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER, LOSS_STATUSES, promptLossReason } from './constants';
import type { CloudQuoteEntry, QuoteStatus } from '@/types';

export function SalesPipeline() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const setStatus = useQuoteStore((s) => s.setStatus);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const refs = useRef<Partial<Record<QuoteStatus, HTMLDivElement | null>>>({});

  const owners = useMemo(() => [...new Set(visibleQuotes().map((q) => q.createdByName).filter(Boolean))].sort(), [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let list = visibleQuotes();
    if (owner) list = list.filter((q) => q.createdByName === owner);
    return filterRank(list, search, (q) => [q.name, q.quoteCode, q.customerName].filter(Boolean).join(' '));
  }, [quotes, search, owner]); // eslint-disable-line react-hooks/exhaustive-deps

  const byStatus = (st: QuoteStatus) => rows.filter((q) => (q.status ?? 'in_progress') === st);
  const colTotal = (st: QuoteStatus) => byStatus(st).reduce((s, q) => s + (q.totalCost ?? 0), 0);

  const move = (cloudId: string, status: QuoteStatus) => {
    const q = useQuoteHistoryStore.getState().quotes.find((x) => x.cloudId === cloudId);
    if (!q || (q.status ?? 'in_progress') === status) return;
    let reason: string | undefined;
    if (LOSS_STATUSES.includes(status)) {
      const r = promptLossReason(q.lossReason);
      if (r === null) return; // huỷ
      reason = r;
    }
    void sbSetQuoteStatus(cloudId, status, reason).catch((e) => window.alert('Đổi trạng thái lỗi: ' + (e as Error).message));
    logAudit('update', 'Báo giá', q.name, `Trạng thái → ${QUOTE_STATUS_META[status].label}${reason ? ` (${reason})` : ''}`);
    if (currentQuoteId === cloudId) setStatus(status, reason); // đồng bộ báo giá đang mở
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    const instances = QUOTE_STATUS_ORDER.map((st) => {
      const el = refs.current[st];
      if (!el) return null;
      return Sortable.create(el, {
        group: 'pipeline', animation: 160, ghostClass: 'sortable-ghost',
        onEnd: (e) => {
          const id = (e.item as HTMLElement).dataset.id;
          const to = (e.to as HTMLElement).dataset.status as QuoteStatus | undefined;
          const from = e.from as HTMLElement;
          from.removeChild(e.item);
          from.insertBefore(e.item, from.children[e.oldIndex ?? 0] ?? null);
          if (id && to) moveRef.current(id, to);
        },
      });
    });
    return () => instances.forEach((i) => { try { i?.destroy(); } catch { /* ignore */ } });
  }, []);

  const open = async (q: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView('cost');
  };

  const grandTotal = useMemo(() => rows.reduce((s, q) => s + (q.totalCost ?? 0), 0), [rows]);
  const wonValue = useMemo(() => byStatus('won').reduce((s, q) => s + (q.totalCost ?? 0), 0), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>🧲 Pipeline bán hàng</Typography>
          <Typography variant="caption" color="text.secondary">{rows.length} deal · tổng giá trị {fmtVND(grandTotal)} · đã chốt {fmtVND(wonValue)}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tour, mã, khách…" sx={{ minWidth: 200 }} />
          <Select size="small" displayEmpty value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">Mọi nhân viên</MenuItem>
            {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(6,1fr)' }, gap: 1.25, alignItems: 'start' }}>
        {QUOTE_STATUS_ORDER.map((st) => {
          const meta = QUOTE_STATUS_META[st];
          const items = byStatus(st);
          return (
            <Paper key={st} variant="outlined" sx={{ p: 0.75, bgcolor: 'rgba(0,0,0,0.015)', borderTop: `3px solid ${meta.color}` }}>
              <Box sx={{ px: 0.5, py: 0.5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography fontWeight={800} fontSize={13} sx={{ color: meta.color }}>{meta.label}</Typography>
                  <Chip size="small" label={items.length} sx={{ height: 18, bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                </Stack>
                <Typography variant="caption" color="text.secondary">{fmtVND(colTotal(st))}</Typography>
              </Box>
              <Box ref={(el: HTMLDivElement | null) => { refs.current[st] = el; }} data-status={st}
                sx={{ minHeight: 50, display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.5 }}>
                {items.map((q) => (
                  <Paper key={q.cloudId} data-id={q.cloudId} elevation={0} onClick={() => void open(q)}
                    sx={{ p: 1, cursor: 'grab', border: '1px solid rgba(15,58,74,0.14)', borderRadius: 1.5, '&:hover': { boxShadow: 2, borderColor: meta.color } }}>
                    <Typography fontSize={12.5} fontWeight={700} sx={{ lineHeight: 1.3 }}>{q.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{q.customerName || q.createdByName}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" fontWeight={700} sx={{ color: '#0d7a6a' }}>{fmtVND(q.totalCost ?? 0)}</Typography>
                      {q.departDate && <Typography variant="caption" color="text.secondary">{new Date(q.departDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>}
                    </Stack>
                  </Paper>
                ))}
              </Box>
            </Paper>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
        Kéo-thả thẻ giữa các cột để đổi trạng thái deal. Chỉ gồm báo giá thường (không gồm breakdown DMC).
      </Typography>
    </Box>
  );
}
