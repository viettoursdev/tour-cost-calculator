import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, TextField, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { daysUntil } from '@/lib/dateUtils';
import { filterRank } from '@/lib/search';
import { QUOTE_STATUS_META } from './constants';
import type { CloudQuoteEntry } from '@/types';

type Range = '7' | '30' | 'upcoming' | 'past';
const RANGE_LABEL: Record<Range, string> = { '7': '7 ngày tới', '30': '30 ngày tới', upcoming: 'Tất cả sắp tới', past: 'Đã khởi hành' };

const fmtDayHeader = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const countdown = (iso: string) => {
  const d = daysUntil(iso);
  if (d == null) return '';
  if (d === 0) return 'HÔM NAY';
  return d > 0 ? `còn ${d} ngày` : `đã khởi hành ${Math.abs(d)} ngày`;
};

export function DepartureCalendar() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const users = useAuthStore((s) => s.users);
  const me = useAuthStore((s) => s.currentUser);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [range, setRange] = useState<Range>('30');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');

  const nameOf = (u?: string) => users.find((x) => x.u === u)?.name ?? u ?? '';

  const groups = useMemo(() => {
    let list = visibleQuotes().filter((q) => q.departDate);
    if (mine && me) list = list.filter((q) => q.workflowSummary?.currentAssignee === me.u || q.createdByUsername === me.u);
    list = list.filter((q) => {
      const d = daysUntil(q.departDate!);
      if (d == null) return false;
      if (range === 'past') return d < 0;
      if (range === '7') return d >= 0 && d <= 7;
      if (range === '30') return d >= 0 && d <= 30;
      return d >= 0; // upcoming
    });
    const ranked = filterRank(list, search, (q) => [q.name, q.quoteCode, q.customerName, q.workflowSummary?.current].filter(Boolean).join(' '));
    const byDate = new Map<string, CloudQuoteEntry[]>();
    for (const q of ranked) {
      const k = q.departDate!.slice(0, 10);
      (byDate.get(k) ?? byDate.set(k, []).get(k)!).push(q);
    }
    const keys = [...byDate.keys()].sort((a, b) => (range === 'past' ? b.localeCompare(a) : a.localeCompare(b)));
    return keys.map((k) => ({ date: k, items: byDate.get(k)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, range, mine, search, me]);

  const total = groups.reduce((a, g) => a + g.items.length, 0);

  const open = async (q: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== q.cloudId &&
      !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(q.cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView('workflow');
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>📅 Lịch khởi hành</Typography>
          <Typography variant="caption" color="text.secondary">{total} tour · {RANGE_LABEL[range]}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tour, mã, khách…" sx={{ minWidth: 200 }} />
          <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => <ToggleButton key={r} value={r}>{RANGE_LABEL[r]}</ToggleButton>)}
          </ToggleButtonGroup>
          <ToggleButton size="small" value="mine" selected={mine} onChange={() => setMine((v) => !v)} color="primary">👤 Của tôi</ToggleButton>
        </Stack>
      </Stack>

      {groups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Không có tour nào khởi hành trong khoảng đã chọn. Ngày khởi hành lấy từ báo giá đã <b>lưu cloud</b>.
        </Paper>
      ) : (
        <Stack spacing={2}>
          {groups.map((g) => {
            const cd = countdown(g.date);
            const soon = (daysUntil(g.date) ?? 99) <= 3;
            return (
              <Box key={g.date}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.75, position: 'sticky', top: 0 }}>
                  <Typography fontWeight={800} fontSize={14} sx={{ color: '#0d7a6a', textTransform: 'capitalize' }}>{fmtDayHeader(g.date)}</Typography>
                  {cd && <Chip size="small" color={soon ? 'error' : 'default'} variant={soon ? 'filled' : 'outlined'} label={cd} sx={{ height: 20, fontWeight: 700 }} />}
                </Stack>
                <Stack spacing={1}>
                  {g.items.map((q) => {
                    const wf = q.workflowSummary;
                    const stMeta = q.status ? QUOTE_STATUS_META[q.status] : null;
                    return (
                      <Paper key={q.cloudId} variant="outlined" sx={{ p: 1.5, cursor: 'pointer', borderLeft: '4px solid #14a08c', ...(wf?.overdue ? { borderLeftColor: '#dc3250' } : {}) }} onClick={() => void open(q)}>
                        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
                          <Box sx={{ flex: 1, minWidth: 220 }}>
                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                              <Typography fontWeight={700} fontSize={13.5}>{q.name}</Typography>
                              {stMeta && <Chip size="small" label={stMeta.label} sx={{ height: 18, bgcolor: stMeta.color + '22', color: stMeta.color, fontWeight: 700 }} />}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {q.quoteCode ? `${q.quoteCode} · ` : ''}{q.customerName || q.createdByName} · {q.pax} khách
                            </Typography>
                          </Box>
                          <Box sx={{ minWidth: 150 }}>
                            <Typography variant="caption" color="text.secondary">{wf?.current ?? '— hoàn tất —'}{wf?.currentAssignee ? ` · 👤 ${nameOf(wf.currentAssignee)}` : ''}</Typography>
                            {wf && (
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <LinearProgress variant="determinate" value={wf.donePct} sx={{ flex: 1, height: 6, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: wf.donePct === 100 ? '#27ae60' : '#14a08c' } }} />
                                <Typography variant="caption" fontWeight={700}>{wf.donePct}%</Typography>
                                {wf.overdue > 0 && <Chip size="small" color="error" label={`${wf.overdue} trễ`} sx={{ height: 18, fontWeight: 700 }} />}
                              </Stack>
                            )}
                          </Box>
                          <Button size="small" startIcon={<OpenInNewIcon />} onClick={(e) => { e.stopPropagation(); void open(q); }} sx={{ color: '#0d7a6a' }}>Mở</Button>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
