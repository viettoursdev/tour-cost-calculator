import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { detectConflicts, conflictedLegIds, colorFor, DEFAULT_BUFFER_MINS } from '@/lib/guideSchedule';
import { ROLE_RANK } from '@/auth/ROLES';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { CloudQuoteEntry, GuideFlightLeg, GuideRef } from '@/types';

const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n: number) => String(n).padStart(2, '0');
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
  // Subscribe to the quote index so tour options stay fresh as quotes sync in.
  useQuoteHistoryStore((s) => s.quotes);

  const [mode, setMode] = useState<'tour' | 'guide'>('tour');
  const [bufferMins, setBufferMins] = useState(DEFAULT_BUFFER_MINS);
  const [onlyMine, setOnlyMine] = useState(false);
  const [addTourOpen, setAddTourOpen] = useState(false);
  const [freelanceOpen, setFreelanceOpen] = useState(false);
  const [editLeg, setEditLeg] = useState<{ tourCloudId: string; leg: GuideFlightLeg | null } | null>(null);

  const canManage = me ? ROLE_RANK[me.role] >= ROLE_RANK.Operations : false;

  const guideOptions: GuideRef[] = useMemo(() => [
    ...users.map((u) => ({ kind: 'staff' as const, id: u.u, name: u.name })),
    ...freelancers.map((f) => ({ kind: 'freelance' as const, id: f.id, name: f.name })),
  ], [users, freelancers]);

  const guideNameOf = (id: string) => guideOptions.find((g) => g.id === id)?.name
    ?? Object.values(assignments).flatMap((a) => a.guides).find((g) => g.id === id)?.name ?? id;

  const tourList = useMemo(() => {
    let list = Object.values(assignments);
    if (onlyMine && me) list = list.filter((a) => a.guides.some((g) => g.id === me.u) || a.legs.some((l) => l.guideId === me.u));
    return list.sort((a, b) => (a.departDate ?? '').localeCompare(b.departDate ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, onlyMine, me]);

  const allLegs = useMemo(() => tourList.flatMap((a) =>
    (onlyMine && me ? a.legs.filter((l) => l.guideId === me.u) : a.legs)), [tourList, onlyMine, me]);

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

  const tourNameOf = (cloudId: string) => assignments[cloudId]?.tourName ?? cloudId;

  // Lịch theo HDV: gom mọi leg theo guideId, sort theo giờ.
  const byGuide = useMemo(() => {
    const m = new Map<string, GuideFlightLeg[]>();
    for (const l of allLegs) (m.get(l.guideId) ?? m.set(l.guideId, []).get(l.guideId)!).push(l);
    for (const arr of m.values()) arr.sort((a, b) => a.startISO.localeCompare(b.startISO));
    return [...m.entries()].sort((a, b) => guideNameOf(a[0]).localeCompare(guideNameOf(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLegs]);

  const reseed = async (cloudId: string) => {
    const a = assignments[cloudId];
    if (!a) return;
    const n = await seedLegsFromQuote(cloudId, a.guides.map((g) => g.id), { tourName: a.tourName, departDate: a.departDate });
    toast(n ? `✈️ Đã đồng bộ ${n} chặng bay từ báo giá.` : '⚠ Báo giá chưa có chuyến bay để đồng bộ.');
  };

  const deleteLeg = async (cloudId: string, legId: string) => {
    const a = assignments[cloudId];
    if (!a) return;
    await setLegs(cloudId, a.legs.filter((l) => l.id !== legId));
  };

  // ── Leg row ──
  const LegRow = ({ cloudId, leg, showTour }: { cloudId: string; leg: GuideFlightLeg; showTour?: boolean }) => {
    const conflicted = conflictIds.has(leg.id);
    const info = conflictInfo.get(leg.id);
    return (
      <Paper variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${colorFor(mode === 'guide' ? leg.guideId : leg.tourCloudId)}`,
        bgcolor: conflicted ? 'rgba(220,50,80,0.06)' : undefined }}>
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: LEGACY.pageBg }}>
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9 55%,#38bdf8)', color: '#fff', px: { xs: 2, sm: 3 }, py: 1.25 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Button onClick={onExit} startIcon={<ArrowBackIcon />}
            sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, background: 'rgba(255,255,255,0.16)', '&:hover': { background: 'rgba(255,255,255,0.28)' } }}>
            Trang chủ
          </Button>
          <Typography sx={{ fontSize: 18, fontWeight: 800, flexGrow: 1 }}>🧭 Lịch đi tour HDV</Typography>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v: 'tour' | 'guide' | null) => v && setMode(v)}
            sx={{ bgcolor: 'rgba(255,255,255,0.16)', '& .MuiToggleButton-root': { color: '#fff', border: 'none', textTransform: 'none', fontWeight: 700, px: 1.5 }, '& .Mui-selected': { bgcolor: 'rgba(255,255,255,0.32) !important', color: '#fff !important' } }}>
            <ToggleButton value="tour">Theo tour</ToggleButton>
            <ToggleButton value="guide">Theo HDV</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <TextField size="small" type="number" label="Đệm tối thiểu (phút)" value={bufferMins}
            onChange={(e) => setBufferMins(Math.max(0, Number(e.target.value) || 0))}
            sx={{ width: 170, bgcolor: '#fff', borderRadius: 1 }} InputLabelProps={{ shrink: true }} />
          <ToggleButton value="mine" selected={onlyMine} size="small" onChange={() => setOnlyMine((v) => !v)}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none', fontWeight: 700, '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.3)', color: '#fff' } }}>
            Chỉ lịch của tôi
          </ToggleButton>
          <Box sx={{ flex: 1 }} />
          {canManage && (
            <>
              <Button onClick={() => setFreelanceOpen(true)} startIcon={<PersonAddAltIcon />} size="small"
                sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, background: 'rgba(255,255,255,0.16)', '&:hover': { background: 'rgba(255,255,255,0.28)' } }}>
                HDV freelance
              </Button>
              <Button onClick={() => setAddTourOpen(true)} startIcon={<AddIcon />} size="small" variant="contained"
                sx={{ bgcolor: '#fff', color: '#0369a1', fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: '#e0f2fe' } }}>
                Thêm tour
              </Button>
            </>
          )}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          {conflicts.length > 0 && (
            <Alert severity="error" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
              Phát hiện <strong>{conflicts.length}</strong> trùng lịch (chồng giờ hoặc dưới {bufferMins}′ đệm). Các chặng vướng được tô đỏ.
            </Alert>
          )}

          {tourList.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>Chưa có tour nào trong lịch HDV.</Typography>
              {canManage && <Typography variant="caption">Bấm “Thêm tour” để chọn báo giá, gán HDV và đồng bộ lịch bay.</Typography>}
            </Paper>
          ) : mode === 'tour' ? (
            <Stack spacing={2}>
              {tourList.map((a) => {
                const legsByGuide = new Map<string, GuideFlightLeg[]>();
                for (const l of (onlyMine && me ? a.legs.filter((l) => l.guideId === me.u) : a.legs)) {
                  (legsByGuide.get(l.guideId) ?? legsByGuide.set(l.guideId, []).get(l.guideId)!).push(l);
                }
                return (
                  <Paper key={a.tourCloudId} variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Box sx={{ borderTop: `4px solid ${colorFor(a.tourCloudId)}`, p: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{a.tourName}</Typography>
                        {a.departDate && <Chip size="small" label={`KH ${new Date(a.departDate).toLocaleDateString('vi-VN')}`} />}
                        {canManage && (
                          <>
                            <Tooltip title="Đồng bộ lại lịch bay từ báo giá"><IconButton size="small" onClick={() => void reseed(a.tourCloudId)}><SyncIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                            <Tooltip title="Thêm chặng bay tay"><IconButton size="small" onClick={() => setEditLeg({ tourCloudId: a.tourCloudId, leg: null })}><AddIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                            <Tooltip title="Gỡ tour khỏi lịch"><IconButton size="small" onClick={() => { if (window.confirm('Gỡ tour này khỏi lịch HDV?')) void removeAssignment(a.tourCloudId); }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                          </>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                        {a.guides.map((g) => (
                          <Chip key={g.id} size="small"
                            avatar={<Avatar sx={{ fontSize: 11 }}>{g.name.charAt(0)}</Avatar>}
                            label={`${g.name}${g.kind === 'freelance' ? ' (FL)' : ''}`}
                            sx={{ '& .MuiChip-avatar': { bgcolor: colorFor(g.id), color: '#fff' } }} />
                        ))}
                        {a.guides.length === 0 && <Typography variant="caption" color="text.disabled">Chưa gán HDV</Typography>}
                      </Stack>
                    </Box>
                    <Box sx={{ p: 1.5, pt: 0 }}>
                      <Stack spacing={1.5}>
                        {[...legsByGuide.entries()].map(([gid, legs]) => (
                          <Box key={gid}>
                            <Typography variant="caption" fontWeight={700} sx={{ color: colorFor(gid) }}>{guideNameOf(gid)}</Typography>
                            <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                              {legs.map((l) => <LegRow key={l.id} cloudId={a.tourCloudId} leg={l} />)}
                            </Stack>
                          </Box>
                        ))}
                        {a.legs.length === 0 && <Typography variant="caption" color="text.disabled">Chưa có lịch bay — bấm Đồng bộ để lấy từ báo giá.</Typography>}
                      </Stack>
                    </Box>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Stack spacing={2}>
              {byGuide.map(([gid, legs]) => (
                <Paper key={gid} variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Box sx={{ borderTop: `4px solid ${colorFor(gid)}`, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Avatar sx={{ width: 30, height: 30, bgcolor: colorFor(gid), fontSize: 13, fontWeight: 800 }}>{guideNameOf(gid).charAt(0)}</Avatar>
                      <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{guideNameOf(gid)}</Typography>
                      <Chip size="small" label={`${legs.length} chặng`} />
                    </Stack>
                    <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                      {legs.map((l) => <LegRow key={l.id} cloudId={l.tourCloudId} leg={l} showTour />)}
                    </Stack>
                  </Box>
                </Paper>
              ))}
              {byGuide.length === 0 && <Typography variant="caption" color="text.disabled">Chưa có lịch bay.</Typography>}
            </Stack>
          )}
        </Box>
      </Box>

      {addTourOpen && (
        <AddTourDialog
          existing={new Set(Object.keys(assignments))}
          tours={visibleQuotes()}
          guideOptions={guideOptions}
          onClose={() => setAddTourOpen(false)}
          onConfirm={async (tour, guides) => {
            await setGuides(tour.cloudId, { tourName: tour.name, departDate: tour.departDate }, guides);
            const n = await seedLegsFromQuote(tour.cloudId, guides.map((g) => g.id), { tourName: tour.name, departDate: tour.departDate });
            setAddTourOpen(false);
            toast(n ? `✈️ Đã thêm tour & đồng bộ ${n} chặng bay.` : '✅ Đã thêm tour (báo giá chưa có chuyến bay).');
          }}
        />
      )}

      {freelanceOpen && (
        <FreelanceDialog onClose={() => setFreelanceOpen(false)} onAdd={async (name, phone) => {
          const f = await addFreelancer(name, { phone });
          if (f) toast(`✅ Đã thêm HDV freelance “${f.name}”.`);
          setFreelanceOpen(false);
        }} />
      )}

      {editLeg && (
        <LegDialog
          leg={editLeg.leg}
          guides={assignments[editLeg.tourCloudId]?.guides ?? []}
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
          }}
        />
      )}
    </Box>
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
          <Autocomplete
            options={opts} value={tour} onChange={(_, v) => setTour(v)}
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
            )}
          />
          <Autocomplete
            multiple options={guideOptions} value={guides} onChange={(_, v) => setGuides(v)}
            getOptionLabel={(g) => `${g.name}${g.kind === 'freelance' ? ' (FL)' : ''}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(p) => <TextField {...p} label="HDV phụ trách" placeholder="Chọn nhân sự / freelance" />}
          />
          <Typography variant="caption" color="text.secondary">Lịch bay sẽ tự lấy từ chuyến bay của báo giá; bạn chỉnh tay sau được.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={!tour || busy} onClick={async () => { if (!tour) return; setBusy(true); try { await onConfirm(tour, guides); } finally { setBusy(false); } }}>
          {busy ? 'Đang thêm…' : 'Thêm'}
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
        <Button variant="contained" disabled={!name.trim() || busy} onClick={async () => { setBusy(true); try { await onAdd(name.trim(), phone.trim() || undefined); } finally { setBusy(false); } }}>
          {busy ? 'Đang thêm…' : 'Thêm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Sửa / thêm chặng bay ──
type LegData = Pick<GuideFlightLeg, 'guideId' | 'flightNo' | 'depAirport' | 'arrAirport' | 'startISO' | 'endISO' | 'note'>;
function LegDialog({ leg, guides, onClose, onSave }: {
  leg: GuideFlightLeg | null; guides: GuideRef[];
  onClose: () => void; onSave: (data: LegData) => Promise<void>;
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
          <Stack direction="row" spacing={1.5}>
            <TextField label="Số hiệu" value={flightNo} onChange={(e) => setFlightNo(e.target.value.toUpperCase())} sx={{ flex: 1 }} />
          </Stack>
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
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({ guideId, flightNo: flightNo || undefined, depAirport: dep || undefined, arrAirport: arr || undefined, startISO: fromLocalInput(start), endISO: fromLocalInput(end) });
            } finally { setBusy(false); }
          }}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
