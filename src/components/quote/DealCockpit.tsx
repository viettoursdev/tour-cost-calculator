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
import { useLinkNavStore } from '@/stores/linkNavStore';
import { canSeePrices } from '@/auth/quotePerms';
import { VISA_COUNTRIES, VISA_PROC_PRESETS, VISA_STATUS_META, visaPresetKeyForCountry } from '@/components/visa/constants';
import { computeTotals, fmtVND } from './calc';
import { workflowProgress } from './workflowConstants';
import { QUOTE_STATUS_META } from './constants';
import { CONTRACT_STATUS } from '@/components/contract/constants';
import {
  contractFlags,
  dealStage,
  nextAction,
  canDoAcceptance,
  DEAL_STAGES,
  DEAL_STAGE_LOST,
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
  const showPrice = canSeePrices(useAuthStore((s) => s.currentUser));

  const cid = draft.currentQuoteId;
  const tpl = draft.template;

  const linkedContract = useMemo(
    () => (cid ? contracts.find((c) => c.linkedQuoteId === cid) : undefined),
    [contracts, cid],
  );
  const customer = useMemo(
    () => (draft.customerId ? customers.find((c) => c.id === draft.customerId) : undefined),
    [customers, draft.customerId],
  );
  // Một báo giá có thể có NHIỀU bộ hồ sơ visa — mỗi nước một bộ.
  const linkedVisas = useMemo(
    () => (cid ? visaProjects.filter((p) => p.linkedQuoteId === cid) : []),
    [visaProjects, cid],
  );

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
  // Thêm một bộ hồ sơ visa cho MỘT quốc gia cụ thể (tour nhiều nước → nhiều bộ).
  // Mở hộp thoại chọn quốc gia chuẩn hoá (vẫn gõ nước ngoài danh sách được).
  const [visaDlg, setVisaDlg] = useState(false);
  const [visaCountry, setVisaCountry] = useState('');
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
  const isLost = stage === 'lost';

  return (
    <Box sx={{ p: 2, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', borderRadius: 2, p: 2, mb: 2 }}>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>Hồ sơ tour</Typography>
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
        <Alert severity="error" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          Hồ sơ đã kết thúc — <strong>{DEAL_STAGE_LOST.label}</strong>
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
              <Typography fontWeight={700} fontSize={14} noWrap>{customer.name}</Typography>
              {customer.contacts?.[0] && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {customer.contacts[0].name} · {customer.contacts[0].phone}
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">{draft.customerName || 'Chưa gắn khách hàng'}</Typography>
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

        <CockpitCard title="🗂️ Vận hành" onOpen={() => go('workflow')}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flex: 1 }}><LinearProgress variant="determinate" value={prog.pct} sx={{ height: 8, borderRadius: 4 }} /></Box>
            <Typography variant="caption" fontWeight={700}>{prog.pct}%</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">{prog.done}/{prog.total} bước hoàn tất</Typography>
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
          <CockpitCard title="🛂 Visa">
            {linkedVisas.length > 0 ? (
              <Stack spacing={0.75}>
                {linkedVisas.map((v) => {
                  const apply = v.applyCount || (v.applicants?.length ?? 0);
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
                    </Stack>
                  );
                })}
                <Button size="small" variant="outlined" onClick={openAddVisa}>＋ Thêm nước</Button>
              </Stack>
            ) : (
              <Stack spacing={0.75} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">Chưa có bộ hồ sơ visa.</Typography>
                <Button size="small" variant="outlined" onClick={openAddVisa}>Tạo dự án visa</Button>
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
