import { useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useMenuStore } from '@/stores/menuStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useContractStore } from '@/stores/contractStore';
import { useLinkNavStore, type LinkNavKind } from '@/stores/linkNavStore';
import { sbSetDMCEntryLink } from '@/lib/supabase';
import { LEGACY } from '@/theme';
import type { Template } from '@/types';

type Opt = { key: string; label: string; sub?: string };

type Props = { open: boolean; onClose: () => void };

export function QuoteLinksModal({ open, onClose }: Props) {
  const qid = useQuoteStore((s) => s.draft.currentQuoteId);
  const qname = useQuoteStore((s) => s.draft.info.name) || '(báo giá chưa đặt tên)';
  const template = useQuoteStore((s) => s.draft.template);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const user = useAuthStore((s) => s.currentUser);

  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const contracts = useContractStore((s) => s.contracts);
  const dmcQuotes = useQuoteHistoryStore((s) => s.dmcQuotes);

  const [busy, setBusy] = useState(false);
  const savedBy = user ? `${user.name} (${user.role})` : '';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { window.alert('❌ ' + (e as Error).message); } finally { setBusy(false); }
  };

  // ── Open (navigate) ──
  const leaveOk = (what: string) =>
    window.confirm(`Rời báo giá hiện tại để mở ${what}? Thay đổi chưa lưu có thể mất.`);
  const openAlt = (kind: LinkNavKind, id: string, what: string) => {
    if (!leaveOk(what)) return;
    useLinkNavStore.getState().request(kind, id);
    const tpl: Template = kind === 'menu' ? 'menu' : kind === 'itinerary' ? 'itinerary' : 'visa';
    useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: tpl }, view: 'cost' }));
    onClose();
  };
  const openDmc = async (id: string, what: string) => {
    if (!leaveOk(what)) return;
    const r = await loadCloud(id, { dmc: true });
    onClose();
    if (!r.ok) window.alert('⚠ ' + r.error);
  };
  const openContract = () => { setView('contract'); onClose(); };

  // ── Link / unlink writers ──
  const linkMenu = (id: string, on: boolean) => run(async () => {
    const full = await useMenuStore.getState().load(id);
    if (full) await useMenuStore.getState().save({ ...full, linkedQuoteId: on ? qid : null, linkedQuoteName: on ? qname : '' }, savedBy);
  });
  const linkItin = (id: string, on: boolean) => run(async () => {
    const full = await useItineraryStore.getState().load(id);
    if (full) await useItineraryStore.getState().save({ ...full, linkedQuoteId: on ? qid : null, linkedQuoteName: on ? qname : '' }, savedBy);
  });
  const linkVisa = (id: string, on: boolean) => run(async () => {
    const p = visaProjects.find((x) => x.id === id);
    if (p) await useVisaProjectStore.getState().save({ ...p, linkedQuoteId: on ? qid : null, linkedQuoteName: on ? qname : '' });
  });
  const linkContract = (id: string, on: boolean) => run(async () => {
    const c = contracts.find((x) => x.id === id);
    if (c) await useContractStore.getState().save({ ...c, linkedQuoteId: on ? qid : null, linkedQuoteName: on ? qname : '' });
  });
  const linkDmc = (cloudId: string, on: boolean) => run(async () => {
    await sbSetDMCEntryLink(cloudId, {
      linkedQuoteId: on ? (qid ?? undefined) : undefined,
      linkedQuoteName: on ? qname : '',
      linkedQuoteTemplate: on ? (template ?? undefined) : undefined,
    });
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, background: LEGACY.headerGradient, color: '#fff' }}>
        <Box sx={{ flex: 1 }}>
          🔗 Liên kết hồ sơ
          <Typography variant="caption" display="block" sx={{ opacity: 0.85 }}>
            Báo giá: <strong>{qname}</strong>
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!qid ? (
          <Alert severity="info">Hãy <strong>lưu báo giá lên cloud</strong> trước, rồi mới liên kết được tới các hồ sơ khác.</Alert>
        ) : (
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Section
              title="🍽️ Thực đơn" busy={busy}
              linked={menus.filter((m) => m.linkedQuoteId === qid).map((m) => ({ key: m.id, label: m.title, sub: m.code }))}
              options={menus.filter((m) => m.linkedQuoteId !== qid).map((m) => ({ key: m.id, label: m.title, sub: m.code }))}
              onAdd={(id) => linkMenu(id, true)} onRemove={(id) => linkMenu(id, false)}
              onOpen={(id, l) => openAlt('menu', id, `thực đơn "${l}"`)}
            />
            <Section
              title="🗺️ Chương trình tour" busy={busy}
              linked={itineraries.filter((m) => m.linkedQuoteId === qid).map((m) => ({ key: m.id, label: m.title, sub: m.code }))}
              options={itineraries.filter((m) => m.linkedQuoteId !== qid).map((m) => ({ key: m.id, label: m.title, sub: m.code }))}
              onAdd={(id) => linkItin(id, true)} onRemove={(id) => linkItin(id, false)}
              onOpen={(id, l) => openAlt('itinerary', id, `chương trình "${l}"`)}
            />
            <Section
              title="🛂 Dự án visa" busy={busy}
              linked={visaProjects.filter((p) => p.linkedQuoteId === qid).map((p) => ({ key: p.id, label: p.name || p.code, sub: p.country }))}
              options={visaProjects.filter((p) => p.linkedQuoteId !== qid).map((p) => ({ key: p.id, label: p.name || p.code, sub: p.country }))}
              onAdd={(id) => linkVisa(id, true)} onRemove={(id) => linkVisa(id, false)}
              onOpen={(id, l) => openAlt('visaProject', id, `dự án visa "${l}"`)}
            />
            <Section
              title="📊 DMC Breakdown" busy={busy}
              linked={dmcQuotes.filter((q) => q.linkedQuoteId === qid).map((q) => ({ key: q.cloudId, label: q.name, sub: q.quoteCode }))}
              options={dmcQuotes.filter((q) => q.linkedQuoteId !== qid && q.cloudId !== qid).map((q) => ({ key: q.cloudId, label: q.name, sub: q.quoteCode }))}
              onAdd={(id) => linkDmc(id, true)} onRemove={(id) => linkDmc(id, false)}
              onOpen={(id, l) => void openDmc(id, `DMC "${l}"`)}
            />
            <Section
              title="📜 Hợp đồng" busy={busy}
              linked={contracts.filter((c) => c.linkedQuoteId === qid).map((c) => ({ key: c.id, label: c.tourName || c.contractNo, sub: c.contractNo }))}
              options={contracts.filter((c) => c.linkedQuoteId !== qid).map((c) => ({ key: c.id, label: c.tourName || c.contractNo, sub: c.contractNo }))}
              onAdd={(id) => linkContract(id, true)} onRemove={(id) => linkContract(id, false)}
              onOpen={() => openContract()}
            />
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title, linked, options, busy, onAdd, onRemove, onOpen,
}: {
  title: string; linked: Opt[]; options: Opt[]; busy: boolean;
  onAdd: (id: string) => void; onRemove: (id: string) => void; onOpen: (id: string, label: string) => void;
}) {
  const [pick, setPick] = useState<Opt | null>(null);
  return (
    <Box>
      <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.75 }}>{title}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>({linked.length})</Typography>
      </Typography>
      <Stack spacing={0.5}>
        {linked.map((o) => (
          <Stack key={o.key} direction="row" alignItems="center" spacing={1}
            sx={{ border: '1px solid rgba(20,150,140,0.25)', borderRadius: 1.5, px: 1.25, py: 0.5, bgcolor: 'rgba(168,230,221,0.12)' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontSize={13.5} fontWeight={600} noWrap>{o.label}</Typography>
              {o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}
            </Box>
            <Tooltip title="Mở">
              <span><IconButton size="small" color="primary" disabled={busy} onClick={() => onOpen(o.key, o.label)}><OpenInNewIcon fontSize="small" /></IconButton></span>
            </Tooltip>
            <Tooltip title="Gỡ liên kết">
              <span><IconButton size="small" color="error" disabled={busy} onClick={() => onRemove(o.key)}><LinkOffIcon fontSize="small" /></IconButton></span>
            </Tooltip>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center">
        <Autocomplete
          size="small" sx={{ flex: 1 }} options={options} value={pick}
          onChange={(_, v) => setPick(v)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.key === b.key}
          renderOption={(props, o) => (
            <li {...props} key={o.key}><Box><Typography variant="body2">{o.label}</Typography>{o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}</Box></li>
          )}
          renderInput={(p) => <TextField {...p} placeholder="Chọn để liên kết…" />}
        />
        <Button variant="outlined" size="small" disabled={busy || !pick}
          onClick={() => { if (pick) { onAdd(pick.key); setPick(null); } }}>
          + Liên kết
        </Button>
      </Stack>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}
