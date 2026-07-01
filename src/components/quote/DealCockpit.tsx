import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { useContractStore } from '@/stores/contractStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useMenuStore } from '@/stores/menuStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { canSeePrices } from '@/auth/quotePerms';
import { VISA_COUNTRIES, VISA_PROC_PRESETS, VISA_STATUS_META, visaPresetKeyForCountry } from '@/components/visa/constants';
import { computeTotals, fmtVND } from './calc';
import { summarizeGuests } from './guestStats';
import { ValueBridgePanel } from './ValueBridgePanel';
import { workflowProgress } from './workflowConstants';
import { QUOTE_STATUS_META } from './constants';
import { CONTRACT_STATUS } from '@/components/contract/constants';
import {
  contractFlags,
  dealStage,
  nextAction,
  canDoAcceptance,
  DEAL_STAGES,
  isBranchStage,
  stageMeta,
  isTerminalStage,
  type DealActionKey,
  type DealInput,
} from './dealStage';
import { LEGACY } from '@/theme';
import type { QuoteViewKey } from '@/stores/quoteStore';

/** Đợt 3 — Deal Cockpit: một màn gom toàn bộ vòng đời một báo giá (hồ sơ tour)
 *  thành đường dây CRM: stepper 7 giai đoạn + nút "Bước kế tiếp" + các thẻ liên
 *  kết tới báo giá / khách / hợp đồng / vận hành / thanh toán / nghiệm thu.
 *  Mọi giai đoạn & cổng chặn lấy từ máy trạng thái thuần `dealStage`. */
