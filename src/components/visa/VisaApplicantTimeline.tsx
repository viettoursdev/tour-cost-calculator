import { useState, useMemo } from 'react';
import { Box, Chip, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import {
  APPLICANT_MILESTONE_COLOR, APPLICANT_MILESTONE_CUSTOM_COLOR, DEFAULT_APPLICANT_TIMELINE,
  VISA_APPLICANT_STATUS_META, VISA_APPLICANT_STATUS_ORDER, defaultApplicantTimeline,
  deriveVisaStatus, isApplicantOverdue,
} from './constants';
import type { Passenger, VisaApplicantMilestone, VisaApplicantStatus } from '@/types';

type SortKey = 'name' | 'earliest' | 'departure';

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const parseDate = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return isNaN(t) ? null : t;
};
const toISODate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtD = (t: number) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const fmtFull = (t: number) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const colorOf = (m: VisaApplicantMilestone) => (m.key ? APPLICANT_MILESTONE_COLOR[m.key] ?? APPLICANT_MILESTONE_CUSTOM_COLOR : APPLICANT_MILESTONE_CUSTOM_COLOR);
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

type DragState = { key: string; rowId: string; msId: string; origT: number; startX: number; dx: number; pxPerDay: number };

/**
 * Biểu đồ timeline xin visa của TỪNG khách (mỗi khách = 1 dòng), trải theo trục
 * ngày — giống bảng đi tour HDV. Mỗi mốc (triển khai → deadline → SLTH → dự kiến
 * có visa → khởi hành + mốc tuỳ biến) là một chấm màu. Khi truyền `onChange`,
 * KÉO chấm để dời ngày (snap theo ngày); không thì chỉ xem.
 */
