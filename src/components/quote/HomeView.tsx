import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SnoozeIcon from '@mui/icons-material/Snooze';
import DoneIcon from '@mui/icons-material/Done';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useQuoteStore, type QuoteViewKey } from '@/stores/quoteStore';
import { useHrLeaveStore } from '@/stores/hrLeaveStore';
import { useHrStore } from '@/stores/hrStore';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useRecentStore } from '@/stores/recentStore';
import { useHomeTargetsStore } from '@/stores/homeTargetsStore';
import { daysUntil } from '@/lib/dateUtils';
import { ROLE_RANK, isApprover } from '@/auth/ROLES';
import { myEmployee } from '@/auth/recordAccess';
import { periodLabelVN } from '@/lib/attendance/attendanceCalc';
import { AttendanceSelfDialog } from '@/components/hr/AttendanceSelfDialog';
import { canViewTravelerDocs } from '@/auth/customerDocs';
import { fmtVND } from './calc';
import { TodoPanel } from '@/components/todo/TodoPanel';
import { TodoModal } from '@/components/todo/TodoModal';
import { DEPARTMENTS } from '@/auth/departments';
import { PROCESS_SEED, DEPT_COLOR, DEPT_ICON } from '@/components/process/processSeed';
import { runProgress, currentStep } from '@/components/process/processRun';
import { useProcessStore } from '@/stores/processStore';
import { useHomePrefStore } from '@/stores/homePrefStore';
import { useHomeBadgeStore } from '@/stores/homeBadgeStore';
import { HomeCustomizeModal } from './HomeCustomizeModal';
import { HOME_SECTION_IDS, isCollapsed, toggleCollapsed, type HomeLayout } from './homeLayout';
import { computeHomeStats, computeMonthProgress, pctOf } from './homeStats';
import { rankPriority, severityOf, type PriKind, type PriSeverity } from './homePriority';
import { buildDigest } from './homeDigest';
import { weekAgenda, weeklyQuoteCounts } from './homeAgenda';
import {
  normalizePresets, activeLayout, setActiveLayout, switchPreset, addPreset, type PresetState,
} from './homePresets';
import { Section, Kpi, Sparkline, Row, QuickBtn } from './homeWidgets';
import { SECTION_LABELS, FULL_SPAN, LEAVE_TYPE_LABEL, PRI_ICON, PRI_COLOR, countdown } from './homeConst';
import { ATTENDANCE_CONFIRM_LABEL, type CloudQuoteEntry, type Department, type Todo } from '@/types';

const PROCESS_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];

type Scope = 'me' | 'dept' | 'all';

