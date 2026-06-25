import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, LinearProgress, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import { sbSetQuoteSettlementSummary } from '@/lib/supabase';
import { useQuoteStore } from '@/stores/quoteStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { useInventoryStore, inventoryCostForTour } from '@/stores/inventoryStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { getCATS } from './constants';
import { fmtVND } from './calc';
import { computeSettlement, slugifyTourKey, type SettlementResult } from './paymentUtils';
import type { SettlementSnapshot } from '@/types';

const fmtPct = (n: number): string => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`;
const fmtDelta = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtVND(Math.abs(n))}`;
const groupVN = (n: number): string => (n ? Math.round(n).toLocaleString('vi-VN') : '');
const parseAmount = (s: string): number => Number(s.replace(/\D/g, '')) || 0;

/** Số hiển thị: khi đã CHỐT thì lấy snapshot đông cứng, ngược lại lấy số live. */
type DispResult = SettlementResult;
function pickDisplay(live: SettlementResult, frozen?: SettlementSnapshot): DispResult {
  if (!frozen) return live;
  return {
    ...live,
    budgetCost: frozen.budgetCost,
    actualCost: frozen.actualCost,
    paidCost: frozen.paidCost,
    netRevenue: frozen.netRevenue,
    actualRevenue: frozen.actualRevenue,
    revenueOverridden: Math.round(frozen.actualRevenue) !== Math.round(frozen.netRevenue),
    plannedProfit: frozen.plannedProfit,
    actualProfit: frozen.actualProfit,
    plannedMarginPct: frozen.plannedMarginPct,
    actualMarginPct: frozen.actualMarginPct,
    costVariance: frozen.actualCost - frozen.budgetCost,
  };
}

