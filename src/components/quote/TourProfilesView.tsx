import { useMemo, useState } from 'react';
import {
  Autocomplete, Avatar, AvatarGroup, Box, Button, Chip, Collapse, Divider, IconButton,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAuthStore } from '@/stores/authStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { canShareRecord } from '@/auth/recordAccess';
import { userLabel } from '@/auth/ROLES';
import { sbSendNotification } from '@/lib/supabase';
import { filterRank } from '@/lib/search';
import { canSeePrices } from '@/auth/quotePerms';
import { fmtVND } from './calc';
import { contractFlags, dealStage, DEAL_STAGES, DEAL_STAGE_LOST, type DealStage } from './dealStage';
import { DealCockpit } from './DealCockpit';
import type { CloudQuoteEntry, Collaborator, TourProfile, User } from '@/types';

const STAGE_META = (st: DealStage) =>
  st === 'lost' ? DEAL_STAGE_LOST : (DEAL_STAGES.find((s) => s.key === st) ?? DEAL_STAGES[0]);

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
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const showPrice = canSeePrices(currentUser);

  const [search, setSearch] = useState('');
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

  const rows = useMemo(() => {
    const list = visible().slice().sort((a, b) => {
      if ((a.status === 'archived') !== (b.status === 'archived')) return a.status === 'archived' ? 1 : -1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return filterRank(list, search, (p) => [p.code, p.name, p.customerName].filter(Boolean).join(' '));
  }, [visible, profiles, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giai đoạn hồ sơ = suy từ BÁO GIÁ CHÍNH (status + hợp đồng liên kết + ngày KH).
  const primaryOf = (p: TourProfile): CloudQuoteEntry | undefined => {
    const list = quotesByProfile.get(p.id) ?? [];
    return list.find((q) => q.cloudId === p.primaryQuoteId) ?? list[0];
  };
  const stageOf = (p: TourProfile): DealStage => {
    const pq = primaryOf(p);
    if (!pq) return 'request';
    const c = contracts.find((x) => x.linkedQuoteId === pq.cloudId);
    return dealStage({ status: pq.status, contract: contractFlags(c), departureISO: pq.departDate });
  };

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
    return (
      <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setDetailId(null)}>Danh sách hồ sơ</Button>
          {p && <Chip size="small" label={p.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />}
          {opts.length > 1 && (
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">Phương án:</Typography>
              {opts.map((q) => (
                <Chip key={q.cloudId} size="small" clickable
                  variant={currentQuoteId === q.cloudId ? 'filled' : 'outlined'}
                  color={currentQuoteId === q.cloudId ? 'primary' : 'default'}
                  label={q.cloudId === p?.primaryQuoteId ? `★ ${q.name}` : q.name}
                  onClick={() => void openQuote(q.cloudId, true)} />
              ))}
            </Stack>
          )}
        </Stack>
        <DealCockpit />
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
        <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm mã, tên tour, khách…" sx={{ minWidth: 240 }} />
      </Stack>

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Chưa có hồ sơ tour nào. Bấm <strong>＋ Tạo báo giá và tour mới</strong> để mở hồ sơ đầu tiên.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              stage={stageOf(p)}
              primary={primaryOf(p)}
              quotes={quotesByProfile.get(p.id) ?? []}
              visaCount={visaProjects.filter((v) => (quotesByProfile.get(p.id) ?? []).some((q) => q.cloudId === v.linkedQuoteId)).length}
              contractCount={contracts.filter((c) => (quotesByProfile.get(p.id) ?? []).some((q) => q.cloudId === c.linkedQuoteId)).length}
              expanded={expanded.has(p.id)}
              showPrice={showPrice}
              currentUser={currentUser}
              users={users}
              onToggle={() => toggle(p.id)}
              onOpenProfile={() => void openProfile(p)}
              onOpenQuote={(cid) => void openQuote(cid, false)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ProfileRow({
  profile, stage, primary, quotes, visaCount, contractCount, expanded, showPrice,
  currentUser, users, onToggle, onOpenProfile, onOpenQuote,
}: {
  profile: TourProfile; stage: DealStage; primary?: CloudQuoteEntry; quotes: CloudQuoteEntry[];
  visaCount: number; contractCount: number; expanded: boolean; showPrice: boolean;
  currentUser: User | null; users: User[];
  onToggle: () => void; onOpenProfile: () => void; onOpenQuote: (cloudId: string) => void;
}) {
  const sm = STAGE_META(stage);
  const canShare = canShareRecord(currentUser, profile, users);
  const pay = primary?.paymentSummary;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderLeft: `4px solid ${sm.color}`, opacity: profile.status === 'archived' ? 0.6 : 1 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={profile.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />
            <Typography fontWeight={800} fontSize={14.5} noWrap sx={{ maxWidth: { xs: 180, sm: 360 } }}>
              {profile.name || '(chưa đặt tên)'}
            </Typography>
            <Chip size="small" label={sm.short} sx={{ height: 20, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700 }} />
            {profile.status === 'archived' && <Chip size="small" label="Lưu trữ" variant="outlined" sx={{ height: 20 }} />}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Meta label="Khách" value={profile.customerName || '—'} />
            <Meta label="Khởi hành" value={profile.startDate ? new Date(profile.startDate).toLocaleDateString('vi-VN') : '—'} />
            <Meta label="Báo giá" value={String(quotes.length)} />
            {contractCount > 0 && <Meta label="Hợp đồng" value={String(contractCount)} />}
            {visaCount > 0 && <Meta label="Visa" value={String(visaCount)} />}
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
              {quotes.map((q) => (
                <Stack key={q.cloudId} direction="row" alignItems="center" spacing={1}
                  sx={{ border: '1px solid rgba(15,58,74,0.12)', borderRadius: 1.5, px: 1, py: 0.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontSize={13} fontWeight={600} noWrap>
                      {q.cloudId === profile.primaryQuoteId ? '★ ' : ''}{q.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{q.quoteCode}{showPrice ? ` · ${fmtVND(q.totalCost ?? 0)}` : ''}</Typography>
                  </Box>
                  <Button size="small" onClick={() => onOpenQuote(q.cloudId)}>Mở</Button>
                </Stack>
              ))}
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
