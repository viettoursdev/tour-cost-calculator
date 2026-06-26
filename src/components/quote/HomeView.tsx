import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useQuoteStore, type QuoteViewKey } from '@/stores/quoteStore';
import { useHrLeaveStore } from '@/stores/hrLeaveStore';
import { useHrStore } from '@/stores/hrStore';
import { daysUntil } from '@/lib/dateUtils';
import { ROLE_RANK, isApprover } from '@/auth/ROLES';
import { canViewTravelerDocs } from '@/auth/customerDocs';
import { fmtVND } from './calc';
import { TodoPanel } from '@/components/todo/TodoPanel';
import { TodoModal } from '@/components/todo/TodoModal';
import { DEPARTMENTS } from '@/auth/departments';
import { PROCESS_SEED, DEPT_COLOR, DEPT_ICON } from '@/components/process/processSeed';
import { runProgress, currentStep } from '@/components/process/processRun';
import { useProcessStore } from '@/stores/processStore';
import { useHomePrefStore } from '@/stores/homePrefStore';
import { HomeCustomizeModal } from './HomeCustomizeModal';
import {
  HOME_SECTION_IDS, reconcileHomeLayout, isCollapsed, toggleCollapsed, type HomeLayout,
} from './homeLayout';
import type { CloudQuoteEntry, Department, LeaveType, Todo } from '@/types';

const PROCESS_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];

/** Nhãn từng thẻ trang chủ (hiển thị trong hộp thoại tùy chỉnh). */
const SECTION_LABELS: Record<string, string> = {
  todo: '📋 Việc cần làm',
  process: '🗂️ Quy trình phòng ban',
  myRuns: '▶️ Quy trình đang chạy của tôi',
  deadlines: '⏳ Deadline công việc (2 tuần)',
  soon: '🛫 Tour sắp khởi hành (7 ngày)',
  myOverdue: '⏱ Việc quá hạn của tôi',
  nccDue: '🏦 Đến hạn trả NCC (2 tuần)',
  owing: '💰 Đã khởi hành còn nợ NCC',
  docs: '🛂 Giấy tờ khách sắp hết hạn',
  leaves: '🌴 Nghỉ phép chờ duyệt',
  followups: '📅 Hẹn liên hệ khách hôm nay',
};
/** Thẻ chiếm trọn chiều ngang (phần còn lại xếp lưới 2 cột). */
const FULL_SPAN = new Set(['todo', 'process', 'myRuns', 'deadlines']);

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Nghỉ phép năm', unpaid: 'Nghỉ không lương', sick: 'Nghỉ ốm', other: 'Nghỉ khác',
};

type Scope = 'me' | 'dept' | 'all';