export function DealCockpit() {
  const draft = useQuoteStore((s) => s.draft);
  const setView = useQuoteStore((s) => s.setView);
  const setStatus = useQuoteStore((s) => s.setStatus);
  const contracts = useContractStore((s) => s.contracts);
  const customers = useCustomerStore((s) => s.customers);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const currentUser = useAuthStore((s) => s.currentUser);
  const showPrice = canSeePrices(currentUser);
  const savedBy = currentUser ? `${currentUser.name} (${currentUser.role})` : '';

  const cid = draft.currentQuoteId;
  const tpl = draft.template;
  const tpId = draft.tourProfileId;

  const linkedContract = useMemo(
    () => (cid ? contracts.find((c) => c.linkedQuoteId === cid) : undefined),
    [contracts, cid],
  );
  // Khách hàng: HỒ SƠ là nguồn sự thật → ưu tiên khách gắn trên hồ sơ tour, chỉ
  // fallback báo giá khi hồ sơ chưa gắn (để khách vừa sửa hiện đúng, không bị che).
  const profile = useTourProfileStore((s) => (tpId ? s.profiles.find((p) => p.id === tpId) : undefined));
  const customer = useMemo(() => {
    const id = profile?.customerId || draft.customerId;
    return id ? customers.find((c) => c.id === id) : undefined;
  }, [customers, draft.customerId, profile?.customerId]);
  // Liên kết theo HỒ SƠ (đọc kép: ưu tiên tourProfileId, fallback linkedQuoteId của báo giá).
  const ofProfile = <T extends { tourProfileId?: string | null; linkedQuoteId?: string | null }>(x: T) =>
    (!!tpId && x.tourProfileId === tpId) || (!!cid && x.linkedQuoteId === cid);
  // Một báo giá/hồ sơ có thể có NHIỀU bộ hồ sơ visa — mỗi nước một bộ. Đọc kép cho
  // nhất quán với Chương trình/Thực đơn (visa gắn qua tourProfileId vẫn hiện).
  const linkedVisas = useMemo(() => visaProjects.filter(ofProfile), [visaProjects, tpId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const linkedMenus = useMemo(() => menus.filter(ofProfile), [menus, tpId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const linkedItins = useMemo(() => itineraries.filter(ofProfile), [itineraries, tpId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const guests = useMemo(() => summarizeGuests(draft.passengers ?? []), [draft.passengers]);

  const input: DealInput = useMemo(
    () => ({
      status: draft.status,
      workflow: draft.workflow,
      contract: contractFlags(linkedContract),
      departureISO: draft.info.startDate,
    }),
    [draft.status, draft.workflow, linkedContract, draft.info.startDate],
  );

  const stage = dealStage(input);
  const na = nextAction(input);
  const totals = useMemo(() => (tpl ? computeTotals(draft) : null), [draft, tpl]);
  const prog = workflowProgress(draft.workflow ?? []);
  // Hộp thoại chọn quốc gia khi thêm bộ hồ sơ visa (hooks PHẢI ở trước early-return).
  const [visaDlg, setVisaDlg] = useState(false);
  const [visaCountry, setVisaCountry] = useState('');
  const [busy, setBusy] = useState(false);

  // Báo giá DMC / template thay thế: cockpit chỉ áp cho báo giá tiêu chuẩn.
  if (!tpl || tpl === 'dmc' || tpl === 'menu' || tpl === 'itinerary' || tpl === 'visa' || tpl === 'doctranslate') {
    return (
      <Box sx={{ p: 2, maxWidth: 1100, mx: 'auto' }}>
        <Alert severity="info">Bảng điều khiển hồ sơ chỉ áp dụng cho báo giá tiêu chuẩn (nội địa / nước ngoài).</Alert>
      </Box>
    );
  }

  const go = (v: QuoteViewKey) => setView(v);
  const openVisa = (id: string) => {
    if (!window.confirm('Rời báo giá để mở dự án visa? Thay đổi chưa lưu có thể mất.')) return;
    useLinkNavStore.getState().request('visaProject', id);
    useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'visa' }, view: 'cost' }));
  };
  // Deep-link mở Chương trình / Thực đơn đã gắn (rời báo giá, đổi template alt-app).
  const openAlt = (kind: 'menu' | 'itinerary', id: string, label: string) => {
    if (!window.confirm(`Rời báo giá để mở ${label}? Thay đổi chưa lưu có thể mất.`)) return;
    useLinkNavStore.getState().request(kind, id);
    useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: kind }, view: 'cost' }));
  };
  // Gắn / gỡ Chương trình / Thực đơn vào HỒ SƠ tour (theo tourProfileId).
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { window.alert('❌ ' + (e as Error).message); } finally { setBusy(false); }
  };
  const setMenuLink = (id: string, on: boolean) => run(async () => {
    const full = await useMenuStore.getState().load(id);
    if (full) await useMenuStore.getState().save({ ...full, tourProfileId: on ? tpId : null }, savedBy);
  });
  const setItinLink = (id: string, on: boolean) => run(async () => {
    const full = await useItineraryStore.getState().load(id);
    if (full) await useItineraryStore.getState().save({ ...full, tourProfileId: on ? tpId : null }, savedBy);
  });
  const setVisaLink = (id: string, on: boolean) => run(async () => {
    const v = visaProjects.find((x) => x.id === id);
    if (v) await useVisaProjectStore.getState().save({ ...v, tourProfileId: on ? tpId : null });
  });
  const visaOptions = visaProjects.filter((v) => !ofProfile(v));
  // Thêm một bộ hồ sơ visa cho MỘT quốc gia cụ thể (tour nhiều nước → nhiều bộ).
  // Mở hộp thoại chọn quốc gia chuẩn hoá (vẫn gõ nước ngoài danh sách được).
  const openAddVisa = () => {
    if (!cid) { window.alert('Hãy lưu báo giá lên cloud trước khi tạo dự án visa.'); return; }
    setVisaCountry(draft.info.dest ?? '');
    setVisaDlg(true);
  };
  const confirmAddVisa = async () => {
    if (!cid) return;
    setVisaDlg(false);
    const p = await useVisaProjectStore.getState().spawnFromQuote({
      quoteId: cid,
      quoteName: draft.info.name || 'Dự án visa',
      country: visaCountry.trim(),
      departDate: draft.info.startDate ? draft.info.startDate.slice(0, 10) : undefined,
    });
    if (p) openVisa(p.id);
  };
  const presetLabel = VISA_PROC_PRESETS.find((p) => p.key === visaPresetKeyForCountry(visaCountry))?.label;
  const markWon = () => {
    if (window.confirm('Đánh dấu báo giá này là "Thành công" (chốt deal)? Hệ thống sẽ tự tạo bộ việc vận hành.')) {
      setStatus('won');
    }
  };
  const runAction = (action: DealActionKey) => {
    switch (action) {
      case 'send_quote':
        return go('cost');
      case 'mark_won':
        return markWon();
      case 'make_contract':
      case 'sign_contract':
        return go('contract');
      case 'acceptance':
        return go('contract');
      case 'close':
        return go('workflow');
      default:
        return undefined;
    }
  };

  const stageIdx = DEAL_STAGES.findIndex((s) => s.key === stage);
  const isLost = isBranchStage(stage); // Rớt thầu / Huỷ tour — nhánh kết thúc ngoài đường dây

  return (
    <Box sx={{ p: 2, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', borderRadius: 2, p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>Hồ sơ tour</Typography>
          {draft.tourCode && (
            <Chip size="small" label={draft.tourCode} sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 800, fontSize: 11 }} />
          )}
        </Stack>
        <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2 }}>
          {draft.info.name || '(báo giá chưa đặt tên)'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          {draft.info.dest && <Chip size="small" label={draft.info.dest} sx={chipOnTeal} />}
          <Chip size="small" label={`${draft.pax} khách`} sx={chipOnTeal} />
          {draft.info.startDate && (
            <Chip size="small" label={`Khởi hành ${draft.info.startDate.slice(0, 10)}`} sx={chipOnTeal} />
          )}
          {totals && showPrice && <Chip size="small" label={fmtVND(totals.grandTotal)} sx={chipOnTeal} />}
        </Stack>
      </Box>

      {!cid && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Báo giá chưa lưu lên cloud — hãy lưu trước để liên kết hợp đồng & theo dõi cả đường dây.
        </Alert>
      )}

      {/* Stepper 7 giai đoạn */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {DEAL_STAGES.map((s, i) => {
            const done = !isLost && i < stageIdx;
            const current = !isLost && i === stageIdx;
            return (
              <Box
                key={s.key}
                sx={{
                  flex: '1 0 auto',
                  minWidth: 92,
                  textAlign: 'center',
                  px: 1,
                  py: 0.75,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: current ? s.color : done ? 'rgba(13,122,106,0.3)' : 'divider',
                  bgcolor: current ? `${s.color}1a` : done ? 'rgba(13,122,106,0.06)' : 'transparent',
                  opacity: !isLost && i > stageIdx ? 0.5 : 1,
                }}
              >
                <Typography
                  fontSize={12.5}
                  fontWeight={current ? 800 : 600}
                  sx={{ color: current ? s.color : done ? 'rgba(13,122,106,0.9)' : 'text.secondary', whiteSpace: 'nowrap' }}
                >
                  {s.label}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* CTA bước kế tiếp / nhánh thua */}
      {isLost ? (
        <Alert severity={stage === 'cancelled' ? 'warning' : 'error'} icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          Hồ sơ đã kết thúc — <strong>{stageMeta(stage).label}</strong>
          {draft.lossReason ? `: ${draft.lossReason}` : ''}.
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'rgba(13,122,106,0.4)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">Bước kế tiếp</Typography>
              <Typography fontWeight={800} fontSize={16}>{na.label}</Typography>
              {!na.gate.ok && na.gate.reason && (
                <Typography variant="caption" sx={{ color: 'warning.main', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                  <WarningAmberIcon sx={{ fontSize: 15 }} /> {na.gate.reason}
                </Typography>
              )}
            </Box>
            {!isTerminalStage(stage) && (
              <Button
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                onClick={() => runAction(na.action)}
                sx={{ background: LEGACY.headerGradient }}
              >
                {na.label}
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {/* #1 — Cầu nối biên 3 mốc giá trị (chỉ người được xem giá) */}
      {showPrice && (
        <ValueBridgePanel
          tourProfileId={tpId}
          currentQuoteId={cid ?? undefined}
          contractFallbackRevenue={linkedContract ? (linkedContract.contractPax || 0) * (linkedContract.pricePerPax || 0) : undefined}
        />
      )}

      {/* Lưới các thẻ liên kết */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        <CockpitCard title="📝 Báo giá" onOpen={() => go('cost')}>
          <Chip
            size="small"
            label={QUOTE_STATUS_META[draft.status ?? 'in_progress'].label}
            sx={{ bgcolor: `${QUOTE_STATUS_META[draft.status ?? 'in_progress'].color}1a`, color: QUOTE_STATUS_META[draft.status ?? 'in_progress'].color, fontWeight: 700 }}
          />
          {totals && showPrice && <Line label="Giá trị" value={fmtVND(totals.grandTotal)} />}
          {totals && showPrice && <Line label="Giá/khách" value={fmtVND(totals.roundedPPax)} />}
        </CockpitCard>

        <CockpitCard title="👤 Khách hàng" onOpen={() => go('customer')}>
          {customer ? (
            <>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography fontWeight={700} fontSize={14} noWrap sx={{ flex: 1, minWidth: 0 }}>{customer.name}</Typography>
                <Chip size="small" label="🔗 Hồ sơ KH" sx={{ height: 18, fontSize: 10.5, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a', fontWeight: 700 }} />
              </Stack>
              {customer.contacts?.[0] && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {customer.contacts[0].name} · {customer.contacts[0].phone}
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {profile?.customerName || draft.customerName || 'Chưa gắn khách hàng'}
            </Typography>
          )}
        </CockpitCard>

        <CockpitCard title="📜 Hợp đồng" onOpen={() => go('contract')}>
          {linkedContract ? (
            <>
              <Chip
                size="small"
                label={CONTRACT_STATUS[linkedContract.contractStatus].label}
                sx={{ bgcolor: CONTRACT_STATUS[linkedContract.contractStatus].bg, color: CONTRACT_STATUS[linkedContract.contractStatus].color, fontWeight: 700 }}
              />
              <Line label="Số HĐ" value={linkedContract.contractNo || '(chưa đánh số)'} />
            </>
          ) : (
            <Stack spacing={0.75} alignItems="flex-start">
              <Typography variant="body2" color="text.secondary">Chưa có hợp đồng liên kết.</Typography>
              <Button size="small" variant="outlined" onClick={() => go('contract')}>Lập hợp đồng</Button>
            </Stack>
          )}
        </CockpitCard>

        <CockpitCard title="🚦 Vận hành" onOpen={() => go('workflow')}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flex: 1 }}><LinearProgress variant="determinate" value={prog.pct} sx={{ height: 8, borderRadius: 4 }} /></Box>
            <Typography variant="caption" fontWeight={700}>{prog.pct}%</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">{prog.done}/{prog.total} bước hoàn tất</Typography>
        </CockpitCard>

        <CockpitLinkCard
          title="🗺️ Chương trình tour"
          linked={linkedItins.map((i) => ({ id: i.id, label: i.title || i.code, sub: i.code }))}
          options={itineraries.filter((i) => !linkedItins.includes(i)).map((i) => ({ id: i.id, label: i.title || i.code, sub: i.code }))}
          canAttach={!!tpId}
          busy={busy}
          onOpen={(id, label) => openAlt('itinerary', id, `chương trình "${label}"`)}
          onAttach={(id) => setItinLink(id, true)}
          onDetach={(id) => setItinLink(id, false)}
        />

        <CockpitLinkCard
          title="🍽️ Thực đơn"
          linked={linkedMenus.map((m) => ({ id: m.id, label: m.title || m.code, sub: m.code }))}
          options={menus.filter((m) => !linkedMenus.includes(m)).map((m) => ({ id: m.id, label: m.title || m.code, sub: m.code }))}
          canAttach={!!tpId}
          busy={busy}
          onOpen={(id, label) => openAlt('menu', id, `thực đơn "${label}"`)}
          onAttach={(id) => setMenuLink(id, true)}
          onDetach={(id) => setMenuLink(id, false)}
        />

        <CockpitCard title="👥 Khách đoàn" onOpen={() => go('passengers')}>
          {guests.total > 0 ? (
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${guests.total} khách`} sx={{ height: 20, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a', fontWeight: 700 }} />
                <Chip size="small" label={`${guests.male} nam · ${guests.female} nữ`} variant="outlined" sx={{ height: 20 }} />
                <Chip size="small" label={`${guests.totalRooms} phòng`} variant="outlined" sx={{ height: 20 }} />
              </Stack>
              {draft.pax > 0 && guests.total !== draft.pax && (
                <Typography variant="caption" sx={{ color: 'warning.main' }}>
                  ⚠ Danh sách {guests.total} ≠ {draft.pax} khách báo giá
                </Typography>
              )}
              {guests.unassigned > 0 && (
                <Typography variant="caption" color="text.secondary">{guests.unassigned} khách chưa xếp phòng</Typography>
              )}
            </Stack>
          ) : (
            <Stack spacing={0.75} alignItems="flex-start">
              <Typography variant="body2" color="text.secondary">Chưa có danh sách khách đoàn.</Typography>
              <Button size="small" variant="outlined" onClick={() => go('passengers')}>Lập danh sách khách</Button>
            </Stack>
          )}
        </CockpitCard>

        <CockpitCard title="💳 Thanh toán" onOpen={() => go('payment')}>
          <Typography variant="body2" color="text.secondary">
            {draft.payments?.length ? `${draft.payments.length} đợt thanh toán` : 'Chưa thiết lập đợt thanh toán'}
          </Typography>
        </CockpitCard>

        <CockpitCard title="✅ Nghiệm thu" onOpen={() => go('contract')}>
          {linkedContract?.hasAcceptance ? (
            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 700 }}>
              Đã nghiệm thu{linkedContract.acceptanceDate ? ` · ${linkedContract.acceptanceDate}` : ''}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {canDoAcceptance(input).ok ? 'Sẵn sàng nghiệm thu' : canDoAcceptance(input).reason}
            </Typography>
          )}
        </CockpitCard>

        {tpl === 'intl' && (
          <CockpitCard title="🛂 Visa đoàn" onOpen={() => go('tourvisa')}>
            {linkedVisas.length > 0 ? (
              <Stack spacing={0.75}>
                {linkedVisas.map((v) => {
                  const apply = v.applyCount || (v.applicants?.length ?? 0);
                  // Chỉ cho Gỡ bộ visa gắn TRỰC TIẾP vào hồ sơ (không phải bộ sinh từ chính báo giá này).
                  const detachable = !!tpId && v.tourProfileId === tpId && v.linkedQuoteId !== cid;
                  return (
                    <Stack key={v.id} direction="row" alignItems="center" spacing={0.75}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontSize={12.5} fontWeight={700} noWrap>{v.country || '(chưa rõ nước)'}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip
                            size="small"
                            label={VISA_STATUS_META[v.status].label}
                            sx={{ height: 18, fontSize: 11, bgcolor: `${VISA_STATUS_META[v.status].color}1a`, color: VISA_STATUS_META[v.status].color, fontWeight: 700 }}
                          />
                          {apply > 0 && <Typography variant="caption" color="text.secondary">{v.passedCount + v.haveVisaCount}/{apply} đậu</Typography>}
                        </Stack>
                      </Box>
                      <Button size="small" sx={{ minWidth: 0 }} onClick={() => openVisa(v.id)}>Mở</Button>
                      {detachable && <Button size="small" color="error" sx={{ minWidth: 0 }} disabled={busy} onClick={() => setVisaLink(v.id, false)}>Gỡ</Button>}
                    </Stack>
                  );
                })}
                <Button size="small" variant="outlined" onClick={openAddVisa}>＋ Thêm nước</Button>
                {tpId && visaOptions.length > 0 && (
                  <AttachControl options={visaOptions.map((v) => ({ id: v.id, label: v.name || v.code, sub: v.country }))} busy={busy} onAttach={(id) => setVisaLink(id, true)} placeholder="Gắn dự án visa có sẵn…" />
                )}
              </Stack>
            ) : (
              <Stack spacing={0.75} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">Chưa có bộ hồ sơ visa.</Typography>
                <Button size="small" variant="outlined" onClick={openAddVisa}>Tạo dự án visa</Button>
                {tpId && visaOptions.length > 0 && (
                  <AttachControl options={visaOptions.map((v) => ({ id: v.id, label: v.name || v.code, sub: v.country }))} busy={busy} onAttach={(id) => setVisaLink(id, true)} placeholder="Gắn dự án visa có sẵn…" />
                )}
              </Stack>
            )}
          </CockpitCard>
        )}
      </Box>

      {/* Hộp thoại chọn quốc gia khi thêm một bộ hồ sơ visa */}
      <Dialog open={visaDlg} onClose={() => setVisaDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Thêm bộ hồ sơ visa</DialogTitle>
        <DialogContent>
          <Autocomplete
            freeSolo
            options={VISA_COUNTRIES as readonly string[]}
            value={visaCountry}
            onInputChange={(_, v) => setVisaCountry(v)}
            renderInput={(p) => <TextField {...p} autoFocus label="Quốc gia xin visa" placeholder="Chọn hoặc nhập nước…" sx={{ mt: 1 }} />}
          />
          {visaCountry.trim() && presetLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Mẫu thủ tục sẽ áp: <strong>{presetLabel}</strong>
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVisaDlg(false)}>Huỷ</Button>
          <Button variant="contained" disabled={!visaCountry.trim()} onClick={() => void confirmAddVisa()} sx={{ background: LEGACY.headerGradient }}>
            Tạo bộ hồ sơ
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const chipOnTeal = { bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600 } as const;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={700}>{value}</Typography>
    </Stack>
  );
}

function CockpitCard({ title, onOpen, children }: { title: string; onOpen?: () => void; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 0.75 }}>
        <Typography fontWeight={800} fontSize={13.5} sx={{ flex: 1 }}>{title}</Typography>
        {onOpen && <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />} onClick={onOpen} sx={{ minWidth: 0 }}>Mở</Button>}
      </Stack>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Paper>
  );
}

type CockpitLinkItem = { id: string; label: string; sub?: string };

/** Thẻ liên kết vận hành: liệt kê mục đã gắn (mở/gỡ) + ô chọn để GẮN trực tiếp
 *  vào hồ sơ tour ngay tại Bảng điều hành. Dùng cho Chương trình & Thực đơn. */
function CockpitLinkCard({ title, linked, options, canAttach, busy, onOpen, onAttach, onDetach }: {
  title: string;
  linked: CockpitLinkItem[];
  options: CockpitLinkItem[];
  canAttach: boolean;
  busy: boolean;
  onOpen: (id: string, label: string) => void;
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
}) {
  return (
    <CockpitCard title={title}>
      <Stack spacing={0.5} sx={{ mb: linked.length ? 0.75 : 0 }}>
        {linked.map((o) => (
          <Stack key={o.id} direction="row" alignItems="center" spacing={0.5}
            sx={{ border: '1px solid rgba(13,122,106,0.25)', borderRadius: 1.5, px: 1, py: 0.25, bgcolor: 'rgba(13,122,106,0.06)' }}>
            <Typography fontSize={12.5} fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>{o.label}</Typography>
            <Button size="small" sx={{ minWidth: 0 }} disabled={busy} onClick={() => onOpen(o.id, o.label)}>Mở</Button>
            <Button size="small" color="error" sx={{ minWidth: 0 }} disabled={busy} onClick={() => onDetach(o.id)}>Gỡ</Button>
          </Stack>
        ))}
        {!linked.length && <Typography variant="body2" color="text.secondary">Chưa gắn.</Typography>}
      </Stack>
      {canAttach ? (
        <AttachControl options={options} busy={busy} onAttach={onAttach} placeholder="Chọn để gắn…" />
      ) : (
        <Typography variant="caption" color="text.secondary">Lưu báo giá lên cloud để gắn liên kết.</Typography>
      )}
    </CockpitCard>
  );
}

/** Ô chọn + nút "+ Gắn" tái dùng (giữ state lựa chọn riêng). */
function AttachControl({ options, busy, onAttach, placeholder }: {
  options: CockpitLinkItem[];
  busy: boolean;
  onAttach: (id: string) => void;
  placeholder: string;
}) {
  const [pick, setPick] = useState<CockpitLinkItem | null>(null);
  return (
    <Stack direction="row" spacing={0.5}>
      <Autocomplete
        size="small" sx={{ flex: 1 }} options={options} value={pick}
        onChange={(_, v) => setPick(v)}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={(props, o) => (<li {...props} key={o.id}><Box><Typography variant="body2">{o.label}</Typography>{o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}</Box></li>)}
        renderInput={(pr) => <TextField {...pr} placeholder={placeholder} />}
      />
      <Button size="small" variant="outlined" disabled={busy || !pick} onClick={() => { if (pick) { onAttach(pick.id); setPick(null); } }}>+ Gắn</Button>
    </Stack>
  );
}
