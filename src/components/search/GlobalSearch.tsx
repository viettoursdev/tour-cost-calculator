import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Chip, Dialog, InputBase, Stack, Typography,
} from '@mui/material';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useContractStore } from '@/stores/contractStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useMenuStore } from '@/stores/menuStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { useLinkNavStore, type LinkNavKind } from '@/stores/linkNavStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { ROLE_RANK } from '@/auth/ROLES';
import { filterRank } from '@/lib/search';
import { buildSearchIndex, type IndexItem, type IndexKind } from '@/lib/searchIndex';
import { LEGACY } from '@/theme';
import type { Template } from '@/types';
import type { QuoteViewKey } from '@/stores/quoteStore';

type NavCmd = { v: QuoteViewKey; label: string; icon: string };
/** Lệnh điều hướng (nhảy tới tab) — phần "command" của command palette. */
type Row = { t: 'nav'; nav: NavCmd } | { t: 'rec'; it: IndexItem };

type Kind = IndexKind;
type SItem = IndexItem;

const META: Record<Kind, { label: string; icon: string; color: string }> = {
  quoteDom:    { label: 'Báo giá nội địa', icon: '📋', color: '#0d7a6a' },
  quoteIntl:   { label: 'Báo giá nước ngoài', icon: '🌏', color: '#2563eb' },
  dmc:         { label: 'DMC Breakdown', icon: '📊', color: '#0f3a4a' },
  itinerary:   { label: 'Chương trình', icon: '🗺️', color: '#0891b2' },
  menu:        { label: 'Thực đơn', icon: '🍽️', color: '#b45309' },
  contract:    { label: 'Hợp đồng', icon: '📜', color: '#7c3aed' },
  visaProject: { label: 'Dự án visa', icon: '🛂', color: '#dc3250' },
  visaProc:    { label: 'Hồ sơ visa', icon: '🗂️', color: '#a855f7' },
  customer:    { label: 'Khách hàng', icon: '👥', color: '#16a34a' },
  ncc:         { label: 'Nhà cung cấp', icon: '🏢', color: '#475569' },
  tourProfile: { label: 'Hồ sơ tour', icon: '🧭', color: '#0d7a6a' },
};

type ScopeKey = 'all' | 'tourProfile' | 'quote' | 'itinerary' | 'menu' | 'contract' | 'visa' | 'customer' | 'ncc';
const SCOPES: { key: ScopeKey; label: string; kinds: Kind[] }[] = [
  { key: 'all', label: 'Tất cả', kinds: [] },
  { key: 'tourProfile', label: '🧭 Hồ sơ tour', kinds: ['tourProfile'] },
  { key: 'quote', label: '📋 Báo giá', kinds: ['quoteDom', 'quoteIntl', 'dmc'] },
  { key: 'itinerary', label: '🗺️ Chương trình', kinds: ['itinerary'] },
  { key: 'menu', label: '🍽️ Thực đơn', kinds: ['menu'] },
  { key: 'contract', label: '📜 Hợp đồng', kinds: ['contract'] },
  { key: 'visa', label: '🛂 Visa', kinds: ['visaProject', 'visaProc'] },
  { key: 'customer', label: '👥 Khách hàng', kinds: ['customer'] },
  { key: 'ncc', label: '🏢 NCC', kinds: ['ncc'] },
];