export function SettlementView() {
  const draft = useQuoteStore((s) => s.draft);
  const tourName = draft.info.name ?? '';
  const tourKey = slugifyTourKey(tourName);
  const template = draft.template;
  const cloudId = draft.currentQuoteId;

  const slot = usePaymentStore((s) => s.slots[tourKey]);
  const payments = useMemo(() => slot?.data.payments ?? {}, [slot]);
  const customItems = useMemo(() => slot?.data.customItems ?? [], [slot]);
  const settlement = slot?.data.settlement;

  const currentUser = useAuthStore((s) => s.currentUser);
  const canLock = hasPerm(currentUser, 'exportQuote');

  // Chi phí kho/vật tư đã cấp cho tour này (giá vốn FIFO từ module Quản lý kho).
  const invMovements = useInventoryStore((s) => s.movements);
  const invCost = useMemo(
    () => inventoryCostForTour(invMovements, { tourProfileId: draft.tourProfileId, tourCode: draft.tourCode }),
    [invMovements, draft.tourProfileId, draft.tourCode],
  );
  const INV_KEY = 'inv_auto_kho';
  const invInSettlement = customItems.find((c) => c.key === INV_KEY)?.amount ?? 0;
  const syncInvCost = () => {
    const others = customItems.filter((c) => c.key !== INV_KEY);
    const next = invCost > 0
      ? [...others, { key: INV_KEY, catId: 'logistics' as const, catLabel: 'Logistics & Sản xuất', catIcon: '📦', catColor: '#e67e22', name: 'Vật tư kho cấp cho tour', amount: Math.round(invCost) }]
      : others;
    usePaymentStore.getState().setCustomItems(tourKey, next);
  };

  useEffect(() => {
    if (!tourName.trim()) return;
    usePaymentStore.getState().ensureSubscribed(tourKey);
    return () => { usePaymentStore.getState().releaseSubscription(tourKey); };
  }, [tourKey, tourName]);

  const activeCats = useMemo(() => (template ? getCATS(template) : []), [template]);

  const live = useMemo(
    () => computeSettlement(draft, activeCats, payments, customItems, { actualRevenue: settlement?.actualRevenue }),
    [draft, activeCats, payments, customItems, settlement?.actualRevenue],
  );
  const locked = !!settlement?.lockedAt;
  const s = useMemo(() => pickDisplay(live, locked ? settlement?.frozen : undefined), [live, locked, settlement?.frozen]);

  // Index biên lợi thật lên bảng điều hành (debounce; chỉ khi đã lưu cloud & đổi số).
  const idxKey = cloudId
    ? `${Math.round(s.budgetCost)}|${Math.round(s.actualCost)}|${Math.round(s.actualProfit)}|${s.actualMarginPct.toFixed(1)}|${locked ? 1 : 0}`
    : '';
  useEffect(() => {
    if (!cloudId || !idxKey) return;
    const t = window.setTimeout(() => {
      void sbSetQuoteSettlementSummary(cloudId, {
        budgetCost: Math.round(s.budgetCost),
        actualCost: Math.round(s.actualCost),
        actualProfit: Math.round(s.actualProfit),
        actualMarginPct: +s.actualMarginPct.toFixed(1),
        plannedMarginPct: +s.plannedMarginPct.toFixed(1),
        locked,
      }).catch(() => { /* index không chặn UI */ });
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudId, idxKey]);

  const [revEditing, setRevEditing] = useState(false);
  const [revText, setRevText] = useState('');

  if (!tourName.trim()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Đặt tên tour ở mục Thông tin trước khi quyết toán.</Alert>
      </Box>
    );
  }

  const overrun = s.costVariance > 0;
  const marginColor = s.actualMarginPct < 0 ? '#dc3250' : s.actualMarginPct < s.plannedMarginPct ? '#e67e22' : '#27ae60';
  const paidPct = s.actualCost > 0 ? Math.round((s.paidCost / s.actualCost) * 100) : 0;
  const per = (n: number): string => (s.pax > 0 ? `${fmtVND(n / s.pax)}/khách` : '');

  const setRevenue = (v: number) => {
    usePaymentStore.getState().setSettlement(tourKey, { ...settlement, actualRevenue: v > 0 ? v : undefined });
  };
  const doLock = () => {
    if (!window.confirm('Chốt quyết toán? Số liệu sẽ được đông cứng làm căn cứ. Có thể mở khoá lại sau.')) return;
    const frozen: SettlementSnapshot = {
      budgetCost: live.budgetCost, actualCost: live.actualCost, paidCost: live.paidCost,
      netRevenue: live.netRevenue, actualRevenue: live.actualRevenue,
      plannedProfit: live.plannedProfit, actualProfit: live.actualProfit,
      plannedMarginPct: live.plannedMarginPct, actualMarginPct: live.actualMarginPct,
    };
    usePaymentStore.getState().setSettlement(tourKey, {
      actualRevenue: settlement?.actualRevenue,
      lockedAt: new Date().toISOString(),
      lockedBy: currentUser?.name ?? 'unknown',
      frozen,
    });
  };
  const doUnlock = () => {
    if (!window.confirm('Mở khoá quyết toán? Số liệu sẽ tính lại theo dữ liệu hiện tại.')) return;
    usePaymentStore.getState().setSettlement(tourKey, { actualRevenue: settlement?.actualRevenue });
  };
  const exportFile = async (kind: 'pdf' | 'excel') => {
    const arg = { info: draft.info, s, lockedAt: settlement?.lockedAt, lockedBy: settlement?.lockedBy, savedBy: currentUser?.name ?? '' };
    if (kind === 'pdf') (await import('@/lib/exports/exportSettlementPDF')).exportSettlementPDF(arg);
    else await (await import('@/lib/exports/exportSettlementExcel')).exportSettlementExcel(arg);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      {/* A. Hero */}
      <Paper elevation={0} sx={{ background: 'linear-gradient(135deg, #0f1c2d, #16314a)', color: '#fff', p: 3, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap rowGap={1}>
          <Box>
            <Typography variant="h6" fontWeight={800}>🧾 Quyết toán tour — dự toán vs thực chi</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              {tourName} · {s.pax} khách · Doanh thu thuần {fmtVND(s.actualRevenue)}{s.revenueOverridden ? ' (thực)' : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Biên lợi nhuận thật</Typography>
            <Typography variant="h4" fontWeight={900} sx={{ color: marginColor, lineHeight: 1.1 }}>{fmtPct(s.actualMarginPct)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>dự kiến {fmtPct(s.plannedMarginPct)}</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Toolbar: chốt/khoá + xuất */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
        {locked ? (
          <Chip
            icon={<LockOutlinedIcon />}
            color="success"
            label={`Đã chốt ${settlement?.lockedAt ? new Date(settlement.lockedAt).toLocaleDateString('vi-VN') : ''}${settlement?.lockedBy ? ` · ${settlement.lockedBy}` : ''}`}
            sx={{ fontWeight: 700 }}
          />
        ) : (
          <Chip label="Chưa chốt" variant="outlined" sx={{ fontWeight: 700 }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<TableChartIcon />} onClick={() => void exportFile('excel')}>Excel</Button>
        <Button size="small" variant="outlined" color="error" startIcon={<PictureAsPdfIcon />} onClick={() => void exportFile('pdf')}>PDF</Button>
        {canLock && (locked ? (
          <Button size="small" variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={doUnlock}>Mở khoá</Button>
        ) : (
          <Button size="small" variant="contained" color="primary" startIcon={<LockOutlinedIcon />} onClick={doLock}>Chốt quyết toán</Button>
        ))}
      </Stack>

      {locked && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Số liệu đã đông cứng tại thời điểm chốt. Mở khoá để tính lại theo dữ liệu hiện tại.
        </Alert>
      )}

      {/* B. KPI */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, mb: 3 }}>
        <KpiCard from="#3498db" to="#2980b9" label="Giá vốn dự toán" value={fmtVND(s.budgetCost)} sub={per(s.budgetCost)} />
        <KpiCard from="#9b59b6" to="#8e44ad" label="Chi thực tế (đã chốt)" value={fmtVND(s.actualCost)} sub={per(s.actualCost)} />
        <KpiCard
          from={overrun ? '#dc3250' : '#27ae60'} to={overrun ? '#c0392b' : '#1e9e5a'}
          label={overrun ? 'Bội chi giá vốn' : 'Tiết kiệm giá vốn'}
          value={fmtDelta(s.costVariance)}
          sub={s.budgetCost > 0 ? `${fmtPct((s.costVariance / s.budgetCost) * 100)} so dự toán` : ''}
        />
        <KpiCard from="#0d7a6a" to="#14a08c" label="Lãi gộp thật" value={fmtVND(s.actualProfit)} sub={`dự kiến ${fmtVND(s.plannedProfit)}`} />
      </Box>

      {/* Doanh thu thực (override) */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ flex: 1, minWidth: 200 }}>
            💵 Doanh thu thuần thực {s.revenueOverridden ? '' : '(đang dùng giá báo giá)'}
          </Typography>
          {revEditing && !locked ? (
            <>
              <TextField
                autoFocus size="small" placeholder="Nhập doanh thu thuần thực (₫)"
                value={revText}
                onChange={(e) => setRevText(String(parseAmount(e.target.value)))}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                sx={{ width: 220, '& input': { textAlign: 'right', fontWeight: 700 } }}
                InputProps={{ startAdornment: <Typography variant="caption" sx={{ mr: 0.5 }}>₫</Typography> }}
              />
              <Typography variant="body2" sx={{ minWidth: 0 }}>{groupVN(parseAmount(revText))}</Typography>
              <Button size="small" variant="contained" onClick={() => { setRevenue(parseAmount(revText)); setRevEditing(false); }}>Lưu</Button>
              <Button size="small" onClick={() => setRevEditing(false)}>Huỷ</Button>
            </>
          ) : (
            <>
              <Typography fontWeight={800}>{fmtVND(s.actualRevenue)}</Typography>
              {!locked && (
                <Button size="small" variant="outlined" onClick={() => { setRevText(settlement?.actualRevenue ? String(settlement.actualRevenue) : ''); setRevEditing(true); }}>
                  {s.revenueOverridden ? 'Sửa' : 'Nhập doanh thu thực'}
                </Button>
              )}
              {s.revenueOverridden && !locked && (
                <Button size="small" color="inherit" onClick={() => setRevenue(0)}>Về giá báo giá</Button>
              )}
            </>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Mặc định = giá bán cả đoàn − VAT ({fmtVND(s.netRevenue)}). Nhập số thực (giá trị hợp đồng / tiền thu khách, chưa gồm VAT) để ra biên lợi chính xác.
        </Typography>
      </Paper>

      {/* C. Tiến độ thực chi */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} color="primary">💸 Đã thực chi tiền</Typography>
          <Typography variant="body2" fontWeight={700}>{fmtVND(s.paidCost)} / {fmtVND(s.actualCost)} ({paidPct}%)</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100, paidPct)} sx={{ height: 10, borderRadius: 5, '& .MuiLinearProgress-bar': { borderRadius: 5 } }} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
          Còn phải chi {fmtVND(Math.max(0, s.actualCost - s.paidCost))} cho nhà cung cấp.
        </Typography>
      </Paper>

      {/* C'. Chi phí kho/vật tư cấp cho tour (từ module Quản lý kho) */}
      {(invCost > 0 || invInSettlement > 0) && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3, borderLeft: '4px solid #e67e22' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#e67e22' }}>📦 Chi phí kho/vật tư cấp cho tour</Typography>
              <Typography variant="caption" color="text.secondary">
                Giá vốn FIFO hàng đã xuất gắn tour này: <b>{fmtVND(invCost)}</b>
                {invInSettlement > 0 && Math.round(invInSettlement) !== Math.round(invCost) && ` · đang tính trong thực chi: ${fmtVND(invInSettlement)}`}
              </Typography>
            </Box>
            {canLock && (
              invInSettlement > 0 && Math.round(invInSettlement) === Math.round(invCost)
                ? <Chip label="✓ Đã vào thực chi" sx={{ fontWeight: 700, bgcolor: 'rgba(39,174,96,0.15)', color: '#27ae60' }} />
                : <Button size="small" variant="contained" sx={{ bgcolor: '#e67e22' }} onClick={syncInvCost}>
                    {invInSettlement > 0 ? 'Cập nhật thực chi' : '➕ Đưa vào thực chi'}
                  </Button>
            )}
          </Stack>
        </Paper>
      )}

      {/* D. Đối chiếu hạng mục */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>📊 Đối chiếu giá vốn từng hạng mục</Typography>
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '1.6fr 1fr 1fr 1.1fr 1fr', gap: 1, px: 1.5, mb: 1 }}>
          <HeadCell>Hạng mục</HeadCell>
          <HeadCell align="right">Dự toán</HeadCell>
          <HeadCell align="right">Thực chi</HeadCell>
          <HeadCell align="right">Chênh lệch</HeadCell>
          <HeadCell align="right">Đã trả</HeadCell>
        </Box>
        <Stack spacing={0.75}>
          {live.byCat.map((c) => {
            const isOverrun = c.delta > 0;
            const isSaving = c.delta < 0;
            const unbudgeted = c.budget === 0 && c.actual > 0;
            return (
              <Box key={c.catId} sx={{
                display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 1fr 1.1fr 1fr' },
                gap: 1, alignItems: 'center', px: 1.5, py: 1, borderRadius: 1.5,
                bgcolor: `${c.color}0d`, border: `1px solid ${c.color}33`,
              }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                  <Box sx={{ fontSize: 18 }}>{c.icon}</Box>
                  <Typography fontWeight={700} fontSize={14} noWrap>{c.label}</Typography>
                  {unbudgeted && (
                    <Tooltip title="Phát sinh ngoài dự toán">
                      <Chip label="Phát sinh" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: 'rgba(245,166,35,0.15)', color: '#d18a13' }} />
                    </Tooltip>
                  )}
                </Stack>
                <Cell label="Dự toán" align="right">{fmtVND(c.budget)}</Cell>
                <Cell label="Thực chi" align="right" bold>{fmtVND(c.actual)}</Cell>
                <Cell label="Chênh lệch" align="right" color={isOverrun ? '#dc3250' : isSaving ? '#27ae60' : 'text.disabled'} bold>
                  {c.delta === 0 ? '—' : fmtDelta(c.delta)}
                </Cell>
                <Cell label="Đã trả" align="right" color="text.secondary">{fmtVND(c.paid)}</Cell>
              </Box>
            );
          })}
          {live.byCat.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Chưa có dữ liệu chi phí. Nhập báo giá và theo dõi thanh toán để quyết toán.
            </Typography>
          )}
        </Stack>
        {live.byCat.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 1fr 1.1fr 1fr' }, gap: 1, alignItems: 'center', px: 1.5 }}>
              <Typography fontWeight={900} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>Tổng giá vốn</Typography>
              <Cell label="Dự toán" align="right" bold>{fmtVND(live.budgetCost)}</Cell>
              <Cell label="Thực chi" align="right" bold>{fmtVND(live.actualCost)}</Cell>
              <Cell label="Chênh lệch" align="right" bold color={live.costVariance > 0 ? '#dc3250' : live.costVariance < 0 ? '#27ae60' : 'text.disabled'}>
                {live.costVariance === 0 ? '—' : fmtDelta(live.costVariance)}
              </Cell>
              <Cell label="Đã trả" align="right" bold color="text.secondary">{fmtVND(live.paidCost)}</Cell>
            </Box>
          </>
        )}
      </Paper>

      {/* E. Lợi nhuận dự kiến vs thật */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={800} color="primary" sx={{ mb: 2 }}>📈 Lợi nhuận: dự kiến vs thật</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, bgcolor: 'rgba(20,150,140,0.05)', borderRadius: 1.5, p: 2 }}>
          <ProfitColumn title="📋 Theo dự toán" revenue={s.netRevenue} cost={s.budgetCost} profit={s.plannedProfit} marginPct={s.plannedMarginPct} costLabel="Giá vốn dự toán" accent="#3498db" />
          <ProfitColumn title="🧾 Theo thực chi" revenue={s.actualRevenue} cost={s.actualCost} profit={s.actualProfit} marginPct={s.actualMarginPct} costLabel="Chi thực tế" accent={marginColor} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
          Doanh thu thuần = giá bán cả đoàn ({fmtVND(s.grandTotal)}) − VAT ({fmtVND(s.totalVAT)}). Lãi gộp = doanh thu thuần − giá vốn (chưa trừ chi phí quản lý/bán hàng).
        </Typography>
      </Paper>
    </Box>
  );
}

