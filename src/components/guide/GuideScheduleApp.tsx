import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import ChecklistIcon from '@mui/icons-material/Checklist';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { detectConflicts, conflictedLegIds, colorFor, DEFAULT_BUFFER_MINS } from '@/lib/guideSchedule';
import { ROLE_RANK } from '@/auth/ROLES';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { FC } from 'react';
import type { CloudQuoteEntry, GuideFlightLeg, GuideRef, TourGuideAssignment } from '@/types';

const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n: number) => String(n).padStart(2, '0');
const ms = (iso: string) => new Date(iso).getTime();
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => new Date(v).toISOString();
const fmtRange = (leg: GuideFlightLeg) => {
  const s = new Date(leg.startISO); const e = new Date(leg.endISO);
  const day = s.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const t = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const sameDay = s.toDateString() === e.toDateString();
  return `${day} · ${t(s)} → ${t(e)}${sameDay ? '' : ` (+${Math.round((e.getTime() - s.getTime()) / 86400000)}d)`}`;
};

type Engagement = {
  key: string; guideId: string; tourCloudId: string; tourName: string;
  start: number; end: number; legs: GuideFlightLeg[]; conflicted: boolean;
};

/** Xếp các thanh không chồng nhau vào cùng một lane; chồng nhau → lane mới. */
function packLanes<T extends { start: number; end: number }>(items: T[]): { placed: { item: T; lane: number }[]; laneCount: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const placed = sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    return { item: it, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

export function GuideScheduleApp({ onExit }: { onExit: () => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const freelancers = useGuideScheduleStore((s) => s.freelancers);
  const assignments = useGuideScheduleStore((s) => s.assignments);
  const addFreelancer = useGuideScheduleStore((s) => s.addFreelancer);
  const setGuides = useGuideScheduleStore((s) => s.setGuides);
  const setLegs = useGuideScheduleStore((s) => s.setLegs);
  const removeAssignment = useGuideScheduleStore((s) => s.removeAssignment);
  const seedLegsFromQuote = useGuideScheduleStore((s) => s.seedLegsFromQuote);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  useQuoteHistoryStore((s) => s.quotes); // re-render khi index báo giá đồng bộ

  const [tab, setTab] = useState<'gantt' | 'list'>('gantt');
  const [groupBy, setGroupBy] = useState<'tour' | 'guide'>('guide');
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [bufferMins, setBufferMins] = useState(DEFAULT_BUFFER_MINS);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [guideFilter, setGuideFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [addTourOpen, setAddTourOpen] = useState(false);
  const [freelanceOpen, setFreelanceOpen] = useState(false);
  const [editLeg, setEditLeg] = useState<{ tourCloudId: string; leg: GuideFlightLeg | null } | null>(null);
  const [pickFlights, setPickFlights] = useState<{ tourCloudId: string; departDate?: string; guides: GuideRef[] } | null>(null);

  const canManage = me ? ROLE_RANK[me.role] >= ROLE_RANK.Operations : false;

  const guideOptions: GuideRef[] = useMemo(() => [
    ...users.map((u) => ({ kind: 'staff' as const, id: u.u, name: u.name })),
    ...freelancers.map((f) => ({ kind: 'freelance' as const, id: f.id, name: f.name })),
  ], [users, freelancers]);
  const guideNameOf = (id: string) => guideOptions.find((g) => g.id === id)?.name
    ?? Object.values(assignments).flatMap((a) => a.guides).find((g) => g.id === id)?.name ?? id;
  const tourNameOf = (cloudId: string) => assignments[cloudId]?.tourName ?? cloudId;

  // Lọc tour theo tên + "của tôi". Legs lọc thêm theo guideFilter.
  const tourList = useMemo(() => {
    let list = Object.values(assignments);
    if (onlyMine && me) list = list.filter((a) => a.guides.some((g) => g.id === me.u) || a.legs.some((l) => l.guideId === me.u));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.tourName.toLowerCase().includes(q));
    return list.sort((a, b) => (a.departDate ?? '').localeCompare(b.departDate ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, onlyMine, me, search]);

  const legFilter = (l: GuideFlightLeg) =>
    (!onlyMine || !me || l.guideId === me.u) && (guideFilter.length === 0 || guideFilter.includes(l.guideId));

  const allLegs = useMemo(() => tourList.flatMap((a) => a.legs.filter(legFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourList, onlyMine, me, guideFilter]);

  const conflicts = useMemo(() => detectConflicts(allLegs, bufferMins), [allLegs, bufferMins]);
  const conflictIds = useMemo(() => conflictedLegIds(conflicts), [conflicts]);
  const conflictInfo = useMemo(() => {
    const m = new Map<string, { other: GuideFlightLeg; kind: 'overlap' | 'buffer'; gap: number }>();
    for (const c of conflicts) {
      m.set(c.legA.id, { other: c.legB, kind: c.kind, gap: c.gapMins });
      m.set(c.legB.id, { other: c.legA, kind: c.kind, gap: c.gapMins });
    }
    return m;
  }, [conflicts]);

  // Gom legs thành "engagement" (một HDV trên một tour) cho Gantt.
  const engagements = useMemo(() => {
    const m = new Map<string, GuideFlightLeg[]>();
    for (const l of allLegs) {
      const k = `${l.tourCloudId}::${l.guideId}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    const out: Engagement[] = [];
    for (const [k, legs] of m) {
      const starts = legs.map((l) => ms(l.startISO));
      const ends = legs.map((l) => ms(l.endISO));
      out.push({
        key: k, guideId: legs[0].guideId, tourCloudId: legs[0].tourCloudId,
        tourName: tourNameOf(legs[0].tourCloudId),
        start: Math.min(...starts), end: Math.max(...ends), legs,
        conflicted: legs.some((l) => conflictIds.has(l.id)),
      });
    }
    return out.filter((e) => !onlyConflicts || e.conflicted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLegs, conflictIds, onlyConflicts]);

  // HDV xuất hiện trong dữ liệu (cho bộ lọc).
  const presentGuides = useMemo(() => {
    const ids = new Set(Object.values(assignments).flatMap((a) => a.legs.map((l) => l.guideId).concat(a.guides.map((g) => g.id))));
    return [...ids].map((id) => ({ id, name: guideNameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  // ── Gantt theo tháng ──
  const monthStart = new Date(ym.y, ym.m, 1).getTime();
  const monthEnd = new Date(ym.y, ym.m + 1, 1).getTime();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const span = monthEnd - monthStart;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - monthStart) / span) * 100));
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  const stepMonth = (d: number) => setYm((p) => { const x = new Date(p.y, p.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const goToday = () => { const d = new Date(); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  const nowPct = Date.now() >= monthStart && Date.now() < monthEnd ? pct(Date.now()) : null;

  // Hàng Gantt: gom engagement theo HDV hoặc theo tour, chỉ giữ cái giao tháng.
  const ganttRows = useMemo(() => {
    const inMonth = engagements.filter((e) => e.start < monthEnd && e.end > monthStart);
    const m = new Map<string, Engagement[]>();
    for (const e of inMonth) {
      const k = groupBy === 'guide' ? e.guideId : e.tourCloudId;
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return [...m.entries()]
      .map(([id, items]) => ({ id, label: groupBy === 'guide' ? guideNameOf(id) : tourNameOf(id), ...packLanes(items) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagements, groupBy, monthStart, monthEnd]);

  const reseed = async (cloudId: string) => {
    const a = assignments[cloudId];
    if (!a) return;
    const n = await seedLegsFromQuote(cloudId, a.guides.map((g) => g.id), { tourName: a.tourName, departDate: a.departDate });
    toast(n ? `✈️ Đã đồng bộ ${n} chặng bay từ báo giá.` : '⚠ Báo giá chưa có chuyến bay để đồng bộ.');
  };
  const deleteLeg = async (cloudId: string, legId: string) => {
    const a = assignments[cloudId];
    if (a) await setLegs(cloudId, a.legs.filter((l) => l.id !== legId));
  };

  // ── Leg row (list) ──
  const LegRow = ({ cloudId, leg, showTour }: { cloudId: string; leg: GuideFlightLeg; showTour?: boolean }) => {
    const conflicted = conflictIds.has(leg.id);
    const info = conflictInfo.get(leg.id);
    return (
      <Paper variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${colorFor(groupBy === 'guide' ? leg.guideId : leg.tourCloudId)}`, bgcolor: conflicted ? 'rgba(220,50,80,0.06)' : undefined }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <FlightTakeoffIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontSize={13} fontWeight={700} noWrap>
              {leg.flightNo || 'Chặng bay'} · {leg.depAirport || '—'} → {leg.arrAirport || '—'}
              {leg.edited && <Chip label="đã sửa" size="small" sx={{ ml: 0.75, height: 16, fontSize: 10 }} />}
              {leg.source === 'manual' && <Chip label="tay" size="small" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {fmtRange(leg)}{showTour ? ` · ${tourNameOf(leg.tourCloudId)}` : ` · ${guideNameOf(leg.guideId)}`}
            </Typography>
          </Box>
          {conflicted && info && (
            <Tooltip title={`${info.kind === 'overlap' ? 'Chồng giờ' : 'Sát giờ'} với ${info.other.flightNo || 'chặng'} (${tourNameOf(info.other.tourCloudId)}) · cách ${info.gap}′`}>
              <WarningAmberIcon sx={{ fontSize: 18, color: '#dc3250' }} />
            </Tooltip>
          )}
          {canManage && (
            <>
              <IconButton size="small" onClick={() => setEditLeg({ tourCloudId: cloudId, leg })}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
              <IconButton size="small" onClick={() => void deleteLeg(cloudId, leg.id)}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
            </>
          )}
        </Stack>
      </Paper>
    );
  };

  const empty = tourList.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: LEGACY.pageBg }}>
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9 55%,#38bdf8)', color: '#fff', px: { xs: 2, sm: 3 }, pt: 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Button onClick={onExit} startIcon={<ArrowBackIcon />} sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, background: 'rgba(255,255,255,0.16)', '&:hover': { background: 'rgba(255,255,255,0.28)' } }}>Trang chủ</Button>
          <Typography sx={{ fontSize: 18, fontWeight: 800, flexGrow: 1 }}>🧭 Lịch đi tour HDV</Typography>
          <ToggleButtonGroup exclusive size="small" value={groupBy} onChange={(_, v: 'tour' | 'guide' | null) => v && setGroupBy(v)}
            sx={{ bgcolor: 'rgba(255,255,255,0.16)', '& .MuiToggleButton-root': { color: '#fff', border: 'none', textTransform: 'none', fontWeight: 700, px: 1.75 }, '& .Mui-selected': { bgcolor: 'rgba(255,255,255,0.34) !important', color: '#fff !important' } }}>
            <ToggleButton value="tour">Lịch tour</ToggleButton>
            <ToggleButton value="guide">Lịch HDV</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 0.5, minHeight: 40, '& .MuiTab-root': { color: 'rgba(255,255,255,0.8)', textTransform: 'none', fontWeight: 700, minHeight: 40 }, '& .Mui-selected': { color: '#fff !important' }, '& .MuiTabs-indicator': { bgcolor: '#fff', height: 3 } }}>
          <Tab value="gantt" label="Biểu đồ Gantt" />
          <Tab value="list" label="Danh sách chi tiết" />
        </Tabs>
      </Box>

      {/* Toolbar (filters) */}
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: '#fff' }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          {tab === 'gantt' && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mr: 1 }}>
              <IconButton size="small" onClick={() => stepMonth(-1)}><ChevronLeftIcon /></IconButton>
              <Typography fontWeight={800} sx={{ minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</Typography>
              <IconButton size="small" onClick={() => stepMonth(1)}><ChevronRightIcon /></IconButton>
              <Button size="small" startIcon={<TodayIcon />} onClick={goToday} sx={{ textTransform: 'none' }}>Hôm nay</Button>
            </Stack>
          )}
          <Autocomplete
            multiple size="small" options={presentGuides} sx={{ minWidth: 220, flex: 1, maxWidth: 360 }}
            value={presentGuides.filter((g) => guideFilter.includes(g.id))}
            onChange={(_, v) => setGuideFilter(v.map((g) => g.id))}
            getOptionLabel={(g) => g.name} isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(p) => <TextField {...p} label="Lọc HDV" placeholder="Tất cả" />}
          />
          <TextField size="small" label="Tìm tour" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 180 }} />
          <TextField size="small" type="number" label="Đệm (phút)" value={bufferMins} onChange={(e) => setBufferMins(Math.max(0, Number(e.target.value) || 0))} sx={{ width: 110 }} InputLabelProps={{ shrink: true }} />
          <FormControlLabel control={<Checkbox size="small" checked={onlyConflicts} onChange={(e) => setOnlyConflicts(e.target.checked)} />} label={<Typography fontSize={13}>Chỉ trùng lịch</Typography>} />
          <FormControlLabel control={<Checkbox size="small" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />} label={<Typography fontSize={13}>Của tôi</Typography>} />
          <Box sx={{ flex: 1 }} />
          {canManage && (
            <>
              <Button onClick={() => setFreelanceOpen(true)} startIcon={<PersonAddAltIcon />} size="small" sx={{ textTransform: 'none', fontWeight: 700 }}>HDV freelance</Button>
              <Button onClick={() => setAddTourOpen(true)} startIcon={<AddIcon />} size="small" variant="contained" sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0369a1' }}>Thêm tour</Button>
            </>
          )}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          {conflicts.length > 0 && (
            <Alert severity="error" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
              Phát hiện <strong>{conflicts.length}</strong> trùng lịch (chồng giờ hoặc dưới {bufferMins}′ đệm).
            </Alert>
          )}

          {empty ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>Chưa có tour nào trong lịch HDV.</Typography>
              {canManage && <Typography variant="caption">Bấm “Thêm tour” để chọn báo giá, gán HDV và lấy lịch bay.</Typography>}
            </Paper>
          ) : tab === 'gantt' ? (
            <GanttChart
              rows={ganttRows} groupBy={groupBy} daysInMonth={daysInMonth} ym={ym}
              pct={pct} nowPct={nowPct} colorOf={(e) => colorFor(groupBy === 'guide' ? e.tourCloudId : e.guideId)}
              subLabel={(e) => (groupBy === 'guide' ? e.tourName : guideNameOf(e.guideId))}
              onBarClick={() => setTab('list')}
            />
          ) : (
            <ListView
              tourList={tourList} groupBy={groupBy}
              legFilter={legFilter} guideNameOf={guideNameOf} canManage={canManage}
              LegRow={LegRow} engagements={engagements}
              onReseed={reseed} onPick={(a) => setPickFlights({ tourCloudId: a.tourCloudId, departDate: a.departDate, guides: a.guides })}
              onAddLeg={(cloudId) => setEditLeg({ tourCloudId: cloudId, leg: null })}
              onRemoveTour={(cloudId) => { if (window.confirm('Gỡ tour này khỏi lịch HDV?')) void removeAssignment(cloudId); }}
            />
          )}
        </Box>
      </Box>

      {addTourOpen && (
        <AddTourDialog existing={new Set(Object.keys(assignments))} tours={visibleQuotes()} guideOptions={guideOptions}
          onClose={() => setAddTourOpen(false)}
          onConfirm={async (tour, guides) => {
            await setGuides(tour.cloudId, { tourName: tour.name, departDate: tour.departDate }, guides);
            const n = await seedLegsFromQuote(tour.cloudId, guides.map((g) => g.id), { tourName: tour.name, departDate: tour.departDate });
            setAddTourOpen(false);
            toast(n ? `✈️ Đã thêm tour & lấy ${n} chặng bay.` : '✅ Đã thêm tour (báo giá chưa có chuyến bay).');
          }} />
      )}

      {freelanceOpen && (
        <FreelanceDialog onClose={() => setFreelanceOpen(false)} onAdd={async (name, phone) => {
          const f = await addFreelancer(name, { phone });
          if (f) toast(`✅ Đã thêm HDV freelance “${f.name}”.`);
          setFreelanceOpen(false);
        }} />
      )}

      {pickFlights && (
        <FlightPickerDialog
          guides={pickFlights.guides}
          tourCloudId={pickFlights.tourCloudId} departDate={pickFlights.departDate}
          onClose={() => setPickFlights(null)}
          onAdd={async (guideId, picked) => {
            const a = assignments[pickFlights.tourCloudId];
            if (!a) { setPickFlights(null); return; }
            const created: GuideFlightLeg[] = picked.map((c, i) => ({ ...c, id: newId('leg') + i, guideId, source: 'quote' }));
            await setLegs(pickFlights.tourCloudId, [...a.legs, ...created]);
            setPickFlights(null);
            toast(`✈️ Đã thêm ${created.length} chặng cho ${guideNameOf(guideId)}.`);
          }} />
      )}

      {editLeg && (
        <LegDialog leg={editLeg.leg} guides={assignments[editLeg.tourCloudId]?.guides ?? []}
          onClose={() => setEditLeg(null)}
          onSave={async (data) => {
            const a = assignments[editLeg.tourCloudId];
            if (!a) { setEditLeg(null); return; }
            if (editLeg.leg) {
              const updated: GuideFlightLeg = { ...editLeg.leg, ...data, edited: true };
              await setLegs(editLeg.tourCloudId, a.legs.map((l) => (l.id === editLeg.leg!.id ? updated : l)));
            } else {
              const created: GuideFlightLeg = { id: newId('leg'), tourCloudId: editLeg.tourCloudId, source: 'manual', ...data };
              await setLegs(editLeg.tourCloudId, [...a.legs, created]);
            }
            setEditLeg(null);
          }} />
      )}
    </Box>
  );
}

