import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Avatar, AvatarGroup, Box, Button, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Paper, Stack, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import VisibilityIcon from '@mui/icons-material/Visibility';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useAuthStore } from '@/stores/authStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useMenuStore } from '@/stores/menuStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { canShareRecord } from '@/auth/recordAccess';
import { userLabel } from '@/auth/ROLES';
import { sbSendNotification } from '@/lib/supabase';
import { filterRank } from '@/lib/search';
import { canSeePrices } from '@/auth/quotePerms';
import { fmtVND } from './calc';
import { contractFlags, dealStage, DEAL_STAGES, DEAL_STAGE_LOST, type DealStage } from './dealStage';
import { DealCockpit } from './DealCockpit';
import { LEGACY } from '@/theme';
import type { CloudQuoteEntry, Collaborator, TourKind, TourProfile, User } from '@/types';

const STAGE_META = (st: DealStage) =>
  st === 'lost' ? DEAL_STAGE_LOST : (DEAL_STAGES.find((s) => s.key === st) ?? DEAL_STAGES[0]);

/** Số lượng thực thể liên kết gom theo hồ sơ (qua các báo giá thuộc hồ sơ). */
type ProfileLinks = { contract: number; visa: number; menu: number; itinerary: number };

const prefsKey = (u: string) => `vte_tourprofile_prefs_${u}`;
const loadExpanded = (u?: string): Set<string> => {
  if (!u) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(prefsKey(u)) || '[]') as string[]); }
  catch { return new Set(); }
};

/**
 * Đợt 3 — "Hồ sơ tour": DANH SÁCH các hồ sơ tour user được xem (creator/collab/
 * follow/Trưởng-Phó Phòng cùng phòng/BGĐ-CEO). Mỗi hồ sơ xem nhanh (preview ẩn/hiện)
 * báo giá liên kết + giai đoạn + khách + thêm Collab (sửa) / Follow (theo dõi).
 * Bấm "Mở hồ sơ" → nạp báo giá chính & hiện Bảng điều hành (DealCockpit) tại chỗ.
 */