const RECENT_KEY = 'vte_search_recent';
type RecentRef = { kind: Kind; id: string; title: string; subtitle: string };
function readRecent(): RecentRef[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentRef[]; } catch { return []; }
}
function pushRecent(it: SItem) {
  try {
    const cur = readRecent().filter((r) => !(r.kind === it.kind && r.id === it.id));
    cur.unshift({ kind: it.kind, id: it.id, title: it.title, subtitle: it.subtitle });
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8)));
  } catch { /* ignore */ }
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const dmcQuotes = useQuoteHistoryStore((s) => s.dmcQuotes);
  const contracts = useContractStore((s) => s.contracts);
  const customers = useCustomerStore((s) => s.customers);
  const suppliers = useNccStore((s) => s.suppliers);
  const itineraries = useItineraryStore((s) => s.list);
  const menus = useMenuStore((s) => s.list);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const visaProcs = useVisaProcStore((s) => s.list);
  const tourProfilesAll = useTourProfileStore((s) => s.profiles);

  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeKey>('all');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setScope('all'); setActive(0); setTimeout(() => inputRef.current?.focus(), 60); } }, [open]);

  const index = useMemo<SItem[]>(
    () => buildSearchIndex({ quotes, dmcQuotes, contracts, customers, suppliers, itineraries, menus, visaProjects, visaProcs, tourProfiles: useTourProfileStore.getState().visibleProfiles() }),
    // tourProfilesAll giữ trong deps để re-index khi hồ sơ đổi (body gọi visibleProfiles() qua getState).
    [quotes, dmcQuotes, contracts, customers, suppliers, itineraries, menus, visaProjects, visaProcs, tourProfilesAll], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const scopedIndex = useMemo<SItem[]>(() => {
    if (scope === 'all') return index;
    const kinds = SCOPES.find((s) => s.key === scope)?.kinds ?? [];
    return index.filter((it) => kinds.includes(it.kind));
  }, [index, scope]);

  const me = useAuthStore((s) => s.currentUser);
  const navCmds = useMemo<NavCmd[]>(() => {
    const base: NavCmd[] = [
      { v: 'home', label: 'Hôm nay', icon: '🏠' },
      { v: 'cost', label: 'Bảng báo giá', icon: '📊' },
      { v: 'summary', label: 'Tổng kết & định giá', icon: '💰' },
      { v: 'pipeline', label: 'Pipeline bán hàng', icon: '🧲' },
      { v: 'salesanalytics', label: 'Phân tích bán hàng', icon: '📊' },
      { v: 'workflow', label: 'Quy trình điều hành', icon: '🗂️' },
      { v: 'opsboard', label: 'Điều phối', icon: '🧭' },
      { v: 'departures', label: 'Lịch khởi hành', icon: '📅' },
      { v: 'payboard', label: 'Công nợ tổng', icon: '💰' },
      { v: 'payment', label: 'Quản lý thanh toán', icon: '🧾' },
      { v: 'flights', label: 'Chuyến bay', icon: '✈️' },
      { v: 'dashboard', label: 'Dashboard biên lợi', icon: '📈' },
      { v: 'history', label: 'Lịch sử báo giá', icon: '🕐' },
    ];
    if (hasPerm(me, 'manageContracts') || hasPerm(me, 'viewContracts')) base.push({ v: 'contract', label: 'Hợp đồng', icon: '📜' });
    if (hasPerm(me, 'manageCustomers')) base.push({ v: 'customer', label: 'Khách hàng', icon: '👥' });
    if (hasPerm(me, 'manageNCC')) base.push({ v: 'ncc', label: 'Nhà cung cấp', icon: '🏢' }, { v: 'nccProducts', label: 'Sản phẩm NCC', icon: '📦' });
    if (me && ROLE_RANK[me.role] >= ROLE_RANK['Trưởng Phòng']) base.push({ v: 'audit', label: 'Nhật ký hệ thống', icon: '📋' });
    return base;
  }, [me]);

  const rows = useMemo<Row[]>(() => {
    const recRows = (q.trim()
      ? filterRank(scopedIndex, q, (it) => it.text).slice(0, 40)
      : (() => {
          const recent = readRecent();
          const byKey = new Map(scopedIndex.map((it) => [it.kind + ':' + it.id, it]));
          return recent.map((r) => byKey.get(r.kind + ':' + r.id)).filter((x): x is SItem => !!x).slice(0, 8);
        })()
    ).map<Row>((it) => ({ t: 'rec', it }));
    // Lệnh điều hướng chỉ hiện khi có từ khoá + đang ở scope "Tất cả".
    const navRows: Row[] = (q.trim() && scope === 'all')
      ? filterRank(navCmds, q, (c) => c.label).slice(0, 6).map((nav) => ({ t: 'nav', nav }))
      : [];
    return [...navRows, ...recRows];
  }, [q, scopedIndex, scope, navCmds]);

  useEffect(() => { setActive(0); }, [q, scope]);

  const go = (it: SItem) => {
    const st = useQuoteStore.getState();
    const tmpl = st.draft.template;
    const needLeave = (target: 'view' | 'load' | 'alt') => {
      // 'view' (customer/ncc/contract) chỉ cần confirm khi đang ở template không phải nội địa/nước ngoài.
      if (target === 'view') return tmpl !== 'domestic' && tmpl !== 'intl';
      return true;
    };
    const confirmLeave = () => window.confirm('Mở mục này? Thay đổi chưa lưu ở màn hình hiện tại có thể mất.');

    if (it.kind === 'quoteDom' || it.kind === 'quoteIntl' || it.kind === 'dmc') {
      if (!confirmLeave()) return;
      void st.loadCloud(it.id, { dmc: it.kind === 'dmc' }).then((r) => { if (!r.ok) window.alert('⚠ ' + r.error); });
    } else if (it.kind === 'customer' || it.kind === 'ncc' || it.kind === 'contract') {
      if (needLeave('view')) { if (!confirmLeave()) return; useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'intl', currentQuoteId: null } })); }
      st.setView(it.kind);
    } else if (it.kind === 'tourProfile') {
      // Mở tab "Hồ sơ tour" + focus đúng hồ sơ (TourProfilesView consume lúc mount).
      if (needLeave('view')) { if (!confirmLeave()) return; useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'intl', currentQuoteId: null } })); }
      useTourProfileStore.getState().requestFocus(it.id);
      st.setView('cockpit');
    } else {
      if (!confirmLeave()) return;
      const navKind = it.kind as LinkNavKind; // menu | itinerary | visaProject | visaProc
      useLinkNavStore.getState().request(navKind, it.id);
      const tpl: Template = navKind === 'menu' ? 'menu' : navKind === 'itinerary' ? 'itinerary' : 'visa';
      useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: tpl }, view: 'cost' }));
    }
    pushRecent(it);
    onClose();
  };

  const goNav = (nav: NavCmd) => {
    const st = useQuoteStore.getState();
    if (st.draft.template !== 'domestic' && st.draft.template !== 'intl') {
      if (!window.confirm('Mở mục này? Thay đổi chưa lưu ở màn hình hiện tại có thể mất.')) return;
      useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'intl', currentQuoteId: null } }));
    }
    st.setView(nav.v);
    onClose();
  };
  const goRow = (r: Row) => (r.t === 'nav' ? goNav(r.nav) : go(r.it));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[active]; if (r) goRow(r); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { position: 'fixed', top: 64, m: 0, borderRadius: 3, overflow: 'hidden' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, background: LEGACY.headerGradient }}>
        <Box sx={{ fontSize: 18 }}>🔍</Box>
        <InputBase
          inputRef={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Tìm báo giá, hợp đồng, khách hàng, chương trình, visa… (gõ không dấu cũng được)"
          fullWidth sx={{ color: '#fff', fontSize: 15, '& input::placeholder': { color: 'rgba(255,255,255,0.7)', opacity: 1 } }}
        />
        <Chip size="small" label="Esc" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }} variant="outlined" />
      </Box>

      <Stack direction="row" spacing={0.5} sx={{ px: 1.5, py: 0.75, overflowX: 'auto', borderBottom: '1px solid rgba(15,58,74,0.08)' }}>
        {SCOPES.map((s) => (
          <Chip
            key={s.key} size="small" clickable label={s.label}
            color={scope === s.key ? 'primary' : 'default'}
            variant={scope === s.key ? 'filled' : 'outlined'}
            onClick={() => setScope(s.key)}
            sx={{ fontWeight: 700, flexShrink: 0 }}
          />
        ))}
      </Stack>

      <Box sx={{ maxHeight: 460, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
            {q.trim() ? 'Không tìm thấy kết quả.' : 'Gõ để tìm hoặc nhảy tới màn hình — hoặc xem mục mở gần đây.'}
          </Box>
        ) : (
          <>
            {!q.trim() && <Typography variant="caption" sx={{ px: 2, pt: 1, display: 'block', color: 'text.disabled' }}>GẦN ĐÂY</Typography>}
            {rows.map((r, i) => {
              const on = i === active;
              if (r.t === 'nav') {
                return (
                  <Stack key={`nav-${r.nav.v}`} direction="row" alignItems="center" spacing={1.25}
                    onMouseEnter={() => setActive(i)} onClick={() => goRow(r)}
                    sx={{ px: 2, py: 1, cursor: 'pointer', bgcolor: on ? 'rgba(20,150,140,0.1)' : 'transparent',
                      borderLeft: `3px solid ${on ? LEGACY.teal : 'transparent'}` }}>
                    <Box sx={{ fontSize: 18, width: 24, textAlign: 'center' }}>{r.nav.icon}</Box>
                    <Typography fontSize={14} fontWeight={700} sx={{ flex: 1 }} noWrap>Đi tới: {r.nav.label}</Typography>
                    <Chip size="small" label="Điều hướng" sx={{ bgcolor: 'rgba(20,150,140,0.15)', color: LEGACY.teal, fontWeight: 700, flexShrink: 0 }} />
                  </Stack>
                );
              }
              const it = r.it;
              const m = META[it.kind];
              return (
                <Stack key={it.kind + it.id} direction="row" alignItems="center" spacing={1.25}
                  onMouseEnter={() => setActive(i)} onClick={() => goRow(r)}
                  sx={{ px: 2, py: 1, cursor: 'pointer', bgcolor: on ? 'rgba(20,150,140,0.1)' : 'transparent',
                    borderLeft: `3px solid ${on ? m.color : 'transparent'}` }}>
                  <Box sx={{ fontSize: 18, width: 24, textAlign: 'center' }}>{m.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontSize={14} fontWeight={700} noWrap>{it.title || '(Không tên)'}</Typography>
                    {it.subtitle && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{it.subtitle}</Typography>}
                  </Box>
                  <Chip size="small" label={m.label} sx={{ bgcolor: m.color + '22', color: m.color, fontWeight: 700, flexShrink: 0 }} />
                </Stack>
              );
            })}
          </>
        )}
      </Box>
      <Box sx={{ px: 2, py: 0.75, borderTop: '1px solid rgba(15,58,74,0.08)', display: 'flex', gap: 1.5 }}>
        <Typography variant="caption" color="text.disabled">↑↓ chọn</Typography>
        <Typography variant="caption" color="text.disabled">↵ mở</Typography>
        <Typography variant="caption" color="text.disabled">Esc đóng</Typography>
      </Box>
    </Dialog>
  );
}