// ── Gantt chart ──
type GanttRow = { id: string; label: string; placed: { item: Engagement; lane: number }[]; laneCount: number };
function GanttChart({ rows, daysInMonth, ym, pct, nowPct, colorOf, subLabel, onBarClick }: {
  rows: GanttRow[]; groupBy: 'tour' | 'guide'; daysInMonth: number; ym: { y: number; m: number };
  pct: (t: number) => number; nowPct: number | null;
  colorOf: (e: Engagement) => string; subLabel: (e: Engagement) => string; onBarClick: (e: Engagement) => void;
}) {
  const barH = 22, gap = 4;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const isWeekend = (d: number) => { const w = new Date(ym.y, ym.m, d).getDay(); return w === 0 || w === 6; };
  const LABEL_W = 150;
  if (rows.length === 0) return <Typography variant="caption" color="text.disabled">Không có lịch trong tháng này (theo bộ lọc hiện tại).</Typography>;
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {/* Day header */}
      <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.1)', bgcolor: '#fafafa', position: 'sticky', top: 0, zIndex: 2 }}>
        <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, fontWeight: 800, fontSize: 12 }}>{rows.length} dòng</Box>
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}>
          {days.map((d) => (
            <Box key={d} sx={{ textAlign: 'center', fontSize: 10, py: 0.5, borderLeft: '1px solid rgba(0,0,0,0.05)', color: isWeekend(d) ? '#dc3250' : 'text.secondary', bgcolor: isWeekend(d) ? 'rgba(220,50,80,0.05)' : undefined }}>{d}</Box>
          ))}
        </Box>
      </Box>
      {/* Rows */}
      {rows.map((row, ri) => (
        <Box key={row.id} sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: ri % 2 ? 'rgba(0,0,0,0.015)' : undefined }}>
          <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colorFor(row.id), flexShrink: 0 }} />
            <Typography fontSize={12.5} fontWeight={700} noWrap title={row.label}>{row.label}</Typography>
          </Box>
          <Box sx={{ flex: 1, position: 'relative', height: row.laneCount * (barH + gap) + gap }}>
            {/* gridlines */}
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}>
              {days.map((d) => <Box key={d} sx={{ borderLeft: '1px solid rgba(0,0,0,0.04)', bgcolor: isWeekend(d) ? 'rgba(220,50,80,0.035)' : undefined }} />)}
            </Box>
            {nowPct != null && <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${nowPct}%`, width: '2px', bgcolor: '#0ea5e9', zIndex: 3 }} />}
            {row.placed.map(({ item, lane }) => {
              const left = pct(item.start);
              const width = Math.max(pct(item.end) - left, 1.4);
              const col = colorOf(item);
              return (
                <Tooltip key={item.key} title={`${item.tourName} · ${subLabel(item)} · ${new Date(item.start).toLocaleDateString('vi-VN')}–${new Date(item.end).toLocaleDateString('vi-VN')}${item.conflicted ? ' · ⚠ TRÙNG' : ''}`}>
                  <Box onClick={() => onBarClick(item)}
                    sx={{ position: 'absolute', top: gap + lane * (barH + gap), left: `${left}%`, width: `${width}%`, height: barH,
                      bgcolor: col, borderRadius: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', px: 0.6, overflow: 'hidden',
                      border: item.conflicted ? '2px solid #dc3250' : '1px solid rgba(0,0,0,0.15)',
                      boxShadow: item.conflicted ? '0 0 0 1px #dc3250 inset' : undefined, zIndex: 1, '&:hover': { filter: 'brightness(1.08)' } }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 1px rgba(0,0,0,0.3)' }} noWrap>
                      {item.conflicted ? '⚠ ' : ''}{subLabel(item)}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

// ── List view (chi tiết) ──
function ListView({ tourList, groupBy, legFilter, guideNameOf, canManage, LegRow, engagements, onReseed, onPick, onAddLeg, onRemoveTour }: {
  tourList: TourGuideAssignment[];
  groupBy: 'tour' | 'guide';
  legFilter: (l: GuideFlightLeg) => boolean; guideNameOf: (id: string) => string; canManage: boolean;
  LegRow: FC<{ cloudId: string; leg: GuideFlightLeg; showTour?: boolean }>;
  engagements: Engagement[];
  onReseed: (cloudId: string) => void; onPick: (a: TourGuideAssignment) => void;
  onAddLeg: (cloudId: string) => void; onRemoveTour: (cloudId: string) => void;
}) {
  if (groupBy === 'guide') {
    const byGuide = new Map<string, GuideFlightLeg[]>();
    for (const e of engagements) (byGuide.get(e.guideId) ?? byGuide.set(e.guideId, []).get(e.guideId)!).push(...e.legs);
    const rows = [...byGuide.entries()].map(([id, legs]) => ({ id, legs: legs.sort((a, b) => a.startISO.localeCompare(b.startISO)) })).sort((a, b) => guideNameOf(a.id).localeCompare(guideNameOf(b.id)));
    return (
      <Stack spacing={2}>
        {rows.map(({ id, legs }) => (
          <Paper key={id} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ borderTop: `4px solid ${colorFor(id)}`, p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: colorFor(id), fontSize: 13, fontWeight: 800 }}>{guideNameOf(id).charAt(0)}</Avatar>
                <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{guideNameOf(id)}</Typography>
                <Chip size="small" label={`${legs.length} chặng`} />
              </Stack>
              <Stack spacing={0.75} sx={{ mt: 1.5 }}>{legs.map((l) => <LegRow key={l.id} cloudId={l.tourCloudId} leg={l} showTour />)}</Stack>
            </Box>
          </Paper>
        ))}
        {rows.length === 0 && <Typography variant="caption" color="text.disabled">Không có lịch bay (theo bộ lọc).</Typography>}
      </Stack>
    );
  }
  return (
    <Stack spacing={2}>
      {tourList.map((a) => {
        const legs = a.legs.filter(legFilter);
        const legsByGuide = new Map<string, GuideFlightLeg[]>();
        for (const l of legs) (legsByGuide.get(l.guideId) ?? legsByGuide.set(l.guideId, []).get(l.guideId)!).push(l);
        return (
          <Paper key={a.tourCloudId} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ borderTop: `4px solid ${colorFor(a.tourCloudId)}`, p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{a.tourName}</Typography>
                {a.departDate && <Chip size="small" label={`KH ${new Date(a.departDate).toLocaleDateString('vi-VN')}`} />}
                {canManage && (
                  <>
                    <Tooltip title="Chọn chuyến bay từ báo giá"><IconButton size="small" onClick={() => onPick(a)}><ChecklistIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Đồng bộ tất cả chặng từ báo giá"><IconButton size="small" onClick={() => onReseed(a.tourCloudId)}><SyncIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Thêm chặng bay tay"><IconButton size="small" onClick={() => onAddLeg(a.tourCloudId)}><AddIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Gỡ tour khỏi lịch"><IconButton size="small" onClick={() => onRemoveTour(a.tourCloudId)}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </>
                )}
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                {a.guides.map((g) => (
                  <Chip key={g.id} size="small" avatar={<Avatar sx={{ fontSize: 11 }}>{g.name.charAt(0)}</Avatar>} label={`${g.name}${g.kind === 'freelance' ? ' (FL)' : ''}`} sx={{ '& .MuiChip-avatar': { bgcolor: colorFor(g.id), color: '#fff' } }} />
                ))}
                {a.guides.length === 0 && <Typography variant="caption" color="text.disabled">Chưa gán HDV</Typography>}
              </Stack>
            </Box>
            <Box sx={{ p: 1.5, pt: 0 }}>
              <Stack spacing={1.5}>
                {[...legsByGuide.entries()].map(([gid, ls]) => (
                  <Box key={gid}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: colorFor(gid) }}>{guideNameOf(gid)}</Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>{ls.map((l) => <LegRow key={l.id} cloudId={a.tourCloudId} leg={l} />)}</Stack>
                  </Box>
                ))}
                {legs.length === 0 && <Typography variant="caption" color="text.disabled">Chưa có lịch bay — bấm Chọn chuyến bay hoặc Đồng bộ.</Typography>}
              </Stack>
            </Box>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ── Thêm tour vào lịch ──
function AddTourDialog({ existing, tours, guideOptions, onClose, onConfirm }: {
  existing: Set<string>; tours: CloudQuoteEntry[]; guideOptions: GuideRef[];
  onClose: () => void; onConfirm: (tour: CloudQuoteEntry, guides: GuideRef[]) => Promise<void>;
}) {
  const [tour, setTour] = useState<CloudQuoteEntry | null>(null);
  const [guides, setGuides] = useState<GuideRef[]>([]);
  const [busy, setBusy] = useState(false);
  const opts = useMemo(() => tours.filter((t) => t.template === 'domestic' || t.template === 'intl'), [tours]);
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Thêm tour vào lịch HDV</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete options={opts} value={tour} onChange={(_, v) => setTour(v)}
            getOptionLabel={(t) => `${t.quoteCode ? t.quoteCode + ' · ' : ''}${t.name}`}
            isOptionEqualToValue={(a, b) => a.cloudId === b.cloudId}
            renderInput={(p) => <TextField {...p} label="Báo giá / tour" placeholder="Chọn báo giá có chuyến bay" />}
            renderOption={(p, t) => (
              <li {...p} key={t.cloudId}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>{t.name}{existing.has(t.cloudId) ? ' · (đã có trong lịch)' : ''}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.quoteCode || '—'}{t.departDate ? ` · KH ${new Date(t.departDate).toLocaleDateString('vi-VN')}` : ''}</Typography>
                </Stack>
              </li>
            )} />
          <Autocomplete multiple options={guideOptions} value={guides} onChange={(_, v) => setGuides(v)}
            getOptionLabel={(g) => `${g.name}${g.kind === 'freelance' ? ' (FL)' : ''}`} isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(p) => <TextField {...p} label="HDV phụ trách" placeholder="Chọn nhân sự / freelance" />} />
          <Typography variant="caption" color="text.secondary">Lịch bay sẽ tự lấy từ chuyến bay của báo giá; sau đó bạn chọn lại từng chặng hoặc chỉnh tay được.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!tour || busy} onClick={async () => { if (!tour) return; setBusy(true); try { await onConfirm(tour, guides); } finally { setBusy(false); } }}>{busy ? 'Đang thêm…' : 'Thêm'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Chọn chuyến bay từ báo giá ──
function FlightPickerDialog({ guides, tourCloudId, departDate, onClose, onAdd }: {
  guides: GuideRef[]; tourCloudId: string; departDate?: string;
  onClose: () => void; onAdd: (guideId: string, picked: GuideFlightLeg[]) => Promise<void>;
}) {
  const [guideId, setGuideId] = useState(guides[0]?.id ?? '');
  const [cands, setCands] = useState<GuideFlightLeg[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    void useGuideScheduleStore.getState().loadTourFlightCandidates(tourCloudId, departDate).then((c) => {
      if (on) { setCands(c); setChecked(new Set(c.map((x) => x.id))); }
    });
    return () => { on = false; };
  }, [tourCloudId, departDate]);
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const picked = (cands ?? []).filter((c) => checked.has(c.id));
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Chọn chuyến bay cho HDV</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="HDV" value={guideId} onChange={(e) => setGuideId(e.target.value)} required>
            {guides.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}{g.kind === 'freelance' ? ' (FL)' : ''}</MenuItem>)}
          </TextField>
          <Divider>Chuyến bay trong báo giá</Divider>
          {cands == null ? <Typography variant="caption" color="text.secondary">Đang tải…</Typography>
            : cands.length === 0 ? <Alert severity="info">Báo giá chưa có chuyến bay hợp lệ (cần ngày + giờ bay).</Alert>
              : <Stack spacing={0.5}>
                {cands.map((c) => (
                  <Paper key={c.id} variant="outlined" sx={{ p: 0.75 }}>
                    <FormControlLabel sx={{ m: 0, width: '100%' }} control={<Checkbox size="small" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />}
                      label={<Box><Typography fontSize={13} fontWeight={700}>{c.flightNo || 'Chặng'} · {c.depAirport || '—'} → {c.arrAirport || '—'}</Typography><Typography variant="caption" color="text.secondary">{fmtRange(c)}</Typography></Box>} />
                  </Paper>
                ))}
              </Stack>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!guideId || picked.length === 0 || busy}
          onClick={async () => { setBusy(true); try { await onAdd(guideId, picked); } finally { setBusy(false); } }}>
          {busy ? 'Đang thêm…' : `Thêm ${picked.length} chặng`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Thêm HDV freelance ──
function FreelanceDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, phone?: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Thêm HDV freelance</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Tên HDV" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Số điện thoại (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!name.trim() || busy} onClick={async () => { setBusy(true); try { await onAdd(name.trim(), phone.trim() || undefined); } finally { setBusy(false); } }}>{busy ? 'Đang thêm…' : 'Thêm'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Sửa / thêm chặng bay ──
type LegData = Pick<GuideFlightLeg, 'guideId' | 'flightNo' | 'depAirport' | 'arrAirport' | 'startISO' | 'endISO' | 'note'>;
function LegDialog({ leg, guides, onClose, onSave }: {
  leg: GuideFlightLeg | null; guides: GuideRef[]; onClose: () => void; onSave: (data: LegData) => Promise<void>;
}) {
  const [guideId, setGuideId] = useState(leg?.guideId ?? guides[0]?.id ?? '');
  const [flightNo, setFlightNo] = useState(leg?.flightNo ?? '');
  const [dep, setDep] = useState(leg?.depAirport ?? '');
  const [arr, setArr] = useState(leg?.arrAirport ?? '');
  const [start, setStart] = useState(leg ? toLocalInput(leg.startISO) : '');
  const [end, setEnd] = useState(leg ? toLocalInput(leg.endISO) : '');
  const [busy, setBusy] = useState(false);
  const valid = guideId && start && end && new Date(end) > new Date(start);
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{leg ? 'Sửa chặng bay' : 'Thêm chặng bay tay'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="HDV" value={guideId} onChange={(e) => setGuideId(e.target.value)} required>
            {guides.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}{g.kind === 'freelance' ? ' (FL)' : ''}</MenuItem>)}
          </TextField>
          <TextField label="Số hiệu" value={flightNo} onChange={(e) => setFlightNo(e.target.value.toUpperCase())} />
          <Stack direction="row" spacing={1.5}>
            <TextField label="Đi (IATA)" value={dep} onChange={(e) => setDep(e.target.value.toUpperCase())} sx={{ flex: 1 }} />
            <TextField label="Đến (IATA)" value={arr} onChange={(e) => setArr(e.target.value.toUpperCase())} sx={{ flex: 1 }} />
          </Stack>
          <TextField label="Cất cánh" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="Hạ cánh" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!valid || busy}
          onClick={async () => { setBusy(true); try { await onSave({ guideId, flightNo: flightNo || undefined, depAirport: dep || undefined, arrAirport: arr || undefined, startISO: fromLocalInput(start), endISO: fromLocalInput(end) }); } finally { setBusy(false); } }}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