export function HomeView() {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const customers = useCustomerStore((s) => s.customers);
  const leaves = useHrLeaveStore((s) => s.leaves);
  const employees = useHrStore((s) => s.employees);
  const attendances = useAttendanceStore((s) => s.attendances);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const processRuns = useProcessStore((s) => s.runs);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);
  const homeRaw = useHomePrefStore((s) => s.raw);
  const loadHomePref = useHomePrefStore((s) => s.load);
  const customizeOpen = useHomePrefStore((s) => s.customizeOpen);
  const setCustomizeOpen = useHomePrefStore((s) => s.setCustomizeOpen);
  const notifications = useNotificationStore((s) => s.notifications);
  const recentItems = useRecentStore((s) => s.items);
  const loadRecent = useRecentStore((s) => s.load);
  const targets = useHomeTargetsStore((s) => s.targets);
  const loadTargets = useHomeTargetsStore((s) => s.load);
  const [todoOpen, setTodoOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<Todo | null>(null);
  const [scope, setScope] = useState<Scope>('me');
  const [attSelfOpen, setAttSelfOpen] = useState(false);

  // Bảng công của CHÍNH user (khớp hồ sơ nhân sự qua email/tên) đã được công bố.
  const myEmp = useMemo(() => myEmployee(me, employees), [me, employees]);
  const myAttendance = useMemo(
    () => (myEmp
      ? attendances
        .filter((a) => a.employeeLegacyId === myEmp.id && a.status !== 'draft')
        .sort((a, b) => b.period.localeCompare(a.period))
      : []),
    [myEmp, attendances],
  );
  const myAttPending = useMemo(() => myAttendance.filter((a) => a.confirmation.status === 'pending'), [myAttendance]);

  const amApprover = !!me && isApprover(me.role);
  // Quản lý (≥ Phó Phòng) mới được lọc theo phòng / tất cả.
  const canDept = !!me && ROLE_RANK[me.role] >= ROLE_RANK['Phó Phòng'];

  useEffect(() => { loadHomePref(me?.u); loadRecent(me?.u); loadTargets(me?.u); }, [me?.u, loadHomePref, loadRecent, loadTargets]);
  // Người duyệt: nạp đơn nghỉ phép + danh bạ NV để hiện thẻ "Nghỉ phép chờ duyệt".
  useEffect(() => {
    if (!amApprover) return;
    const un1 = useHrLeaveStore.getState().init();
    const un2 = useHrStore.getState().init();
    return () => { un1?.(); un2?.(); };
  }, [amApprover]);

  // Catalog khả dụng theo quyền (thẻ nghỉ phép chỉ cho người duyệt).
  const applicableIds = useMemo(
    () => HOME_SECTION_IDS.filter((id) => {
      if (id === 'leaves') return amApprover;
      if (id === 'myAttendance') return !!myEmp;
      return true;
    }),
    [amApprover, myEmp],
  );
  // Bố cục đặt tên (preset). `presetState` chuẩn hoá từ blob; `layout` = preset đang chọn.
  const presetState: PresetState = useMemo(() => normalizePresets(applicableIds, homeRaw), [applicableIds, homeRaw]);
  const layout = activeLayout(presetState);
  const rows = layout.rowsPer;
  const savePresets = (st: PresetState) => useHomePrefStore.getState().save(me?.u, st);
  const saveLayout = (l: HomeLayout) => savePresets(setActiveLayout(presetState, l));
  const collapseProps = (id: string) => ({
    collapsed: isCollapsed(layout, id),
    onToggleCollapse: () => saveLayout(toggleCollapsed(layout, id)),
  });
  const onPickPreset = (id: string) => {
    if (id === '__new__') {
      const name = window.prompt('Tên bố cục mới:', `Bố cục ${presetState.presets.length + 1}`);
      if (name == null) return;
      savePresets(addPreset(presetState, name));
    } else savePresets(switchPreset(presetState, id));
  };

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

  // Phạm vi áp cho các thẻ CÁ NHÂN. Thẻ vận hành (tour/công nợ/đến hạn NCC) luôn full.
  const inScope = (owner?: string | null) => {
    if (scope === 'all') return true;
    if (!owner) return false;
    return scope === 'dept' ? deptUsers.has(owner) : owner === me?.u;
  };

  const { docsDays, tourDays } = layout;
  const data = useMemo(() => {
    const list = visibleQuotes();
    const stats = computeHomeStats(list);
    const soon = list.filter((q) => { const d = q.departDate ? daysUntil(q.departDate) : null; return d != null && d >= 0 && d <= tourDays; })
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

    const deadlines: { key: string; q: CloudQuoteEntry; label: string; target: number; view: QuoteViewKey }[] = [];
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
        if (isNaN(t) || t < now || t > horizon) continue;
        deadlines.push({ key: `${q.cloudId}:${w.label}:${w.dueDate}`, q, label: w.label, target: t, view: 'workflow' });
      }
      for (const n of q.nccDue ?? []) {
        const t = stepTarget(n.dueDate);
        if (isNaN(t) || t > horizon) continue;
        nccDue.push({ key: `${q.cloudId}:${n.label}:${n.dueDate}`, q, n, target: t });
      }
    }
    deadlines.sort((a, b) => a.target - b.target);
    nccDue.sort((a, b) => a.target - b.target);

    const docs: { key: string; traveler: string; kind: string; customerName: string; days: number; ts: number }[] = [];
    for (const c of customers) {
      if (!canViewTravelerDocs(me, c)) continue;
      if (!inScope(c.ownerU ?? c.createdByU)) continue;
      for (const t of c.travelers ?? []) {
        for (const [field, kind] of [['passportExpiry', 'Hộ chiếu'], ['visaExpiry', 'Visa']] as const) {
          const exp = t[field];
          if (!exp) continue;
          const d = daysUntil(exp);
          if (d == null || d > docsDays) continue;
          docs.push({ key: `${c.id}:${t.id}:${field}`, traveler: t.fullName, kind, customerName: c.name, days: d, ts: new Date(exp).getTime() });
        }
      }
    }
    docs.sort((a, b) => a.days - b.days);

    const owingTotal = owing.reduce((s, q) => s + (q.paymentSummary?.remaining ?? 0), 0);
    const weeklyQuotes = weeklyQuoteCounts(list.map((q) => q.createdAt).filter(Boolean) as string[], 8, now);
    return { stats, soon, myOverdue, owing, owingTotal, followups, deadlines, nccDue, docs, weeklyQuotes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, customers, me, scope, deptUsers, docsDays, tourDays]);

  const leavesPending = useMemo(() => {
    const nameOf = (id: string) => employees.find((e) => e.id === id)?.fullName ?? id;
    return leaves
      .filter((l) => l.status === 'pending')
      .map((l) => ({ ...l, employeeName: nameOf(l.employeeId) }))
      .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
  }, [leaves, employees]);

  // Hàng đợi ưu tiên: gộp mọi cảnh báo + xếp hạng (xây ở render để gắn hành động mở hiện hành).
  const stepTs = (d: string) => new Date(d.includes('T') ? d : d + 'T23:59:59').getTime();
  type PItem = { id: string; kind: PriKind; primary: string; secondary?: string; dueTs: number | null; severity: PriSeverity; open: () => void };
  const priorityRaw: PItem[] = [];
  for (const { q, w } of data.myOverdue)
    priorityRaw.push({ id: `ov:${q.cloudId}:${w.label}:${w.dueDate}`, kind: 'overdue', primary: w.label, secondary: q.name, dueTs: stepTs(w.dueDate), severity: 'overdue', open: () => void openQuote(q, 'workflow') });
  for (const d of data.deadlines)
    priorityRaw.push({ id: d.key, kind: 'deadline', primary: d.label, secondary: `${d.q.name}${d.q.customerName ? ` · ${d.q.customerName}` : ''}`, dueTs: d.target, severity: severityOf(d.target, nowMs), open: () => void openQuote(d.q, d.view) });
  for (const d of data.nccDue)
    priorityRaw.push({ id: d.key, kind: 'ncc', primary: `${d.n.supplier ? d.n.supplier + ' · ' : ''}${d.n.label} — ${fmtVND(d.n.amount)}`, secondary: d.q.name, dueTs: d.target, severity: severityOf(d.target, nowMs), open: () => void openQuote(d.q, 'payment') });
  for (const d of data.docs)
    priorityRaw.push({ id: d.key, kind: 'doc', primary: `${d.traveler} · ${d.kind}`, secondary: d.customerName, dueTs: d.ts, severity: severityOf(d.ts, nowMs), open: () => go('customer') });
  for (const q of data.owing)
    priorityRaw.push({ id: `ow:${q.cloudId}`, kind: 'owing', primary: `${q.name} — nợ NCC ${fmtVND(q.paymentSummary!.remaining)}`, secondary: q.customerName || q.createdByName, dueTs: q.departDate ? new Date(q.departDate).getTime() : null, severity: 'overdue', open: () => void openQuote(q, 'payment') });
  const priority = rankPriority(priorityRaw);

  // Badge trên tab "Hôm nay" = số việc ưu tiên KHẨN (quá hạn + ≤24h).
  const badgeCount = priority.reduce((s, p) => s + (p.severity === 'soon' ? 0 : 1), 0);
  useEffect(() => { useHomeBadgeStore.getState().setCount(badgeCount); }, [badgeCount]);

  // Bản tin sáng + lịch tuần.
  const digest = buildDigest({
    overdue: data.myOverdue.length, deadlines: data.deadlines.length, departing: data.soon.length,
    nccDue: data.nccDue.length, docs: data.docs.length, leaves: leavesPending.length, followups: data.followups.length,
  });
  const agenda = weekAgenda({
    departing: data.soon.map((q) => q.departDate!).filter(Boolean),
    deadlines: data.deadlines.map((d) => new Date(d.target).toISOString().slice(0, 10)),
    followups: data.followups.map((c) => c.nextFollowUp!.date),
  }, today, 7);
  const agendaTotal = agenda.reduce((s, d) => s + d.total, 0);

  // Mục tiêu tháng (theo updatedAt báo giá đã chốt).
  const ym = today.slice(0, 7);
  const month = useMemo(() => computeMonthProgress(visibleQuotes(), ym), [quotes, ym]); // eslint-disable-line react-hooks/exhaustive-deps
  const editTargets = () => {
    const qStr = window.prompt('Mục tiêu số báo giá CHỐT trong tháng:', String(targets.quotes || ''));
    if (qStr == null) return;
    const rStr = window.prompt('Mục tiêu doanh thu trong tháng (VND):', String(targets.revenue || ''));
    if (rStr == null) return;
    useHomeTargetsStore.getState().save(me?.u, { quotes: Math.max(0, Math.round(Number(qStr) || 0)), revenue: Math.max(0, Math.round(Number(rStr) || 0)) });
  };

  // Thông báo chưa đọc (mới nhất trước).
  const unreadNotifs = useMemo(
    () => notifications.filter((n) => !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications],
  );
  const readNotif = (id: string) => { if (me?.u) void useNotificationStore.getState().markRead(me.u, id).catch(() => {}); };

  // Mở lại báo giá từ "Vừa xem".
  const reopen = async (cloudId: string) => {
    if (currentQuoteId === cloudId) return;
    if (currentQuoteId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(cloudId);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    setView('cost');
  };

  // Phiên chạy quy trình đang hoạt động (theo phạm vi).
  const myRuns = processRuns
    .filter((r) => r.status === 'active' && (inScope(r.assignee) || inScope(r.createdByUsername)))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const openRun = (id: string) => { setOpenRun(id); setView('process'); };

  // Hành động nhanh inline.
  const cust = () => useCustomerStore.getState();
  const doneFollowUp = (id: string) => void cust().clearFollowUp(id).catch(() => {});
  const snoozeFollowUp = (id: string, note: string) => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    void cust().setFollowUp(id, d.toISOString().slice(0, 10), note).catch(() => {});
  };
  const decideLeave = (id: string, status: 'approved' | 'rejected', name: string) => {
    if (status === 'rejected' && !window.confirm(`Từ chối đơn nghỉ phép của ${name}?`)) return;
    void useHrLeaveStore.getState().decide(id, status).catch(() => {});
  };

  const wonLost = data.stats.won + data.stats.lost;

  // Xuất ảnh trang Hôm nay ra PDF (giao ban sáng) — nạp lib theo nhu cầu.
  const exportPdf = async () => {
    const { exportHomePDF } = await import('@/lib/exports/exportHomePDF');
    exportHomePDF({
      name: me?.name ?? '',
      dateLabel: new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
      digest,
      kpis: [
        { label: 'Báo giá đang mở', value: String(data.stats.open) },
        { label: 'Tỷ lệ thắng', value: `${data.stats.winRatePct}%` },
        { label: 'Tour 7 ngày', value: String(data.soon.length) },
        { label: 'Còn nợ NCC', value: fmtVND(data.owingTotal) },
        { label: 'Biên lợi thực', value: fmtVND(data.stats.settledProfit) },
      ],
      priority: priority.slice(0, 12).map((p) => ({ primary: p.primary, secondary: p.secondary, due: p.dueTs == null ? undefined : countdown(p.dueTs, nowMs).text })),
    });
  };

  // Mỗi thẻ là 1 THUNK — chỉ dựng JSX cho thẻ đang hiển thị (render lười, 18 thẻ).
  const nodes: Record<string, () => React.ReactNode | null> = {
    digest: () => (
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(13,122,106,0.06)', borderColor: 'rgba(13,122,106,0.25)' }}>
        <Typography fontSize={14} fontWeight={700} sx={{ color: '#0d7a6a' }}>🌅 {digest}</Typography>
      </Paper>
    ),
    week: () => (
      <Section icon="🗓️" title="Lịch tuần" count={agendaTotal} color="#2563eb" onAll={() => go('departures')} {...collapseProps('week')}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
          {agenda.map((d) => (
            <Box key={d.date}
              sx={{ p: 0.75, textAlign: 'center', borderRadius: 1.5, minHeight: 64,
                border: '1px solid', borderColor: d.isToday ? '#2563eb' : 'rgba(0,0,0,0.08)',
                bgcolor: d.isToday ? 'rgba(37,99,235,0.08)' : '#fff' }}>
              <Typography fontSize={10.5} color="text.secondary" noWrap>{d.weekday}</Typography>
              <Typography fontSize={15} fontWeight={d.isToday ? 900 : 700} sx={{ color: d.isToday ? '#2563eb' : 'text.primary' }}>{d.day}</Typography>
              <Stack direction="row" justifyContent="center" spacing={0.25} sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                {d.departing > 0 && <Tooltip title={`${d.departing} tour khởi hành`}><Box sx={{ fontSize: 10, fontWeight: 700, color: '#14a08c' }}>🛫{d.departing}</Box></Tooltip>}
                {d.deadlines > 0 && <Tooltip title={`${d.deadlines} deadline`}><Box sx={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>⏳{d.deadlines}</Box></Tooltip>}
                {d.followups > 0 && <Tooltip title={`${d.followups} hẹn khách`}><Box sx={{ fontSize: 10, fontWeight: 700, color: '#f5a623' }}>📅{d.followups}</Box></Tooltip>}
              </Stack>
            </Box>
          ))}
        </Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.25 }}>
          <Typography fontSize={11.5} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Báo giá 8 tuần</Typography>
          <Sparkline values={data.weeklyQuotes} />
          <Typography fontSize={12} fontWeight={700} sx={{ color: '#0d7a6a' }}>{data.weeklyQuotes.reduce((s, n) => s + n, 0)}</Typography>
        </Stack>
      </Section>
    ),
    kpi: () => (
      <Section icon="📊" title="Chỉ số nhanh" count={1} color="#0d7a6a" {...collapseProps('kpi')}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 0.75 }}>
          <Kpi label="Báo giá đang mở" value={String(data.stats.open)} color="#0d7a6a" onClick={() => go('cost')} />
          <Kpi label="Tỷ lệ thắng" value={`${data.stats.winRatePct}%`} sub={wonLost ? `${data.stats.won}/${wonLost} chốt` : 'chưa có'} color="#14a08c" onClick={() => go('history')} />
          <Kpi label="Tour 7 ngày" value={String(data.soon.length)} color="#2563eb" onClick={() => go('departures')} />
          <Kpi label="Còn nợ NCC" value={fmtVND(data.owingTotal)} color="#f5a623" onClick={() => go('payboard')} />
          <Kpi label="Biên lợi thực" value={fmtVND(data.stats.settledProfit)} color="#7c3aed" onClick={() => go('history')} />
        </Box>
      </Section>
    ),
    targets: () => (
      <Section icon="🎯" title="Mục tiêu tháng" count={1} color="#14a08c"
        onAll={editTargets} {...collapseProps('targets')}>
        {targets.quotes === 0 && targets.revenue === 0 ? (
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={editTargets} sx={{ color: '#14a08c' }}>Đặt mục tiêu tháng</Button>
        ) : (
          <Stack spacing={1.25}>
            {[
              { label: 'Báo giá chốt', cur: month.wonCount, target: targets.quotes, fmt: (n: number) => String(n) },
              { label: 'Doanh thu', cur: month.revenue, target: targets.revenue, fmt: fmtVND },
            ].filter((r) => r.target > 0).map((r) => {
              const pct = pctOf(r.cur, r.target);
              return (
                <Box key={r.label}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                    <Typography fontSize={12.5} fontWeight={700}>{r.label}</Typography>
                    <Typography fontSize={12.5} sx={{ color: pct >= 100 ? '#1a9e63' : 'text.secondary' }}>
                      {r.fmt(r.cur)} / {r.fmt(r.target)} · <b>{pct}%</b>
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct} color={pct >= 100 ? 'success' : 'primary'} sx={{ height: 7, borderRadius: 4 }} />
                </Box>
              );
            })}
            <Button size="small" startIcon={<EditOutlinedIcon />} onClick={editTargets} sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}>Sửa mục tiêu</Button>
          </Stack>
        )}
      </Section>
    ),
    recent: () => (
      <Section icon="🕘" title="Vừa xem gần đây" count={recentItems.length} color="#7c3aed" {...collapseProps('recent')}>
        <Stack spacing={0.75}>
          {recentItems.slice(0, rows).map((r) => (
            <Row key={r.cloudId} onClick={() => void reopen(r.cloudId)}
              primary={r.name}
              secondary={r.code ? `Mã ${r.code}` : undefined}
              right={<Typography variant="caption" color="text.disabled">{new Date(r.at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>} />
          ))}
        </Stack>
      </Section>
    ),
    notifs: () => (
      <Section icon="🔔" title="Thông báo" count={unreadNotifs.length} color="#dc3250" {...collapseProps('notifs')}>
        <Stack spacing={0.75}>
          {unreadNotifs.slice(0, rows).map((n) => (
            <Row key={n.id} onClick={() => readNotif(n.id)}
              primary={n.title}
              secondary={n.message}
              right={
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <Typography variant="caption" color="text.disabled">{new Date(n.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>
                  <QuickBtn title="Đánh dấu đã đọc" color="#1a9e63" icon={<DoneIcon fontSize="small" />} onClick={() => readNotif(n.id)} />
                </Stack>
              } />
          ))}
        </Stack>
      </Section>
    ),
    priority: () => (
      <Section icon="🔥" title="Ưu tiên hôm nay" count={priority.length} color="#dc3250" {...collapseProps('priority')}>
        <Stack spacing={0.75}>
          {priority.slice(0, rows).map((p) => (
            <Row key={p.id} onClick={p.open}
              primary={`${PRI_ICON[p.kind]} ${p.primary}`}
              secondary={p.secondary}
              right={<Chip size="small" variant={p.severity === 'overdue' ? 'filled' : 'outlined'}
                label={p.dueTs == null ? '—' : countdown(p.dueTs, nowMs).text}
                sx={{ height: 20, fontWeight: 700, ...(p.severity === 'overdue' ? { bgcolor: PRI_COLOR.overdue, color: '#fff' } : { borderColor: PRI_COLOR[p.severity], color: PRI_COLOR[p.severity] }) }} />} />
          ))}
        </Stack>
      </Section>
    ),
    todo: () => <TodoPanel onEdit={(t) => { setEditTodo(t); setTodoOpen(true); }} />,
    process: () => (
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
    myRuns: () => myRuns.length === 0 ? null : (
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
    deadlines: () => (
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
    soon: () => (
      <Section icon="🛫" title={`Tour sắp khởi hành (${tourDays} ngày)`} count={data.soon.length} color="#14a08c" onAll={() => go('departures')} {...collapseProps('soon')}>
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
    myOverdue: () => (
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
    nccDue: () => (
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
    owing: () => (
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
    docs: () => (
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
    leaves: () => !amApprover ? null : (
      <Section icon="🌴" title="Nghỉ phép chờ duyệt" count={leavesPending.length} color="#2563eb" onAll={() => go('hr')} {...collapseProps('leaves')}>
        <Stack spacing={0.75}>
          {leavesPending.slice(0, rows).map((l) => (
            <Row key={l.id} onClick={() => go('hr')}
              primary={l.employeeName}
              secondary={`${LEAVE_TYPE_LABEL[l.type] ?? 'Nghỉ phép'} · ${l.days} ngày${l.startDate ? ` · ${new Date(l.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}` : ''}`}
              right={
                <Stack direction="row" spacing={0.25}>
                  <QuickBtn title="Duyệt" color="#1a9e63" icon={<DoneIcon fontSize="small" />} onClick={() => decideLeave(l.id, 'approved', l.employeeName)} />
                  <QuickBtn title="Từ chối" color="#dc3250" icon={<CloseIcon fontSize="small" />} onClick={() => decideLeave(l.id, 'rejected', l.employeeName)} />
                </Stack>
              } />
          ))}
        </Stack>
      </Section>
    ),
    myAttendance: () => (!myEmp || myAttendance.length === 0) ? null : (
      <Section icon="📋" title="Bảng công của tôi" count={myAttPending.length} color="#0d7a6a" {...collapseProps('myAttendance')}>
        <Stack spacing={0.75}>
          {myAttendance.slice(0, rows).map((a) => (
            <Row key={a.id} onClick={() => setAttSelfOpen(true)}
              primary={periodLabelVN(a.period)}
              secondary={`Số công: ${a.summary.totalHC}${a.summary.paidLeave ? ` · phép ${a.summary.paidLeave}` : ''}${a.summary.unpaidLeave ? ` · không lương ${a.summary.unpaidLeave}` : ''}`}
              right={<Chip size="small"
                color={a.confirmation.status === 'confirmed' ? 'success' : a.confirmation.status === 'disputed' ? 'warning' : 'info'}
                label={ATTENDANCE_CONFIRM_LABEL[a.confirmation.status]} />} />
          ))}
        </Stack>
      </Section>
    ),
    followups: () => (
      <Section icon="📅" title="Hẹn liên hệ khách hôm nay" count={data.followups.length} color="#2563eb" onAll={() => go('customer')} {...collapseProps('followups')}>
        <Stack spacing={0.75}>
          {data.followups.slice(0, rows).map((c) => (
            <Row key={c.id} onClick={() => go('customer')}
              primary={c.name}
              secondary={c.nextFollowUp!.note || 'Liên hệ lại'}
              right={
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <Typography variant="caption" sx={{ color: c.nextFollowUp!.date < today ? '#dc3250' : '#2563eb', fontWeight: 700 }}>
                    {new Date(c.nextFollowUp!.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</Typography>
                  <QuickBtn title="Đã liên hệ" color="#1a9e63" icon={<CheckCircleOutlineIcon fontSize="small" />} onClick={() => doneFollowUp(c.id)} />
                  <QuickBtn title="Dời +1 ngày" icon={<SnoozeIcon fontSize="small" />} onClick={() => snoozeFollowUp(c.id, c.nextFollowUp!.note)} />
                </Stack>
              } />
          ))}
        </Stack>
      </Section>
    ),
  };

  // Chỉ gọi thunk cho thẻ KHÔNG ẩn; bỏ thẻ trả null (myRuns rỗng / leaves không phải người duyệt).
  const rendered = layout.order
    .filter((id) => !layout.hidden.includes(id) && nodes[id])
    .map((id) => ({ id, el: nodes[id]() }))
    .filter((x) => x.el != null);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography fontWeight={900} fontSize={18}>👋 Chào {me?.name ?? ''}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} · việc cần để ý hôm nay
          </Typography>
        </Box>
        <TextField
          select size="small" value={presetState.activeId}
          onChange={(e) => onPickPreset(e.target.value)}
          sx={{ minWidth: 140, '& .MuiSelect-select': { py: 0.5, fontSize: 13, fontWeight: 700 } }}
        >
          {presetState.presets.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          <MenuItem value="__new__" sx={{ fontStyle: 'italic', color: '#0d7a6a' }}>＋ Bố cục mới…</MenuItem>
        </TextField>
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
        <Tooltip title="Xuất PDF trang Hôm nay">
          <IconButton size="small" onClick={() => void exportPdf()} sx={{ color: '#0d7a6a' }}>
            <PictureAsPdfIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Tùy chỉnh trang Hôm nay">
          <IconButton size="small" onClick={() => setCustomizeOpen(true)} sx={{ color: '#0d7a6a' }}>
            <TuneIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {todoOpen && <TodoModal todo={editTodo} onClose={() => setTodoOpen(false)} />}
      {attSelfOpen && myEmp && <AttendanceSelfDialog employee={myEmp} onClose={() => setAttSelfOpen(false)} />}
      <HomeCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        labels={SECTION_LABELS}
        layout={layout}
        onChange={saveLayout}
        onReset={() => useHomePrefStore.getState().reset(me?.u)}
        presetState={presetState}
        onPresetChange={savePresets}
      />

      {rendered.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ mt: 2 }}>
          Tất cả thẻ đang ẩn. Bấm ⚙️ ở góc trên để hiện lại.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start', gap: 1.5 }}>
          {rendered.map(({ id, el }) => (
            <Box key={id} sx={{ minWidth: 0, ...(FULL_SPAN.has(id) ? { gridColumn: { md: '1 / -1' } } : null) }}>
              {el}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