export function VisaApplicantTimeline({ rows, departureDate, onChange }: {
  rows: Passenger[];
  departureDate?: string | null;
  onChange?: (rows: Passenger[]) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<VisaApplicantStatus>>(() => new Set());
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('earliest');
  const editable = !!onChange;

  // Mỗi khách → bộ mốc hiệu lực (dùng timeline đã lưu, hoặc mốc mặc định). Memo hoá
  // để id mốc ỔN ĐỊNH giữa các lần render (cần cho thao tác kéo-thả).
  const perRow = useMemo(
    () => rows.map((p) => ({
      p,
      tl: (p.visaTimeline?.length ? p.visaTimeline : defaultApplicantTimeline(departureDate)),
    })).map((r) => ({ ...r, ms: r.tl.map((m) => ({ ...m, t: parseDate(m.date) })) })),
    [rows, departureDate],
  );

  // Các trạng thái có mặt trong đoàn (để dựng bộ lọc gọn — chỉ hiện cái đang dùng).
  const presentStatuses = useMemo(
    () => VISA_APPLICANT_STATUS_ORDER.filter((s) => rows.some((p) => deriveVisaStatus(p) === s)),
    [rows],
  );
  const toggleStatus = (s: VisaApplicantStatus) =>
    setStatusFilter((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  // Lọc + sắp xếp danh sách HIỂN THỊ (giữ perRow đầy đủ cho kéo-thả theo id).
  const shown = useMemo(() => {
    const earliestT = (ms: { t: number | null }[]) => {
      const ts = ms.map((m) => m.t).filter((x): x is number => x != null);
      return ts.length ? Math.min(...ts) : Infinity;
    };
    let r = perRow;
    if (statusFilter.size) r = r.filter((x) => statusFilter.has(deriveVisaStatus(x.p)));
    if (onlyOverdue) r = r.filter((x) => isApplicantOverdue(x.p));
    const arr = [...r];
    arr.sort((a, b) => {
      if (sortKey === 'name') return (a.p.name || '').localeCompare(b.p.name || '');
      if (sortKey === 'departure') {
        const da = a.tl.find((m) => m.key === 'departure')?.date ?? '';
        const db = b.tl.find((m) => m.key === 'departure')?.date ?? '';
        return (da || '9999').localeCompare(db || '9999');
      }
      return earliestT(a.ms) - earliestT(b.ms);
    });
    return arr;
  }, [perRow, statusFilter, onlyOverdue, sortKey]);

  // Dời 1 mốc của 1 khách đi `deltaDays`. Ghi NGUYÊN bộ mốc hiển thị (cùng id) để
  // không lệch khi khách đang dùng mốc mặc định chưa lưu.
  const shiftMilestone = (rowId: string, msId: string, deltaDays: number) => {
    if (!onChange || !deltaDays) return;
    const row = perRow.find((r) => r.p.id === rowId);
    if (!row) return;
    const next: VisaApplicantMilestone[] = row.tl.map((m) => {
      const t = parseDate(m.date);
      return m.id === msId && t != null ? { ...m, date: toISODate(startOfDay(t) + deltaDays * DAY) } : m;
    });
    onChange(rows.map((p) => (p.id === rowId ? { ...p, visaTimeline: next } : p)));
  };

  const range = useMemo(() => {
    const times = shown.flatMap((r) => r.ms.map((m) => m.t).filter((x): x is number => x != null));
    if (times.length === 0) return null;
    let min = Math.min(...times);
    let max = Math.max(...times);
    if (min === max) { min -= 15 * DAY; max += 15 * DAY; }
    else { const pad = Math.max(2 * DAY, (max - min) * 0.06); min -= pad; max += pad; }
    return { min: startOfDay(min), max: startOfDay(max) };
  }, [shown]);

  // Thanh lọc/sắp xếp — tách riêng để hiện cả khi không có mốc ngày nào.
  const controls = (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1 }}>
      {presentStatuses.map((s) => {
        const meta = VISA_APPLICANT_STATUS_META[s];
        const on = statusFilter.has(s);
        return (
          <Chip key={s} size="small" label={meta.label} onClick={() => toggleStatus(s)}
            variant={on ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700, cursor: 'pointer', color: on ? '#fff' : meta.color, bgcolor: on ? meta.color : 'transparent', borderColor: meta.color, '&:hover': { bgcolor: on ? meta.color : `${meta.color}1a` } }} />
        );
      })}
      <Chip size="small" label="⚠ Chỉ quá hạn" onClick={() => setOnlyOverdue((v) => !v)}
        variant={onlyOverdue ? 'filled' : 'outlined'} color="error"
        sx={{ fontWeight: 700, cursor: 'pointer' }} />
      <Box sx={{ flex: 1 }} />
      <TextField select size="small" label="Sắp xếp" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} sx={{ width: 160 }}>
        <MenuItem value="earliest">Mốc sớm nhất</MenuItem>
        <MenuItem value="departure">Ngày khởi hành</MenuItem>
        <MenuItem value="name">Tên khách</MenuItem>
      </TextField>
    </Stack>
  );

  if (rows.length === 0) {
    return <Typography color="text.disabled" sx={{ py: 4, textAlign: 'center' }}>Chưa có khách nào.</Typography>;
  }
  if (shown.length === 0) {
    return (
      <Stack spacing={1.5}>
        {controls}
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          Không có khách khớp bộ lọc.
        </Paper>
      </Stack>
    );
  }
  if (!range) {
    return (
      <Stack spacing={1.5}>
        {controls}
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có mốc ngày nào. Mở tab “📋 Danh sách”, bung từng khách và nhập các mốc timeline.
        </Paper>
      </Stack>
    );
  }

  const span = range.max - range.min || DAY;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - range.min) / span) * 100));
  const now = Date.now();
  const todayStart = startOfDay(now);
  const nowPct = now >= range.min && now <= range.max ? pct(now) : null;

  // Mốc trục ngày: mỗi ~7 ngày một nhãn.
  const ticks: number[] = [];
  const stepDays = Math.max(1, Math.ceil(span / DAY / 12));
  for (let t = range.min; t <= range.max; t += stepDays * DAY) ticks.push(t);

  const LABEL_W = 190;

  return (
    <Stack spacing={1.5}>
      {controls}
      {/* Chú giải */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="caption" fontWeight={700} color="text.secondary">Mốc:</Typography>
        {DEFAULT_APPLICANT_TIMELINE.map((m) => (
          <Stack key={m.key} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: APPLICANT_MILESTONE_COLOR[m.key] }} />
            <Typography variant="caption" color="text.secondary">{m.label}</Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: APPLICANT_MILESTONE_CUSTOM_COLOR }} />
          <Typography variant="caption" color="text.secondary">Mốc khác</Typography>
        </Stack>
        {editable && (
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
            ✋ Kéo chấm để dời ngày · Lưu để đồng bộ
          </Typography>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        {/* Trục ngày */}
        <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.1)', bgcolor: '#fafafa', position: 'sticky', top: 0, zIndex: 2 }}>
          <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, fontWeight: 800, fontSize: 12 }}>
            {shown.length}{shown.length !== rows.length ? `/${rows.length}` : ''} khách
          </Box>
          <Box sx={{ flex: 1, position: 'relative', height: 24 }}>
            {ticks.map((t) => (
              <Box key={t} sx={{ position: 'absolute', left: `${pct(t)}%`, top: 0, transform: 'translateX(-50%)', fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap', pt: 0.5 }}>
                {fmtD(t)}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Dòng từng khách */}
        {shown.map(({ p, ms }, ri) => {
          const st = deriveVisaStatus(p);
          const meta = VISA_APPLICANT_STATUS_META[st];
          const resolved = st === 'passed' || st === 'have_visa' || st === 'cancelled';
          const dated = ms.filter((m) => m.t != null) as (VisaApplicantMilestone & { t: number })[];
          const lo = dated.length ? Math.min(...dated.map((m) => m.t)) : null;
          const hi = dated.length ? Math.max(...dated.map((m) => m.t)) : null;
          return (
            <Box key={p.id} sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: ri % 2 ? 'rgba(0,0,0,0.015)' : undefined }}>
              <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25, justifyContent: 'center' }}>
                <Typography fontSize={12.5} fontWeight={700} noWrap title={p.name}>{p.name || '(chưa có tên)'}</Typography>
                <Chip size="small" label={meta.label} sx={{ alignSelf: 'flex-start', height: 18, fontSize: 10.5, bgcolor: `${meta.color}22`, color: meta.color, fontWeight: 700 }} />
              </Box>
              <Box sx={{ flex: 1, position: 'relative', minHeight: 40 }}>
                {/* gridlines */}
                {ticks.map((t) => (
                  <Box key={t} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(t)}%`, borderLeft: '1px solid rgba(0,0,0,0.04)' }} />
                ))}
                {nowPct != null && <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${nowPct}%`, width: '2px', bgcolor: '#0ea5e9', zIndex: 1 }} />}
                {/* đường nối lo→hi */}
                {lo != null && hi != null && hi > lo && (
                  <Box sx={{ position: 'absolute', top: '50%', left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, height: 3, bgcolor: 'rgba(13,122,106,0.25)', borderRadius: 2, transform: 'translateY(-50%)' }} />
                )}
                {/* các chấm mốc (kéo để dời ngày khi editable) */}
                {dated.map((m) => {
                  const dragging = drag?.key === `${p.id}::${m.id}`;
                  const snapDays = dragging ? Math.round(drag.dx / drag.pxPerDay) : 0;
                  const shownT = startOfDay(m.t) + snapDays * DAY;
                  const left = pct(dragging ? shownT : m.t);
                  const overdue = !resolved && !dragging && startOfDay(m.t) < todayStart;
                  return (
                    <Tooltip key={m.id} title={dragging
                      ? `${m.label} → ${fmtFull(shownT)}${snapDays ? ` (${snapDays > 0 ? '+' : ''}${snapDays}n)` : ''}`
                      : `${m.label}: ${fmtFull(m.t)}${overdue ? ' · ⚠ quá hạn' : ''}${editable ? ' · kéo để dời' : ''}`}>
                      <Box
                        onPointerDown={editable ? (e) => {
                          const track = e.currentTarget.parentElement as HTMLElement;
                          const w = track.getBoundingClientRect().width;
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ key: `${p.id}::${m.id}`, rowId: p.id, msId: m.id, origT: startOfDay(m.t), startX: e.clientX, dx: 0, pxPerDay: (w * DAY) / span });
                        } : undefined}
                        onPointerMove={dragging ? (e) => setDrag((s) => (s ? { ...s, dx: e.clientX - s.startX } : s)) : undefined}
                        onPointerUp={dragging ? (e) => {
                          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                          const dd = Math.round(drag.dx / drag.pxPerDay);
                          setDrag(null);
                          if (dd !== 0) shiftMilestone(p.id, m.id, dd);
                        } : undefined}
                        sx={{
                          position: 'absolute', top: '50%', left: `${left}%`, transform: 'translate(-50%,-50%)',
                          width: 13, height: 13, borderRadius: '50%', bgcolor: colorOf(m),
                          border: overdue ? '2px solid #dc3250' : '2px solid #fff',
                          boxShadow: dragging ? '0 3px 8px rgba(0,0,0,0.45)' : overdue ? '0 0 0 2px rgba(220,50,80,0.35)' : '0 1px 3px rgba(0,0,0,0.3)',
                          zIndex: dragging ? 5 : overdue ? 3 : 2, cursor: editable ? 'grab' : 'default', touchAction: 'none',
                          '&:hover': { transform: 'translate(-50%,-50%) scale(1.25)' },
                        }} />
                    </Tooltip>
                  );
                })}
                {dated.length === 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
                    Chưa nhập mốc ngày
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Stack>
  );
}
