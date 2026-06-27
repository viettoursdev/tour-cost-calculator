import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, MenuItem, Paper, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import Sortable from 'sortablejs';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useCustomerStore } from '@/stores/customerStore';
import { sbSetQuoteStatus } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { filterRank } from '@/lib/search';
import { fmtVND } from './calc';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER, LOSS_STATUSES } from './constants';
import { LossReasonDialog } from './LossReasonDialog';
import { contractFlags, dealStage, DEAL_STAGES, DEAL_STAGE_LOST, type DealStage } from './dealStage';
import { scoreDeals, WIN_BAND_META, type WinScore } from './winScore';
import { PriorityToClose, type ScoredDeal } from './PriorityToClose';
import type { CloudQuoteEntry, QuoteStatus } from '@/types';

type Mode = 'status' | 'stage';
const MODE_KEY = 'vte_pipeline_mode';

// Cột giai đoạn hồ sơ: 7 giai đoạn xuôi + nhánh Thua/Huỷ.
const STAGE_COLS = [...DEAL_STAGES, DEAL_STAGE_LOST];

export function SalesPipeline() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const contracts = useContractStore((s) => s.contracts);
  const customers = useCustomerStore((s) => s.customers);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const setStatus = useQuoteStore((s) => s.setStatus);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'status');
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [lossPending, setLossPending] = useState<{ cloudId: string; status: QuoteStatus; current?: string } | null>(null);
  const refs = useRef<Partial<Record<QuoteStatus, HTMLDivElement | null>>>({});

  const owners = useMemo(() => [...new Set(visibleQuotes().map((q) => q.createdByName).filter(Boolean))].sort(), [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let list = visibleQuotes();
    if (owner) list = list.filter((q) => q.createdByName === owner);
    return filterRank(list, search, (q) => [q.name, q.quoteCode, q.customerName].filter(Boolean).join(' '));
  }, [quotes, search, owner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giai đoạn hồ sơ mỗi báo giá: suy từ trạng thái bán + hợp đồng liên kết + ngày
  // khởi hành. (Workflow per-báo-giá không có trong index nên không tính ở board.)
  const stageById = useMemo(() => {
    const m = new Map<string, DealStage>();
    for (const q of rows) {
      const c = contracts.find((x) => x.linkedQuoteId === q.cloudId);
      m.set(q.cloudId, dealStage({ status: q.status, contract: contractFlags(c), departureISO: q.departDate }));
    }
    return m;
  }, [rows, contracts]);

  // #3 — điểm khả năng chốt cho từng deal đang mở (tỷ lệ thắng theo khách + nguồn).
  const sourceOf = useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c.source?.trim() || '']));
    const byName = new Map(customers.map((c) => [c.name, c.source?.trim() || '']));
    return (q: CloudQuoteEntry) =>
      (q.customerId ? byId.get(q.customerId) : undefined) || byName.get(q.customerName ?? '') || undefined;
  }, [customers]);

  const scoreById = useMemo(
    () => scoreDeals(rows, visibleQuotes(), { sourceOf, hasContract: (q) => contracts.some((c) => c.linkedQuoteId === q.cloudId) }),
    [rows, quotes, contracts, sourceOf], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const priority: ScoredDeal[] = useMemo(
    () => rows.filter((q) => scoreById.has(q.cloudId))
      .map((q) => ({ entry: q, score: scoreById.get(q.cloudId)! }))
      .sort((a, b) => b.score.score - a.score.score || (b.entry.totalCost ?? 0) - (a.entry.totalCost ?? 0))
      .slice(0, 8),
    [rows, scoreById],
  );

  const changeMode = (m: Mode | null) => { if (m) { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } } };

  const byStatus = (st: QuoteStatus) => rows.filter((q) => (q.status ?? 'in_progress') === st);
  const byStage = (st: DealStage) => rows.filter((q) => stageById.get(q.cloudId) === st);
  const sumOf = (items: CloudQuoteEntry[]) => items.reduce((s, q) => s + (q.totalCost ?? 0), 0);

  // Ghi đổi trạng thái (cloud + audit + đồng bộ báo giá đang mở).
  const applyMove = (cloudId: string, status: QuoteStatus, reason?: string) => {
    const q = useQuoteHistoryStore.getState().quotes.find((x) => x.cloudId === cloudId);
    if (!q) return;
    void sbSetQuoteStatus(cloudId, status, reason).catch((e) => window.alert('Đổi trạng thái lỗi: ' + (e as Error).message));
    logAudit('update', 'Báo giá', q.name, `Trạng thái → ${QUOTE_STATUS_META[status].label}${reason ? ` (${reason})` : ''}`);
    if (currentQuoteId === cloudId) setStatus(status, reason); // đồng bộ báo giá đang mở
  };

  const move = (cloudId: string, status: QuoteStatus) => {
    const q = useQuoteHistoryStore.getState().quotes.find((x) => x.cloudId === cloudId);
    if (!q || (q.status ?? 'in_progress') === status) return;
    // Thua/Huỷ → hỏi lý do có cấu trúc qua dialog (không chặn luồng kéo-thả).
    if (LOSS_STATUSES.includes(status)) {
      setLossPending({ cloudId, status, current: q.lossReason });
      return;
    }
    applyMove(cloudId, status);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  // Kéo-thả CHỈ ở chế độ "Trạng thái bán" (giai đoạn hồ sơ là suy ra → không kéo).
  useEffect(() => {
    if (mode !== 'status') return;
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
  }, [mode]);

  const open = async (q: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView(mode === 'stage' ? 'cockpit' : 'cost');
  };

  const grandTotal = useMemo(() => sumOf(rows), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const wonValue = useMemo(() => sumOf(byStatus('won')), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const isStage = mode === 'stage';
  // Mỗi cột chuẩn hoá về { key, label, color, items, dropSt? } để render chung.
  const columns: { key: string; label: string; color: string; items: CloudQuoteEntry[]; dropSt?: QuoteStatus }[] = isStage
    ? STAGE_COLS.map((s) => ({ key: s.key, label: s.short, color: s.color, items: byStage(s.key as DealStage) }))
    : QUOTE_STATUS_ORDER.map((st) => ({ key: st, label: QUOTE_STATUS_META[st].label, color: QUOTE_STATUS_META[st].color, items: byStatus(st), dropSt: st }));

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>🧲 {isStage ? 'Đường dây hồ sơ tour' : 'Pipeline bán hàng'}</Typography>
          <Typography variant="caption" color="text.secondary">{rows.length} deal · tổng giá trị {fmtVND(grandTotal)} · đã chốt {fmtVND(wonValue)}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => changeMode(m)}>
            <ToggleButton value="status">Trạng thái bán</ToggleButton>
            <ToggleButton value="stage">Giai đoạn hồ sơ</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tour, mã, khách…" sx={{ minWidth: 200 }} />
          <Select size="small" displayEmpty value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">Mọi nhân viên</MenuItem>
            {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
        </Stack>
      </Stack>

      <PriorityToClose items={priority} onOpen={(q) => void open(q)} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)', lg: `repeat(${isStage ? 8 : 6},1fr)` }, gap: 1.25, alignItems: 'start' }}>
        {columns.map((col) => (
          <Paper key={col.key} variant="outlined" sx={{ p: 0.75, bgcolor: 'rgba(0,0,0,0.015)', borderTop: `3px solid ${col.color}` }}>
            <Box sx={{ px: 0.5, py: 0.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography fontWeight={800} fontSize={13} sx={{ color: col.color }}>{col.label}</Typography>
                <Chip size="small" label={col.items.length} sx={{ height: 18, bgcolor: col.color + '22', color: col.color, fontWeight: 700 }} />
              </Stack>
              <Typography variant="caption" color="text.secondary">{fmtVND(sumOf(col.items))}</Typography>
            </Box>
            <Box
              ref={(el: HTMLDivElement | null) => { if (col.dropSt) refs.current[col.dropSt] = el; }}
              data-status={col.dropSt}
              sx={{ minHeight: 50, display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.5 }}
            >
              {col.items.map((q) => (
                <Paper key={q.cloudId} data-id={q.cloudId} elevation={0} onClick={() => void open(q)}
                  sx={{ p: 1, cursor: isStage ? 'pointer' : 'grab', border: '1px solid rgba(15,58,74,0.14)', borderRadius: 1.5, '&:hover': { boxShadow: 2, borderColor: col.color } }}>
                  <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                    <Typography fontSize={12.5} fontWeight={700} sx={{ lineHeight: 1.3, flex: 1, minWidth: 0 }}>{q.name}</Typography>
                    <ScoreBadge s={scoreById.get(q.cloudId)} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{q.customerName || q.createdByName}</Typography>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#0d7a6a' }}>{fmtVND(q.totalCost ?? 0)}</Typography>
                    {q.departDate && <Typography variant="caption" color="text.secondary">{new Date(q.departDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>}
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Paper>
        ))}
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
        {isStage
          ? 'Giai đoạn hồ sơ suy ra từ trạng thái bán + hợp đồng liên kết + ngày khởi hành. Bấm thẻ để mở Hồ sơ tour. Chỉ gồm báo giá thường.'
          : 'Kéo-thả thẻ giữa các cột để đổi trạng thái deal. Chỉ gồm báo giá thường (không gồm breakdown DMC).'}
      </Typography>
      <LossReasonDialog
        open={!!lossPending}
        current={lossPending?.current}
        onClose={() => setLossPending(null)}
        onConfirm={(reason) => { if (lossPending) applyMove(lossPending.cloudId, lossPending.status, reason); setLossPending(null); }}
      />
    </Box>
  );
}

/** Badge điểm khả năng chốt trên thẻ deal (chỉ deal đang mở mới có điểm). */
function ScoreBadge({ s }: { s?: WinScore }) {
  if (!s) return null;
  const bm = WIN_BAND_META[s.band];
  return (
    <Tooltip title={`Khả năng chốt: ${bm.label} (${s.score}/100)`}>
      <Chip size="small" label={s.score} sx={{ height: 18, minWidth: 30, fontSize: 11, fontWeight: 800, bgcolor: `${bm.color}1a`, color: bm.color }} />
    </Tooltip>
  );
}