function Section({ icon, title, count, color, onAll, collapsed, onToggleCollapse, children }: {
  icon: string; title: string; count: number; color: string; onAll?: () => void;
  collapsed?: boolean; onToggleCollapse?: () => void; children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderTop: `3px solid ${color}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: collapsed ? 0 : 1 }}>
        <Typography fontWeight={800} fontSize={14}>{icon} {title}</Typography>
        <Chip size="small" label={count} sx={{ height: 20, fontWeight: 800, bgcolor: color + '22', color }} />
        <Box sx={{ flex: 1 }} />
        {onAll && count > 0 && !collapsed && <Button size="small" onClick={onAll} sx={{ color }}>Xem tất cả →</Button>}
        {onToggleCollapse && (
          <Tooltip title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
            <IconButton size="small" onClick={onToggleCollapse} sx={{ color }}>
              {collapsed ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {!collapsed && (count === 0
        ? <Typography variant="caption" color="text.disabled">Không có mục nào 🎉</Typography>
        : children)}
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
  const users = useAuthStore((s) => s.users);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const customers = useCustomerStore((s) => s.customers);
  const leaves = useHrLeaveStore((s) => s.leaves);
  const employees = useHrStore((s) => s.employees);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const processRuns = useProcessStore((s) => s.runs);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);
  const homeRaw = useHomePrefStore((s) => s.raw);
  const loadHomePref = useHomePrefStore((s) => s.load);
  const customizeOpen = useHomePrefStore((s) => s.customizeOpen);
  const setCustomizeOpen = useHomePrefStore((s) => s.setCustomizeOpen);
  const [todoOpen, setTodoOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<Todo | null>(null);
  const [scope, setScope] = useState<Scope>('me');

  const amApprover = !!me && isApprover(me.role);
  // Quản lý (≥ Phó Phòng) mới được lọc theo phòng / tất cả.
  const canDept = !!me && ROLE_RANK[me.role] >= ROLE_RANK['Phó Phòng'];

  useEffect(() => { loadHomePref(me?.u); }, [me?.u, loadHomePref]);
  // Người duyệt: nạp đơn nghỉ phép + danh bạ NV để hiện thẻ "Nghỉ phép chờ duyệt".
  useEffect(() => {
    if (!amApprover) return;
    const un1 = useHrLeaveStore.getState().init();
    const un2 = useHrStore.getState().init();
    return () => { un1?.(); un2?.(); };
  }, [amApprover]);

  // Catalog khả dụng theo quyền (thẻ nghỉ phép chỉ cho người duyệt).
  const applicableIds = useMemo(
    () => HOME_SECTION_IDS.filter((id) => (id === 'leaves' ? amApprover : true)),
    [amApprover],
  );
  const layout = useMemo(() => reconcileHomeLayout(applicableIds, homeRaw), [applicableIds, homeRaw]);
  const rows = layout.rowsPer;
  const saveLayout = (l: HomeLayout) => useHomePrefStore.getState().save(me?.u, l);
  const collapseProps = (id: string) => ({
    collapsed: isCollapsed(layout, id),
    onToggleCollapse: () => saveLayout(toggleCollapsed(layout, id)),
  });

  // Tập username trong phòng của tôi (cho phạm vi "Cả phòng").
  const deptUsers = useMemo(() => {
    const s = new Set<string>();
    if (me?.u) s.add(me.u);
    if (me?.department) for (const u of users) if (u.department === me.department && u.u) s.add(u.u);
    return s;
  }, [users, me]);

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

  // Phạm vi áp cho các thẻ CÁ NHÂN (việc/deadline/khách của tôi). Thẻ vận hành
  // (tour khởi hành, công nợ/đến hạn NCC) luôn hiện toàn bộ dữ liệu được phép xem.
  const inScope = (owner?: string | null) => {
    if (scope === 'all') return true;
    if (!owner) return false;
    return scope === 'dept' ? deptUsers.has(owner) : owner === me?.u;
  };

  const data = useMemo(() => {
    const list = visibleQuotes();
    const soon = list.filter((q) => { const d = q.departDate ? daysUntil(q.departDate) : null; return d != null && d >= 0 && d <= 7; })
      .sort((a, b) => (a.departDate ?? '').localeCompare(b.departDate ?? ''));
    const myOverdue = list.flatMap((q) => (q.workflowDue ?? [])
      .filter((w) => inScope(w.assignee ?? q.createdByUsername) && w.dueDate < today)
      .map((w) => ({ q, w })))
      .sort((a, b) => a.w.dueDate.localeCompare(b.w.dueDate));
    const owing = list.filter((q) => (q.paymentSummary?.remaining ?? 0) > 0 && q.departDate != null && (daysUntil(q.departDate) ?? 1) < 0)
      .sort((a, b) => (b.paymentSummary!.remaining - a.paymentSummary!.remaining));
    const followups = customers.filter((c) => c.nextFollowUp && inScope(c.nextFollowUp.byU) && c.nextFollowUp.date <= today)
      .sort((a, b) => (a.nextFollowUp!.date).localeCompare(b.nextFollowUp!.date));

    const now = Date.now();
    const horizon = now + 14 * 86400000;
    const stepTarget = (d: string) => new Date(d.includes('T') ? d : d + 'T23:59:59').getTime();

    // Deadline công việc trong 2 tuần tới (đếm ngược ngày/giờ). Gồm deadline báo giá
    // (datetime, người tạo/collab trong phạm vi) và bước quy trình SẮP tới.
    const deadlines: { key: string; q: CloudQuoteEntry; label: string; target: number; view: QuoteViewKey }[] = [];
    // Đến hạn trả NCC (gồm cả quá hạn) — thẻ vận hành, không lọc theo phạm vi cá nhân.
    const nccDue: { key: string; q: CloudQuoteEntry; n: NonNullable<CloudQuoteEntry['nccDue']>[number]; target: number }[] = [];
    for (const q of list) {
      const mine = inScope(q.createdByUsername) || (q.collaborators ?? []).some((c) => c.u === me?.u);
      const closed = q.status === 'won' || q.status === 'not_selected' || q.status === 'cancelled';
      if (q.deadline && mine && !closed) {
        const t = new Date(q.deadline).getTime();
        if (!isNaN(t) && t <= horizon) deadlines.push({ key: `${q.cloudId}:dl`, q, label: 'Deadline báo giá', target: t, view: 'cost' });
      }
      for (const w of q.workflowDue ?? []) {
        if (!inScope(w.assignee ?? q.createdByUsername)) continue;
        const t = stepTarget(w.dueDate);
        if (isNaN(t) || t < now || t > horizon) continue; // chỉ bước sắp tới (chưa quá hạn)
        deadlines.push({ key: `${q.cloudId}:${w.label}:${w.dueDate}`, q, label: w.label, target: t, view: 'workflow' });
      }
      for (const n of q.nccDue ?? []) {
        const t = stepTarget(n.dueDate);
        if (isNaN(t) || t > horizon) continue; // gồm quá hạn + tới hạn trong 2 tuần
        nccDue.push({ key: `${q.cloudId}:${n.label}:${n.dueDate}`, q, n, target: t });
      }
    }
    deadlines.sort((a, b) => a.target - b.target);
    nccDue.sort((a, b) => a.target - b.target);

    // Giấy tờ khách (hộ chiếu/visa) sắp hết hạn ≤ 90 ngày — siết quyền xem PII.
    const docs: { key: string; traveler: string; kind: string; customerName: string; days: number }[] = [];
    for (const c of customers) {
      if (!canViewTravelerDocs(me, c)) continue;
      if (!inScope(c.ownerU ?? c.createdByU)) continue;
      for (const t of c.travelers ?? []) {
        for (const [field, kind] of [['passportExpiry', 'Hộ chiếu'], ['visaExpiry', 'Visa']] as const) {
          const exp = t[field];
          if (!exp) continue;
          const d = daysUntil(exp);
          if (d == null || d > 90) continue;
          docs.push({ key: `${c.id}:${t.id}:${field}`, traveler: t.fullName, kind, customerName: c.name, days: d });
        }
      }
    }
    docs.sort((a, b) => a.days - b.days);

    return { soon, myOverdue, owing, followups, deadlines, nccDue, docs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, customers, me, scope, deptUsers]);

  const leavesPending = useMemo(() => {
    const nameOf = (id: string) => employees.find((e) => e.id === id)?.fullName ?? id;
    return leaves
      .filter((l) => l.status === 'pending')
      .map((l) => ({ ...l, employeeName: nameOf(l.employeeId) }))
      .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
  }, [leaves, employees]);

  // Phiên chạy quy trình đang hoạt động (theo phạm vi).
  const myRuns = processRuns
    .filter((r) => r.status === 'active' && (inScope(r.assignee) || inScope(r.createdByUsername)))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const openRun = (id: string) => { setOpenRun(id); setView('process'); };

  // Mỗi thẻ là 1 node theo id ổn định; render theo `layout` (thứ tự + ẩn/hiện + thu gọn).
  // `myRuns` chỉ render khi có phiên đang chạy (= null thì bỏ qua dù đang hiện).
  const nodes: Record<string, React.ReactNode | null> = {
    todo: <TodoPanel onEdit={(t) => { setEditTodo(t); setTodoOpen(true); }} />,
    process: (
      <Section icon="🗂️" title="Quy trình phòng ban" count={PROCESS_SEED.length} color="#0d7a6a" onAll={() => go('process')} {...collapseProps('process')}>
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
    ),
    myRuns: myRuns.length === 0 ? null : (
      <Section icon="▶️" title="Quy trình đang chạy của tôi" count={myRuns.length} color="#0d7a6a" onAll={() => go('process')} {...collapseProps('myRuns')}>
        <Stack spacing={0.75}>
          {myRuns.slice(0, rows).map((r) => {
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
    ),
    deadlines: (
      <Section icon="⏳" title="Deadline công việc (2 tuần)" count={data.deadlines.length} color="#7c3aed" onAll={() => go('workflow')} {...collapseProps('deadlines')}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
          {data.deadlines.slice(0, rows).map((d) => {
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
    ),
    soon: (
      <Section icon="🛫" title="Tour sắp khởi hành (7 ngày)" count={data.soon.length} color="#14a08c" onAll={() => go('departures')} {...collapseProps('soon')}>
        <Stack spacing={0.75}>
          {data.soon.slice(0, rows).map((q) => (
            <Row key={q.cloudId} onClick={() => void openQuote(q, 'workflow')}
              primary={q.name}
              secondary={`${q.customerName || q.createdByName} · ${q.pax} khách`}
              right={<Chip size="small" color={(daysUntil(q.departDate!) ?? 9) <= 2 ? 'error' : 'default'} variant="outlined"
                label={daysUntil(q.departDate!) === 0 ? 'HÔM NAY' : `còn ${daysUntil(q.departDate!)}n`} sx={{ height: 20, fontWeight: 700 }} />} />
          ))}
        </Stack>
      </Section>
    ),
    myOverdue: (
      <Section icon="⏱" title="Việc quá hạn của tôi" count={data.myOverdue.length} color="#dc3250" onAll={() => go('opsboard')} {...collapseProps('myOverdue')}>
        <Stack spacing={0.75}>
          {data.myOverdue.slice(0, rows).map(({ q, w }, i) => (
            <Row key={`${q.cloudId}-${i}`} onClick={() => void openQuote(q, 'workflow')}
              primary={`${w.label}`}
              secondary={q.name}
              right={<Typography variant="caption" sx={{ color: '#dc3250', fontWeight: 700 }}>{new Date(w.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
    nccDue: (
      <Section icon="🏦" title="Đến hạn trả NCC (2 tuần)" count={data.nccDue.length} color="#f5a623" onAll={() => go('payboard')} {...collapseProps('nccDue')}>
        <Stack spacing={0.75}>
          {data.nccDue.slice(0, rows).map((d) => {
            const cd = countdown(d.target, nowMs);
            return (
              <Row key={d.key} onClick={() => void openQuote(d.q, 'payment')}
                primary={d.n.supplier ? `${d.n.supplier} · ${d.n.label}` : d.n.label}
                secondary={d.q.name}
                right={
                  <Stack alignItems="flex-end" spacing={0.25}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#f5a623' }}>{fmtVND(d.n.amount)}</Typography>
                    <Chip size="small" color={cd.overdue || cd.urgent ? 'error' : 'warning'} variant={cd.overdue ? 'filled' : 'outlined'}
                      label={cd.text} sx={{ height: 18, fontWeight: 700 }} />
                  </Stack>
                } />
            );
          })}
        </Stack>
      </Section>
    ),
    owing: (
      <Section icon="💰" title="Đã khởi hành còn nợ NCC" count={data.owing.length} color="#f5a623" onAll={() => go('payboard')} {...collapseProps('owing')}>
        <Stack spacing={0.75}>
          {data.owing.slice(0, rows).map((q) => (
            <Row key={q.cloudId} onClick={() => void openQuote(q, 'payment')}
              primary={q.name}
              secondary={q.customerName || q.createdByName}
              right={<Typography variant="caption" sx={{ color: '#dc3250', fontWeight: 700 }}>{fmtVND(q.paymentSummary!.remaining)}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
    docs: (
      <Section icon="🛂" title="Giấy tờ khách sắp hết hạn" count={data.docs.length} color="#dc3250" onAll={() => go('customer')} {...collapseProps('docs')}>
        <Stack spacing={0.75}>
          {data.docs.slice(0, rows).map((d) => (
            <Row key={d.key} onClick={() => go('customer')}
              primary={`${d.traveler} · ${d.kind}`}
              secondary={d.customerName}
              right={<Typography variant="caption" sx={{ color: d.days < 0 ? '#dc3250' : d.days <= 30 ? '#f5a623' : 'text.secondary', fontWeight: 700 }}>
                {d.days < 0 ? `hết hạn ${-d.days}n trước` : `còn ${d.days}n`}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
    leaves: !amApprover ? null : (
      <Section icon="🌴" title="Nghỉ phép chờ duyệt" count={leavesPending.length} color="#2563eb" onAll={() => go('hr')} {...collapseProps('leaves')}>
        <Stack spacing={0.75}>
          {leavesPending.slice(0, rows).map((l) => (
            <Row key={l.id} onClick={() => go('hr')}
              primary={l.employeeName}
              secondary={`${LEAVE_TYPE_LABEL[l.type] ?? 'Nghỉ phép'} · ${l.days} ngày`}
              right={<Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 700 }}>
                {l.startDate ? new Date(l.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : ''}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
    followups: (
      <Section icon="📅" title="Hẹn liên hệ khách hôm nay" count={data.followups.length} color="#2563eb" onAll={() => go('customer')} {...collapseProps('followups')}>
        <Stack spacing={0.75}>
          {data.followups.slice(0, rows).map((c) => (
            <Row key={c.id} onClick={() => go('customer')}
              primary={c.name}
              secondary={c.nextFollowUp!.note || 'Liên hệ lại'}
              right={<Typography variant="caption" sx={{ color: c.nextFollowUp!.date < today ? '#dc3250' : '#2563eb', fontWeight: 700 }}>
                {new Date(c.nextFollowUp!.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
  };

  const visibleIds = layout.order.filter((id) => !layout.hidden.includes(id) && nodes[id] != null);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={900} fontSize={18}>👋 Chào {me?.name ?? ''}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} · việc cần để ý hôm nay
          </Typography>
        </Box>
        {canDept && (
          <ToggleButtonGroup
            size="small" exclusive value={scope}
            onChange={(_, v) => { if (v) setScope(v as Scope); }}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.25, fontSize: 12, textTransform: 'none' } }}
          >
            <ToggleButton value="me">Của tôi</ToggleButton>
            <ToggleButton value="dept">Cả phòng</ToggleButton>
            <ToggleButton value="all">Tất cả</ToggleButton>
          </ToggleButtonGroup>
        )}
        <Tooltip title="Tùy chỉnh trang Hôm nay">
          <IconButton size="small" onClick={() => setCustomizeOpen(true)} sx={{ color: '#0d7a6a' }}>
            <TuneIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {todoOpen && <TodoModal todo={editTodo} onClose={() => setTodoOpen(false)} />}
      <HomeCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        labels={SECTION_LABELS}
        layout={layout}
        onChange={saveLayout}
        onReset={() => useHomePrefStore.getState().reset(me?.u)}
      />

      {visibleIds.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ mt: 2 }}>
          Tất cả thẻ đang ẩn. Bấm ⚙️ ở góc trên để hiện lại.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          {visibleIds.map((id) => (
            <Box key={id} sx={FULL_SPAN.has(id) ? { gridColumn: { md: '1 / -1' } } : undefined}>
              {nodes[id]}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