export function TourProfilesView() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const profiles = useTourProfileStore((s) => s.profiles);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const contracts = useContractStore((s) => s.contracts);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const guideAssignments = useGuideScheduleStore((s) => s.assignments);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setPrimaryQuote = useTourProfileStore((s) => s.setPrimaryQuote);
  const archive = useTourProfileStore((s) => s.archive);
  const createProfile = useTourProfileStore((s) => s.create);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const showPrice = canSeePrices(currentUser);

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(currentUser?.u));

  const visible = useTourProfileStore((s) => s.visibleProfiles);
  // Báo giá gom theo hồ sơ (1 hồ sơ : N báo giá).
  const quotesByProfile = useMemo(() => {
    const m = new Map<string, CloudQuoteEntry[]>();
    for (const q of quotes) {
      if (!q.tourProfileId) continue;
      const arr = m.get(q.tourProfileId) ?? [];
      arr.push(q);
      m.set(q.tourProfileId, arr);
    }
    return m;
  }, [quotes]);

  // ── Precompute meta MỘT LẦN cho mọi hồ sơ (O(n) thay vì O(rows×entities)). ──
  const meta = useMemo(() => {
    const quoteToProfile = new Map<string, string>();    // cloudId → profileId
    for (const q of quotes) if (q.tourProfileId) quoteToProfile.set(q.cloudId, q.tourProfileId);
    const contractByQuote = new Map<string, typeof contracts[number]>();
    for (const c of contracts) if (c.linkedQuoteId) contractByQuote.set(c.linkedQuoteId, c);

    const m = new Map<string, { primary?: CloudQuoteEntry; stage: DealStage; links: ProfileLinks; guide: number }>();
    // Đọc kép: thực thể thuộc hồ sơ nào (ưu tiên tourProfileId, fallback qua báo giá).
    const profOf = (e: { tourProfileId?: string | null; linkedQuoteId?: string | null }): string | undefined =>
      e.tourProfileId ?? (e.linkedQuoteId ? quoteToProfile.get(e.linkedQuoteId) : undefined);
    const ensure = (pid: string) => {
      let v = m.get(pid);
      if (!v) { v = { stage: 'request', links: { contract: 0, visa: 0, menu: 0, itinerary: 0 }, guide: 0 }; m.set(pid, v); }
      return v;
    };
    for (const c of contracts) { const pid = profOf(c); if (pid) ensure(pid).links.contract++; }
    for (const v of visaProjects) { const pid = profOf(v); if (pid) ensure(pid).links.visa++; }
    for (const mn of menus) { const pid = profOf(mn); if (pid) ensure(pid).links.menu++; }
    for (const it of itineraries) { const pid = profOf(it); if (pid) ensure(pid).links.itinerary++; }
    // Lịch HDV keyed theo tourCloudId → quy về hồ sơ.
    for (const key of Object.keys(guideAssignments)) {
      const pid = quoteToProfile.get(key);
      if (pid) ensure(pid).guide++;
    }
    // Báo giá chính + giai đoạn (suy từ báo giá chính).
    for (const p of profiles) {
      const list = quotesByProfile.get(p.id) ?? [];
      const primary = list.find((q) => q.cloudId === p.primaryQuoteId) ?? list[0];
      const v = ensure(p.id);
      v.primary = primary;
      v.stage = primary
        ? dealStage({ status: primary.status, contract: contractFlags(contractByQuote.get(primary.cloudId)), departureISO: primary.departDate })
        : 'request';
    }
    return m;
  }, [quotes, contracts, visaProjects, menus, itineraries, guideAssignments, profiles, quotesByProfile]);

  const metaOf = (id: string) => meta.get(id) ?? { primary: undefined, stage: 'request' as DealStage, links: { contract: 0, visa: 0, menu: 0, itinerary: 0 }, guide: 0 };
  const primaryOf = (p: TourProfile): CloudQuoteEntry | undefined => metaOf(p.id).primary;

  const rows = useMemo(() => {
    let list = visible().slice();
    if (!showArchived) list = list.filter((p) => p.status !== 'archived');
    list.sort((a, b) => {
      if ((a.status === 'archived') !== (b.status === 'archived')) return a.status === 'archived' ? 1 : -1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return filterRank(list, search, (p) => [p.code, p.name, p.customerName].filter(Boolean).join(' '));
  }, [visible, profiles, search, showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (currentUser) { try { localStorage.setItem(prefsKey(currentUser.u), JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };

  const openQuote = async (cloudId: string, keepView: boolean) => {
    if (currentQuoteId && currentQuoteId !== cloudId &&
        !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return false;
    const r = await loadCloud(cloudId, { keepView });
    if (!r.ok) { window.alert('⚠ ' + r.error); return false; }
    return true;
  };

  const openProfile = async (p: TourProfile) => {
    const pq = primaryOf(p);
    if (!pq) { window.alert('Hồ sơ chưa có báo giá nào để mở.'); return; }
    if (await openQuote(pq.cloudId, true)) setDetailId(p.id);
  };

  // ── Detail: Bảng điều hành (DealCockpit) của báo giá chính, kèm thanh hồ sơ ──
  if (detailId) {
    const p = profiles.find((x) => x.id === detailId);
    const opts = p ? (quotesByProfile.get(p.id) ?? []) : [];
    const canEdit = p ? canShareRecord(currentUser, p, users) : false;
    return (
      <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setDetailId(null)}>Danh sách hồ sơ</Button>
          {p && <Chip size="small" label={p.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />}
          {opts.length > 1 && (
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">Phương án:</Typography>
              {opts.map((q) => {
                const isPrimary = q.cloudId === p?.primaryQuoteId;
                return (
                  <Chip key={q.cloudId} size="small" clickable
                    variant={currentQuoteId === q.cloudId ? 'filled' : 'outlined'}
                    color={currentQuoteId === q.cloudId ? 'primary' : 'default'}
                    icon={isPrimary ? <StarIcon sx={{ fontSize: 15 }} /> : undefined}
                    label={q.name}
                    onClick={() => void openQuote(q.cloudId, true)}
                    // Icon sao bên phải (onDelete) = đặt làm báo giá chính.
                    onDelete={canEdit && !isPrimary && p ? () => void setPrimaryQuote(p.id, q.cloudId) : undefined}
                    deleteIcon={<Tooltip title="Đặt làm báo giá chính"><StarBorderIcon sx={{ fontSize: 16 }} /></Tooltip>}
                  />
                );
              })}
            </Stack>
          )}
        </Stack>
        <DealCockpit />
        {p && <DirectLinkPanel profile={p} />}
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>🧭 Hồ sơ tour</Typography>
          <Typography variant="caption" color="text.secondary">
            {rows.length} hồ sơ · trung tâm liên kết báo giá / khách / hợp đồng / vận hành / visa…
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControlLabel
            control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
            label={<Typography variant="caption">Hiện lưu trữ</Typography>}
            sx={{ mr: 0 }}
          />
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Tìm mã, tên tour, khách…" sx={{ minWidth: 220 }} />
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Hồ sơ trống
          </Button>
        </Stack>
      </Stack>

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Chưa có hồ sơ tour nào. Bấm <strong>＋ Tạo báo giá và tour mới</strong> để mở hồ sơ đầu tiên,
            hoặc <strong>Hồ sơ trống</strong> để mở một tour chưa có báo giá.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((p) => {
            const mt = metaOf(p.id);
            return (
              <ProfileRow
                key={p.id}
                profile={p}
                stage={mt.stage}
                primary={mt.primary}
                guideCount={mt.guide}
                quotes={quotesByProfile.get(p.id) ?? []}
                links={mt.links}
                expanded={expanded.has(p.id)}
                showPrice={showPrice}
                currentUser={currentUser}
                users={users}
                onToggle={() => toggle(p.id)}
                onOpenProfile={() => void openProfile(p)}
                onOpenQuote={(cid) => void openQuote(cid, false)}
                onSetPrimary={(cid) => void setPrimaryQuote(p.id, cid)}
                onArchive={(on) => void archive(p.id, on)}
              />
            );
          })}
        </Stack>
      )}

      <CreateEmptyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (kind, name) => {
          const created = await createProfile({ kind, name });
          setCreateOpen(false);
          if (created) setExpanded((prev) => new Set(prev).add(created.id));
        }}
      />
    </Box>
  );
}

function CreateEmptyDialog({ open, onClose, onCreate }: {
  open: boolean; onClose: () => void; onCreate: (kind: TourKind, name: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<TourKind>('domestic');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setKind('domestic'); setName(''); setBusy(false); } }, [open]);
  const submit = async () => { setBusy(true); try { await onCreate(kind, name.trim()); } finally { setBusy(false); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Tạo hồ sơ tour trống</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Mở một hồ sơ tour chưa có báo giá — gắn thực đơn / chương trình / visa / hợp đồng vào sau (DirectLinkPanel).
        </Typography>
        <ToggleButtonGroup exclusive size="small" value={kind} sx={{ mb: 2 }}
          onChange={(_, v: TourKind | null) => { if (v) setKind(v); }}>
          <ToggleButton value="domestic">Nội địa (NĐ)</ToggleButton>
          <ToggleButton value="intl">Nước ngoài (NN)</ToggleButton>
        </ToggleButtonGroup>
        <TextField fullWidth autoFocus label="Tên tour" value={name}
          onChange={(e) => setName(e.target.value)} placeholder="VD: Đà Lạt – Đoàn ABC" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void submit()}
          sx={{ background: LEGACY.headerGradient }}>{busy ? 'Đang tạo…' : 'Tạo hồ sơ'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ProfileRow({
  profile, stage, primary, guideCount, quotes, links, expanded, showPrice,
  currentUser, users, onToggle, onOpenProfile, onOpenQuote, onSetPrimary, onArchive,
}: {
  profile: TourProfile; stage: DealStage; primary?: CloudQuoteEntry; guideCount: number; quotes: CloudQuoteEntry[];
  links: ProfileLinks; expanded: boolean; showPrice: boolean;
  currentUser: User | null; users: User[];
  onToggle: () => void; onOpenProfile: () => void; onOpenQuote: (cloudId: string) => void;
  onSetPrimary: (cloudId: string) => void; onArchive: (on: boolean) => void;
}) {
  const sm = STAGE_META(stage);
  const canShare = canShareRecord(currentUser, profile, users);
  const pay = primary?.paymentSummary;
  // A2 — KHÁCH/NGÀY/PAX suy từ BÁO GIÁ CHÍNH (không tin bản sao cứng trong hồ sơ → tránh lệch).
  const custName = primary?.customerName ?? profile.customerName;
  const departDate = primary?.departDate ?? profile.startDate;
  const pax = primary?.pax ?? profile.pax;
  const archived = profile.status === 'archived';

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderLeft: `4px solid ${sm.color}`, opacity: archived ? 0.6 : 1 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={profile.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />
            <Typography fontWeight={800} fontSize={14.5} noWrap sx={{ maxWidth: { xs: 180, sm: 360 } }}>
              {profile.name || '(chưa đặt tên)'}
            </Typography>
            <Chip size="small" label={sm.short} sx={{ height: 20, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700 }} />
            {archived && <Chip size="small" label="Lưu trữ" variant="outlined" sx={{ height: 20 }} />}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Meta label="Khách" value={custName || '—'} />
            <Meta label="Khởi hành" value={departDate ? new Date(departDate).toLocaleDateString('vi-VN') : '—'} />
            {pax ? <Meta label="Số khách" value={String(pax)} /> : null}
            <Meta label="Báo giá" value={String(quotes.length)} />
            {links.contract > 0 && <Meta label="Hợp đồng" value={String(links.contract)} />}
            {links.visa > 0 && <Meta label="Visa" value={String(links.visa)} />}
            {links.menu > 0 && <Meta label="Thực đơn" value={String(links.menu)} />}
            {links.itinerary > 0 && <Meta label="Chương trình" value={String(links.itinerary)} />}
            {guideCount > 0 && <Meta label="Lịch HDV" value={String(guideCount)} />}
            {showPrice && primary && <Meta label="Giá trị" value={fmtVND(primary.totalCost ?? 0)} />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {(profile.collaborators?.length || profile.followers?.length) ? (
            <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
              {[...(profile.collaborators ?? []), ...(profile.followers ?? [])].map((c, i) => (
                <Tooltip key={c.u + i} title={c.name}><Avatar>{c.name.charAt(0)}</Avatar></Tooltip>
              ))}
            </AvatarGroup>
          ) : null}
          {canShare && (
            <Tooltip title={archived ? 'Mở lại hồ sơ' : 'Lưu trữ hồ sơ'}>
              <IconButton size="small" onClick={() => onArchive(!archived)}>
                {archived ? <UnarchiveOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            onClick={onOpenProfile} sx={{ whiteSpace: 'nowrap' }}>Mở hồ sơ</Button>
          <IconButton size="small" onClick={onToggle}>{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
        </Stack>
      </Stack>

      <Collapse in={expanded} unmountOnExit>
        <Divider sx={{ my: 1.25 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 2 }}>
          {/* Các phương án báo giá của hồ sơ */}
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary">Phương án báo giá ({quotes.length})</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {quotes.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có báo giá.</Typography>}
              {quotes.map((q) => {
                const isPrimary = q.cloudId === profile.primaryQuoteId;
                return (
                  <Stack key={q.cloudId} direction="row" alignItems="center" spacing={0.5}
                    sx={{ border: '1px solid rgba(15,58,74,0.12)', borderRadius: 1.5, px: 1, py: 0.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={13} fontWeight={600} noWrap>
                        {isPrimary ? '★ ' : ''}{q.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{q.quoteCode}{showPrice ? ` · ${fmtVND(q.totalCost ?? 0)}` : ''}</Typography>
                    </Box>
                    {canShare && !isPrimary && (
                      <Tooltip title="Đặt làm báo giá chính">
                        <IconButton size="small" onClick={() => onSetPrimary(q.cloudId)}><StarBorderIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    <Button size="small" onClick={() => onOpenQuote(q.cloudId)}>Mở</Button>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
          {/* Công nợ + chia sẻ */}
          <Box>
            {showPrice && pay && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Công nợ NCC (báo giá chính)</Typography>
                <Stack direction="row" spacing={1.5} sx={{ mt: 0.25 }}>
                  <Meta label="Phải trả" value={fmtVND(pay.payable)} />
                  <Meta label="Đã trả" value={fmtVND(pay.paid)} />
                  <Meta label="Còn lại" value={fmtVND(pay.remaining)} />
                </Stack>
              </Box>
            )}
            <ShareControl profile={profile} users={users} currentUser={currentUser} canShare={canShare} />
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>{label}</Typography>
      <Typography fontSize={13} fontWeight={700} noWrap>{value}</Typography>
    </Box>
  );
}

type LinkItem = { id: string; label: string; sub?: string; tourProfileId?: string | null };

/** Gắn TRỰC TIẾP thực đơn/chương trình/visa/HĐ vào hồ sơ (set tourProfileId) —
 *  dùng được kể cả khi tour CHƯA có báo giá nào. */
function DirectLinkPanel({ profile }: { profile: TourProfile }) {
  const user = useAuthStore((s) => s.currentUser);
  const savedBy = user ? `${user.name} (${user.role})` : '';
  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const contracts = useContractStore((s) => s.contracts);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { window.alert('❌ ' + (e as Error).message); } finally { setBusy(false); }
  };

  const setMenu = (id: string, on: boolean) => run(async () => {
    const full = await useMenuStore.getState().load(id);
    if (full) await useMenuStore.getState().save({ ...full, tourProfileId: on ? profile.id : null }, savedBy);
  });
  const setItin = (id: string, on: boolean) => run(async () => {
    const full = await useItineraryStore.getState().load(id);
    if (full) await useItineraryStore.getState().save({ ...full, tourProfileId: on ? profile.id : null }, savedBy);
  });
  const setVisa = (id: string, on: boolean) => run(async () => {
    const p = visaProjects.find((x) => x.id === id);
    if (p) await useVisaProjectStore.getState().save({ ...p, tourProfileId: on ? profile.id : null });
  });
  const setContract = (id: string, on: boolean) => run(async () => {
    const c = contracts.find((x) => x.id === id);
    if (c) await useContractStore.getState().save({ ...c, tourProfileId: on ? profile.id : null });
  });

  const sections: { title: string; items: LinkItem[]; set: (id: string, on: boolean) => void }[] = [
    { title: '🍽️ Thực đơn', set: setMenu, items: menus.map((m) => ({ id: m.id, label: m.title, sub: m.code, tourProfileId: m.tourProfileId })) },
    { title: '🗺️ Chương trình tour', set: setItin, items: itineraries.map((i) => ({ id: i.id, label: i.title, sub: i.code, tourProfileId: i.tourProfileId })) },
    { title: '🛂 Dự án visa', set: setVisa, items: visaProjects.map((v) => ({ id: v.id, label: v.name || v.code, sub: v.country, tourProfileId: v.tourProfileId })) },
    { title: '📜 Hợp đồng', set: setContract, items: contracts.map((c) => ({ id: c.id, label: c.tourName || c.contractNo, sub: c.contractNo, tourProfileId: c.tourProfileId })) },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 0.5 }}>🔗 Gắn liên kết trực tiếp vào hồ sơ</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Gắn thực đơn / chương trình / visa / hợp đồng thẳng vào hồ sơ tour — dùng được kể cả khi chưa có báo giá.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        {sections.map((s) => (
          <DirectLinkSection key={s.title} title={s.title} profileId={profile.id} items={s.items} busy={busy} onSet={s.set} />
        ))}
      </Box>
    </Paper>
  );
}

function DirectLinkSection({ title, profileId, items, busy, onSet }: {
  title: string; profileId: string; items: LinkItem[]; busy: boolean; onSet: (id: string, on: boolean) => void;
}) {
  const [pick, setPick] = useState<LinkItem | null>(null);
  const linked = items.filter((i) => i.tourProfileId === profileId);
  const options = items.filter((i) => i.tourProfileId !== profileId);
  return (
    <Box>
      <Typography fontWeight={700} fontSize={12.5} sx={{ mb: 0.5 }}>{title}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>({linked.length})</Typography>
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 0.75 }}>
        {linked.map((o) => (
          <Stack key={o.id} direction="row" alignItems="center" spacing={1}
            sx={{ border: '1px solid rgba(13,122,106,0.25)', borderRadius: 1.5, px: 1, py: 0.25, bgcolor: 'rgba(13,122,106,0.06)' }}>
            <Typography fontSize={12.5} fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>{o.label}</Typography>
            <Button size="small" color="error" disabled={busy} onClick={() => onSet(o.id, false)} sx={{ minWidth: 0 }}>Gỡ</Button>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5}>
        <Autocomplete
          size="small" sx={{ flex: 1 }} options={options} value={pick}
          onChange={(_, v) => setPick(v)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, o) => (<li {...props} key={o.id}><Box><Typography variant="body2">{o.label}</Typography>{o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}</Box></li>)}
          renderInput={(pr) => <TextField {...pr} placeholder="Chọn để gắn…" />}
        />
        <Button size="small" variant="outlined" disabled={busy || !pick} onClick={() => { if (pick) { onSet(pick.id, true); setPick(null); } }}>+ Gắn</Button>
      </Stack>
    </Box>
  );
}

/** Thêm Collab (sửa) / Follow (theo dõi + nhận thông báo) vào hồ sơ. */
function ShareControl({ profile, users, currentUser, canShare }: {
  profile: TourProfile; users: User[]; currentUser: User | null; canShare: boolean;
}) {
  const addCollaborator = useTourProfileStore((s) => s.addCollaborator);
  const addFollower = useTourProfileStore((s) => s.addFollower);
  const [pick, setPick] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set([
    profile.createdByU,
    ...(profile.collaborators ?? []).map((c) => c.u),
    ...(profile.followers ?? []).map((c) => c.u),
  ]);
  const options = users.filter((u) => !taken.has(u.u));

  const add = async (role: 'collab' | 'follow') => {
    if (!pick) return;
    setBusy(true);
    const c: Collaborator = { u: pick.u, name: pick.name };
    try {
      if (role === 'collab') await addCollaborator(profile.id, c);
      else {
        await addFollower(profile.id, c);
        // Follow → báo cho người được thêm (tái dùng notificationStore gateway).
        try {
          await sbSendNotification(pick.u, {
            type: 'collab_invite',
            title: `Bạn đang theo dõi hồ sơ tour ${profile.code}`,
            message: `${currentUser?.name ?? 'Ai đó'} đã thêm bạn theo dõi hồ sơ "${profile.name || profile.code}".`,
            createdBy: currentUser?.name ?? '',
            ...(profile.primaryQuoteId ? { link: { kind: 'quote' as const, id: profile.primaryQuoteId, label: profile.code } } : {}),
          });
        } catch { /* thông báo không chặn */ }
      }
      setPick(null);
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <Typography variant="caption" fontWeight={800} color="text.secondary">Cộng tác · Theo dõi</Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, mb: 0.75 }} flexWrap="wrap" useFlexGap>
        {(profile.collaborators ?? []).map((c) => (
          <Chip key={'c' + c.u} size="small" icon={<GroupAddIcon sx={{ fontSize: 14 }} />} label={c.name}
            sx={{ height: 22, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a' }} />
        ))}
        {(profile.followers ?? []).map((c) => (
          <Chip key={'f' + c.u} size="small" icon={<VisibilityIcon sx={{ fontSize: 14 }} />} label={c.name}
            variant="outlined" sx={{ height: 22 }} />
        ))}
        {!profile.collaborators?.length && !profile.followers?.length && (
          <Typography variant="caption" color="text.secondary">Chỉ mình bạn.</Typography>
        )}
      </Stack>
      {canShare ? (
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Autocomplete
            size="small" sx={{ flex: 1, minWidth: 140 }} options={options} value={pick}
            onChange={(_, v) => setPick(v)}
            getOptionLabel={(u) => userLabel(u, currentUser)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderInput={(pr) => <TextField {...pr} placeholder="Chọn nhân sự…" />}
          />
          <Button size="small" variant="outlined" disabled={!pick || busy} onClick={() => void add('collab')}>+ Collab</Button>
          <Button size="small" disabled={!pick || busy} onClick={() => void add('follow')}>+ Follow</Button>
        </Stack>
      ) : (
        <Typography variant="caption" color="text.disabled">Chỉ người tạo / Trưởng phòng / BGĐ mới thêm được cộng tác.</Typography>
      )}
    </Box>
  );
}