// ────────── helpers ──────────

function KpiCard({ from, to, label, value, sub }: { from: string; to: string; label: string; value: string; sub: string }) {
  return (
    <Paper elevation={0} sx={{ background: `linear-gradient(135deg, ${from}, ${to})`, color: '#fff', p: 2, borderRadius: 2 }}>
      <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 600 }}>{label}</Typography>
      <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
      {sub && <Typography variant="caption" sx={{ opacity: 0.75, mt: 0.5, display: 'block' }}>{sub}</Typography>}
    </Paper>
  );
}

function HeadCell({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textAlign: align ?? 'left' }}>{children}</Typography>
  );
}

function Cell({ children, label, align, color, bold }: { children: React.ReactNode; label: string; align?: 'right'; color?: string; bold?: boolean }) {
  return (
    <Box sx={{ textAlign: align ?? 'left' }}>
      <Typography variant="caption" color="text.disabled" sx={{ display: { xs: 'block', sm: 'none' } }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: color ?? 'text.primary', fontWeight: bold ? 800 : 600, fontSize: 13.5 }}>{children}</Typography>
    </Box>
  );
}

function ProfitColumn({ title, revenue, cost, profit, marginPct, costLabel, accent }: { title: string; revenue: number; cost: number; profit: number; marginPct: number; costLabel: string; accent: string }) {
  const rows = [
    { label: 'Doanh thu thuần', value: fmtVND(revenue) },
    { label: costLabel, value: fmtVND(cost) },
  ];
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 1, display: 'block' }}>{title}</Typography>
      <Stack spacing={1}>
        {rows.map((r, i) => (
          <Box key={i}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">{r.label}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{r.value}</Typography>
            </Stack>
            <Divider sx={{ mt: 1 }} />
          </Box>
        ))}
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" sx={{ color: accent, fontWeight: 800 }}>Lãi gộp</Typography>
          <Stack alignItems="flex-end">
            <Typography variant="body1" sx={{ color: accent, fontWeight: 900 }}>{fmtVND(profit)}</Typography>
            <Typography variant="caption" sx={{ color: accent, fontWeight: 700 }}>{fmtPct(marginPct)}</Typography>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
