import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useQuoteStore, type QuoteViewKey } from '@/stores/quoteStore';
import { daysUntil } from '@/lib/dateUtils';
import { fmtVND } from './calc';
import { TodoPanel } from '@/components/todo/TodoPanel';
import { TodoModal } from '@/components/todo/TodoModal';
import { DEPARTMENTS } from '@/auth/departments';
import { PROCESS_SEED, DEPT_COLOR, DEPT_ICON } from '@/components/process/processSeed';
import { runProgress, currentStep } from '@/components/process/processRun';
import { useProcessStore } from '@/stores/processStore';
import type { CloudQuoteEntry, Department, Todo } from '@/types';

const PROCESS_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];

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

/** Đếm ngược tới mốc `target` (ms). Trả về nhãn "còn 2 ngày 5 giờ" / "QUÁ HẠN …". */
function countdown(target: number, now: number): { text: string; overdue: boolean; urgent: boolean } {
  const diff = target - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const core = days > 0 ? `${days} ngày ${hours} giờ` : hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`;
  return { text: overdue ? `QUÁ HẠN ${core}` : `còn ${core}`, overdue, urgent: !overdue && diff <= 86400000 };
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
  const processRuns = useProcessStore((s) => s.runs);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);
  const [todoOpen, setTodoOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<Todo | null>(null);
  // Phiên chạy quy trình đang hoạt động của tôi (phụ trách hoặc tự tạo).
  const myRuns = processRuns
    .filter((r) => r.status === 'active' && (r.assignee === me?.u || r.createdByUsername === me?.u))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const openRun = (id: string) => { setOpenRun(id); setView('process'); };

  const today = new Date().toISOString().slice(0, 10);
  // Đồng hồ đếm ngược: nhịp lại mỗi phút để nhãn "còn … giờ" tự cập nhật.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
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

    // Deadline công việc trong 2 tuần tới (đếm ngược ngày/giờ). Gồm deadline báo giá
    // (datetime, người tạo + collab) và bước quy trình SẮP tới của tôi (bước quá hạn
    // đã có mục riêng "Việc quá hạn của tôi").
    const now = Date.now();
    const horizon = now + 14 * 86400000;
    const stepTarget = (d: string) => new Date(d.includes('T') ? d : d + 'T23:59:59').getTime();
    const deadlines: { key: string; q: CloudQuoteEntry; label: string; target: number; view: QuoteViewKey }[] = [];
    for (const q of list) {
      const mine = q.createdByUsername === me?.u || (q.collaborators ?? []).some((c) => c.u === me?.u);
      const closed = q.status === 'won' || q.status === 'not_selected' || q.status === 'cancelled';
      if (q.deadline && mine && !closed) {
        const t = new Date(q.deadline).getTime();
        if (!isNaN(t) && t <= horizon) deadlines.push({ key: `${q.cloudId}:dl`, q, label: 'Deadline báo giá', target: t, view: 'cost' });
      }
      for (const w of q.workflowDue ?? []) {
        const forMe = w.assignee ? w.assignee === me?.u : q.createdByUsername === me?.u;
        if (!forMe) continue;
        const t = stepTarget(w.dueDate);
        if (isNaN(t) || t < now || t > horizon) continue; // chỉ bước sắp tới (chưa quá hạn)
        deadlines.push({ key: `${q.cloudId}:${w.label}:${w.dueDate}`, q, label: w.label, target: t, view: 'workflow' });
      }
    }
    deadlines.sort((a, b) => a.target - b.target);
    return { soon, myOverdue, owing, followups, deadlines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, customers, me]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Typography fontWeight={900} fontSize={18}>👋 Chào {me?.name ?? ''}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} · việc cần để ý hôm nay
      </Typography>

      <Box sx={{ mb: 1.5 }}>
        <TodoPanel onEdit={(t) => { setEditTodo(t); setTodoOpen(true); }} />
      </Box>

      {todoOpen && <TodoModal todo={editTodo} onClose={() => setTodoOpen(false)} />}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        <Box sx={{ gridColumn: { md: '1 / -1' } }}>
          <Section icon="🗂️" title="Quy trình phòng ban" count={PROCESS_SEED.length} color="#0d7a6a" onAll={() => go('process')}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 0.75 }}>
              {DEPARTMENTS.filter((d) => PROCESS_DEPTS.includes(d.id)).map((d) => {
                const color = DEPT_COLOR[d.id];
                const n = PROCESS_SEED.filter((t) => t.department === d.id).length;
                return (
                  <Paper key={d.id} variant="outlined" onClick={() => go('process')}
                    sx={{ p: 1, cursor: 'pointer', textAlign: 'center', borderTop: `3px solid ${color}`, '&:hover': { boxShadow: 1 } }}>
                    <Box sx={{ fontSize: 22 }}>{DEPT_ICON[d.id]}</Box>
                    <Typography fontSize={11.5} fontWeight={700} noWrap>{d.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{n} quy trình</Typography>
                  </Paper>
                );
              })}
            </Box>
          </Section>
        </Box>

        {myRuns.length > 0 && (
          <Box sx={{ gridColumn: { md: '1 / -1' } }}>
            <Section icon="▶️" title="Quy trình đang chạy của tôi" count={myRuns.length} color="#0d7a6a" onAll={() => go('process')}>
              <Stack spacing={0.75}>
                {myRuns.slice(0, 6).map((r) => {
                  const p = runProgress(r);
                  const cur = currentStep(r);
                  const color = DEPT_COLOR[r.department];
                  const overdue = r.dueDate ? r.dueDate < today : false;
                  return (
                    <Row key={r.id} onClick={() => openRun(r.id)}
                      primary={r.title}
                      secondary={cur ? `Bước: ${cur.label}${r.ref ? ` · ${r.ref.label}` : ''}` : (r.ref?.label ?? '')}
                      right={
                        <Stack alignItems="flex-end" spacing={0.25}>
                          <Chip size="small" label={`${p.done}/${p.total} · ${p.pct}%`} sx={{ height: 20, fontWeight: 700, bgcolor: color + '22', color }} />
                          {r.dueDate && <Typography variant="caption" sx={{ color: overdue ? '#dc3250' : 'text.disabled', fontWeight: overdue ? 700 : 400 }}>
                            {new Date(r.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                          </Typography>}
                        </Stack>
                      } />
                  );
                })}
              </Stack>
            </Section>
          </Box>
        )}

        <Box sx={{ gridColumn: { md: '1 / -1' } }}>
          <Section icon="⏳" title="Deadline công việc (2 tuần)" count={data.deadlines.length} color="#7c3aed" onAll={() => go('workflow')}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
              {data.deadlines.slice(0, 8).map((d) => {
                const cd = countdown(d.target, nowMs);
                const color = cd.overdue || cd.urgent ? 'error' : 'warning';
                return (
                  <Row key={d.key} onClick={() => void openQuote(d.q, d.view)}
                    primary={d.label}
                    secondary={`${d.q.name}${d.q.customerName ? ` · ${d.q.customerName}` : ''}`}
                    right={
                      <Stack alignItems="flex-end" spacing={0.25}>
                        <Chip size="small" color={color} variant={cd.overdue ? 'filled' : 'outlined'}
                          label={cd.text} sx={{ height: 20, fontWeight: 700 }} />
                        <Typography variant="caption" color="text.disabled">
                          {new Date(d.target).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Stack>
                    } />
                );
              })}
            </Box>
          </Section>
        </Box>

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
