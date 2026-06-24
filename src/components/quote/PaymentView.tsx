import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { DMC_CURRENCIES, CURRENCY_FLAGS } from '@/lib/currency';
import { sbSetQuotePaymentSummary } from '@/lib/supabase';
import { useQuoteStore } from '@/stores/quoteStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePaymentApprovalStore } from '@/stores/paymentApprovalStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { PaymentRequestModal } from './PaymentRequestModal';
import { getCATS } from './constants';
import { fmtVND } from './calc';
import {
  buildAllItems, buildSourceItems, computeNccDue, computePaymentTotals, slugifyTourKey,
} from './paymentUtils';
import { TrackItemsModal } from './TrackItemsModal';
import { AddCustomCostModal } from './AddCustomCostModal';
import type { CategoryId, Installment, PaymentItem, PaymentRecord } from '@/types';

function defaultRec(): PaymentRecord {
  return { supplier: '', installments: [], note: '' };
}

// Số tiền có dấu chấm phân tách hàng nghìn (vi-VN), không kèm ký hiệu tiền tệ.
const groupVN = (n: number): string => (n ? Math.round(n).toLocaleString('vi-VN') : '');
// Bỏ mọi ký tự không phải chữ số (dấu chấm, khoảng trắng…) → số nguyên.
const parseAmount = (s: string): number => Number(s.replace(/\D/g, '')) || 0;
// Hiển thị số ngoại tệ (cho phép 2 số lẻ, nhóm hàng nghìn kiểu en-US).
const fmtForeign = (n: number): string =>
  n ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function PaymentView() {
  const draft = useQuoteStore((s) => s.draft);
  const tourName = draft.info.name ?? '';
  const tourKey = slugifyTourKey(tourName);
  const template = draft.template;

  const slot = usePaymentStore((s) => s.slots[tourKey]);
  const payments = useMemo(() => slot?.data.payments ?? {}, [slot]);
  const customItems = useMemo(() => slot?.data.customItems ?? [], [slot]);

  useEffect(() => {
    if (!tourName.trim()) return;
    const store = usePaymentStore.getState();
    store.ensureSubscribed(tourKey);
    return () => {
      usePaymentStore.getState().releaseSubscription(tourKey);
    };
  }, [tourKey, tourName]);

  const activeCats = useMemo(() => (template ? getCATS(template) : []), [template]);

  const sourceItems = useMemo(
    () => buildSourceItems(draft, activeCats),
    [draft, activeCats],
  );
  const allItems = useMemo(
    () => buildAllItems(sourceItems, payments, customItems, draft.rates),
    [sourceItems, payments, customItems, draft.rates],
  );

  // Mã tiền có thể chọn cho từng hạng mục: VND + các ngoại tệ có tỷ giá trong báo giá.
  const currencyOptions = useMemo(() => {
    const foreign = Object.keys(draft.rates).filter((c) => c !== 'VND' && +draft.rates[c] > 0);
    const ordered = DMC_CURRENCIES.filter((c) => c !== 'VND' && foreign.includes(c));
    const extra = foreign.filter((c) => !DMC_CURRENCIES.includes(c as never));
    return ['VND', ...ordered, ...extra];
  }, [draft.rates]);
  const trackedItems = allItems.filter((i) => i.tracked);
  const totals = computePaymentTotals(allItems, payments);
  const untracked = allItems.length - trackedItems.length;

  // Index tóm tắt công nợ vào lịch sử báo giá (cho Bảng công nợ tổng) — debounce,
  // chỉ khi báo giá đã lưu cloud và số liệu thay đổi.
  const cloudId = draft.currentQuoteId;
  const nccDue = useMemo(() => computeNccDue(allItems, payments), [allItems, payments]);
  const nccKey = nccDue.map((d) => `${d.dueDate}:${d.amount}`).join(',');
  const payKey = cloudId ? `${Math.round(totals.totalCost)}|${Math.round(totals.totalPaid)}|${nccKey}` : '';
  useEffect(() => {
    if (!cloudId || !payKey) return;
    const t = window.setTimeout(() => {
      void sbSetQuotePaymentSummary(cloudId, {
        payable: Math.round(totals.totalCost), paid: Math.round(totals.totalPaid), remaining: Math.round(totals.totalRemaining),
      }, nccDue).catch(() => { /* index không chặn UI */ });
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudId, payKey]);

  const grouped = useMemo(() => {
    const map = new Map<CategoryId, { label: string; icon: string; color: string; items: typeof trackedItems }>();
    trackedItems.forEach((ci) => {
      const g = map.get(ci.catId) ?? { label: ci.catLabel, icon: ci.catIcon, color: ci.catColor, items: [] };
      g.items.push(ci);
      map.set(ci.catId, g);
    });
    return Array.from(map.entries());
  }, [trackedItems]);

  const [expanded, setExpanded] = useState<string | null>(null);
  // Buffer chuỗi đang gõ cho ô số ngoại tệ (để gõ được dấu thập phân mượt).
  const [amtEdit, setAmtEdit] = useState<{ key: string; val: string } | null>(null);
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [reqModal, setReqModal] = useState<
    | { ci: PaymentItem; inst: Installment; instIdx: number }
    | null
  >(null);

  const approvals = usePaymentApprovalStore((s) => s.approvals);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canRequestPayment = hasPerm(currentUser, 'exportQuote');

  if (!tourName.trim()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Đặt tên tour ở mục Thông tin trước khi quản lý thanh toán.
        </Alert>
      </Box>
    );
  }

  const getRec = (key: string): PaymentRecord => ({ ...defaultRec(), ...(payments[key] ?? {}) });
  const updateRec = (key: string, rec: PaymentRecord) =>
    usePaymentStore.getState().setPayments(tourKey, { ...payments, [key]: rec });

  const toggleTrack = (key: string) => {
    const rec = payments[key] ?? {};
    updateRec(key, { ...rec, tracked: rec.tracked === false ? true : false });
  };
  const setSupplier = (key: string, v: string) => {
    const rec = payments[key] ?? {};
    updateRec(key, { ...rec, supplier: v });
  };
  const setCustomAmount = (key: string, v: number) => {
    const rec = payments[key] ?? {};
    updateRec(key, { ...rec, customAmount: v });
  };
  const resetAmount = (key: string) => {
    const rec = { ...(payments[key] ?? {}) };
    delete rec.customAmount;
    delete rec.cur;
    updateRec(key, rec);
  };
  const setNote = (key: string, v: string) => {
    const rec = payments[key] ?? {};
    updateRec(key, { ...rec, note: v });
  };

  const addInstallment = (key: string, amount: number) => {
    const rec = getRec(key);
    const paidSum = (rec.installments ?? []).reduce((s, i) => s + (+i.amount || 0), 0);
    const remaining = Math.max(0, amount - paidSum);
    const next: Installment = {
      label: `Đợt ${(rec.installments ?? []).length + 1}`,
      amount: remaining,
      status: 'unpaid',
      paidDate: '',
    };
    updateRec(key, { ...rec, installments: [...(rec.installments ?? []), next] });
  };
  const updInstallment = (key: string, idx: number, patch: Partial<Installment>) => {
    const rec = payments[key];
    if (!rec) return;
    const insts = [...(rec.installments ?? [])];
    insts[idx] = { ...insts[idx], ...patch };
    updateRec(key, { ...rec, installments: insts });
  };
  const delInstallment = (key: string, idx: number) => {
    const rec = payments[key];
    if (!rec) return;
    updateRec(key, { ...rec, installments: (rec.installments ?? []).filter((_, i) => i !== idx) });
  };

  const editCustomAmount = (key: string, v: number) => {
    usePaymentStore.getState().setCustomItems(
      tourKey,
      customItems.map((c) => (c.key === key ? { ...c, amount: v } : c)),
    );
  };
  const delCustom = (key: string) => {
    if (!window.confirm('Xoá khoản chi phí tự tạo này?')) return;
    usePaymentStore.getState().setCustomItems(
      tourKey,
      customItems.filter((c) => c.key !== key),
    );
    const next = { ...payments };
    delete next[key];
    usePaymentStore.getState().setPayments(tourKey, next);
  };
  const addCustom = (item: typeof customItems[number]) => {
    usePaymentStore.getState().setCustomItems(tourKey, [...customItems, item]);
  };

  // Sửa số tiền hạng mục — `v` được hiểu theo mã tiền hiện tại của hạng mục.
  const setItemAmount = (ci: PaymentItem, v: number) => {
    if (ci.custom) editCustomAmount(ci.key, v);
    else setCustomAmount(ci.key, v);
  };

  // Đổi mã tiền của hạng mục: giữ nguyên giá trị VND, quy đổi sang mã mới qua tỷ giá báo giá.
  const setItemCurrency = (ci: PaymentItem, newCur: string) => {
    const foreign = newCur !== 'VND';
    const rate = foreign ? +draft.rates[newCur] || 0 : 0;
    const vnd = ci.amount; // VND chuẩn của giá trị đang có
    if (ci.custom) {
      const amount = foreign && rate ? round2(vnd / rate) : Math.round(vnd);
      usePaymentStore.getState().setCustomItems(
        tourKey,
        customItems.map((c) => (c.key === ci.key ? { ...c, amount, cur: foreign ? newCur : undefined } : c)),
      );
    } else {
      const rec = { ...(payments[ci.key] ?? {}) };
      if (foreign) {
        rec.cur = newCur;
        rec.customAmount = rate ? round2(vnd / rate) : 0;
      } else {
        delete rec.cur;
        // Về VND: nếu trùng giá vốn thì bỏ override, ngược lại giữ số VND.
        if (Math.round(vnd) === Math.round(ci.sourceAmount)) delete rec.customAmount;
        else rec.customAmount = Math.round(vnd);
      }
      updateRec(ci.key, rec);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setTrackModalOpen(true)}
        >
          ⚙️ Quản lý hạng mục {untracked > 0 ? `(${untracked} đang ẩn)` : ''}
        </Button>
        <Button variant="contained" color="warning" onClick={() => setAddCustomOpen(true)}>
          ➕ Thêm chi phí tự tạo
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        <SummaryCard
          gradient="linear-gradient(135deg,#0f1c2d,#16314a)"
          icon="💰"
          label="Tổng chi phí quản lý"
          value={fmtVND(totals.totalCost)}
          sub={`${trackedItems.length} khoản đang theo dõi`}
        />
        <SummaryCard
          gradient="linear-gradient(135deg,#0d7a6a,#14a08c)"
          icon="✅"
          label="Đã thanh toán"
          value={fmtVND(totals.totalPaid)}
          sub={`${totals.totalCost > 0 ? Math.round((totals.totalPaid / totals.totalCost) * 100) : 0}% tổng chi phí`}
        />
        <SummaryCard
          gradient="linear-gradient(135deg,#dc3250,#c0392b)"
          icon="⚠️"
          label="Công nợ còn thiếu"
          value={fmtVND(totals.totalRemaining)}
          sub={`${totals.totalCost > 0 ? Math.round((totals.totalRemaining / totals.totalCost) * 100) : 0}% chưa trả`}
        />
        <SummaryCard
          gradient="linear-gradient(135deg,#f5a623,#e67e22)"
          icon="📅"
          label="Đã lên lịch TT"
          value={fmtVND(totals.totalScheduled)}
          sub="Tổng các đợt đã tạo"
        />
      </Box>

      {trackedItems.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography fontSize={40} sx={{ mb: 1.5 }}>📋</Typography>
          <Typography variant="subtitle1" fontWeight={600}>Chưa có khoản nào được theo dõi</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Bấm "⚙️ Quản lý hạng mục" để chọn khoản cần quản lý, hoặc "➕ Thêm chi phí tự tạo".
          </Typography>
        </Box>
      )}

      {grouped.map(([catId, grp]) => (
        <Box key={catId} sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography fontSize={18}>{grp.icon}</Typography>
            <Typography fontWeight={800} fontSize={15} sx={{ color: grp.color }}>
              {grp.label}
            </Typography>
          </Stack>
          <Stack spacing={1.25}>
            {grp.items.map((ci) => {
              const rec = getRec(ci.key);
              const paidSum = (rec.installments ?? [])
                .filter((i) => i.status === 'paid')
                .reduce((s, i) => s + (+i.amount || 0), 0);
              const remaining = ci.amount - paidSum;
              const pct = ci.amount > 0 ? Math.round((paidSum / ci.amount) * 100) : 0;
              const isOpen = expanded === ci.key;
              return (
                <Box
                  key={ci.key}
                  sx={{
                    bgcolor: '#fff',
                    border: '1px solid',
                    borderColor: isOpen ? grp.color : 'rgba(20,150,140,0.15)',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ p: 1.75, cursor: 'pointer' }}
                    onClick={() => setExpanded(isOpen ? null : ci.key)}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                        <Typography fontWeight={700} fontSize={14}>{ci.name}</Typography>
                        {ci.custom && (
                          <Chip label="Tự tạo" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700,
                                bgcolor: 'rgba(245,166,35,0.15)', color: '#d18a13' }} />
                        )}
                        {ci.isOverridden && (
                          <Chip label="Đã chỉnh giá" size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700,
                                bgcolor: 'rgba(155,89,182,0.15)', color: '#8e44ad' }} />
                        )}
                      </Stack>
                      <TextField
                        placeholder="+ Tên nhà cung cấp..."
                        value={rec.supplier ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSupplier(ci.key, e.target.value)}
                        size="small"
                        variant="standard"
                        sx={{ mt: 0.5, '& .MuiInput-input': { fontSize: 12, color: '#0d7a6a' } }}
                      />
                    </Box>
                    <Box
                      sx={{ textAlign: 'right', minWidth: 180 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                        <TextField
                          value={
                            ci.cur
                              ? (amtEdit?.key === ci.key ? amtEdit.val : fmtForeign(ci.foreignAmount ?? 0))
                              : groupVN(ci.amount)
                          }
                          onChange={(e) => {
                            if (ci.cur) {
                              const clean = e.target.value.replace(/[^\d.]/g, '');
                              setAmtEdit({ key: ci.key, val: clean });
                              setItemAmount(ci, Number(clean) || 0);
                            } else {
                              setItemAmount(ci, parseAmount(e.target.value));
                            }
                          }}
                          onBlur={() => setAmtEdit(null)}
                          slotProps={{ htmlInput: { inputMode: ci.cur ? 'decimal' : 'numeric' } }}
                          size="small"
                          variant="standard"
                          sx={{
                            width: ci.cur ? 110 : 140,
                            '& .MuiInput-input': {
                              textAlign: 'right', fontWeight: 800, fontSize: 15,
                              color: ci.isOverridden ? '#8e44ad' : 'text.primary',
                            },
                          }}
                        />
                        <CatCurrencyMenu
                          value={ci.cur ?? 'VND'}
                          options={currencyOptions}
                          onChange={(c) => setItemCurrency(ci, c)}
                        />
                      </Stack>
                      {ci.cur && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: 'text.secondary' }}>
                          ≈ {fmtVND(ci.amount)}
                        </Typography>
                      )}
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block', mt: 0.25,
                          color: remaining <= 0 ? '#27ae60' : paidSum > 0 ? '#f5a623' : 'text.disabled',
                        }}
                      >
                        {remaining <= 0 ? '✅ Đã trả đủ' : paidSum > 0 ? `Còn thiếu ${fmtVND(remaining)}` : 'Chưa thanh toán'}
                      </Typography>
                      {ci.isOverridden && !ci.custom && (
                        <Button
                          size="small"
                          onClick={() => resetAmount(ci.key)}
                          startIcon={<RestartAltIcon sx={{ fontSize: 12 }} />}
                          sx={{ color: '#8e44ad', fontSize: 10, textTransform: 'none', py: 0 }}
                        >
                          Về giá vốn ({fmtVND(ci.sourceAmount)})
                        </Button>
                      )}
                    </Box>
                    <Box
                      sx={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: `conic-gradient(${grp.color} ${pct * 3.6}deg, rgba(20,150,140,0.1) 0deg)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <Box sx={{
                        width: 32, height: 32, borderRadius: '50%', bgcolor: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: grp.color,
                      }}>{pct}%</Box>
                    </Box>
                    {ci.custom && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => { e.stopPropagation(); delCustom(ci.key); }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                    {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </Stack>

                  {isOpen && (
                    <Box sx={{ p: 2, pt: 0 }}>
                      <Divider sx={{ mb: 1.5 }} />
                      <Stack spacing={1}>
                        {(rec.installments ?? []).map((inst, idx) => {
                          const apKey = `${tourKey}_${ci.key}_${idx}`;
                          const ap = approvals[apKey];
                          const final = ap?.finalStatus;
                          const isApproved = final === 'approved';
                          const isRejected = final === 'rejected';
                          const showPending = !isApproved && !isRejected && inst.status !== 'paid';
                          return (
                          <Stack
                            key={idx}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{
                              p: 1.25, borderRadius: 1.25,
                              bgcolor: inst.status === 'paid' ? 'rgba(39,174,96,0.07)' : 'rgba(245,166,35,0.06)',
                              border: '1px solid',
                              borderColor: inst.status === 'paid' ? 'rgba(39,174,96,0.25)' : 'rgba(245,166,35,0.25)',
                            }}
                          >
                            {inst.status !== 'paid' && (
                              isApproved ? (
                                <Chip label="✅ Đã duyệt" size="small"
                                  sx={{ height: 22, fontSize: 10, fontWeight: 700,
                                        bgcolor: 'rgba(39,174,96,0.12)', color: '#27ae60',
                                        border: '1px solid rgba(39,174,96,0.3)' }} />
                              ) : isRejected ? (
                                <Chip label="❌ Từ chối" size="small"
                                  sx={{ height: 22, fontSize: 10, fontWeight: 700,
                                        bgcolor: 'rgba(220,50,80,0.1)', color: '#dc3250',
                                        border: '1px solid rgba(220,50,80,0.25)' }} />
                              ) : showPending ? (
                                <Chip label="⏳ Chờ duyệt" size="small"
                                  sx={{ height: 22, fontSize: 10, fontWeight: 600,
                                        bgcolor: 'rgba(245,166,35,0.1)', color: '#d18a13',
                                        border: '1px dashed rgba(245,166,35,0.4)' }} />
                              ) : null
                            )}
                            <TextField
                              value={inst.label}
                              onChange={(e) => updInstallment(ci.key, idx, { label: e.target.value })}
                              size="small"
                              variant="outlined"
                              sx={{ width: 120, '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
                            />
                            <TextField
                              value={groupVN(inst.amount)}
                              onChange={(e) => updInstallment(ci.key, idx, { amount: parseAmount(e.target.value) })}
                              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                              size="small"
                              variant="outlined"
                              sx={{ width: 130, '& .MuiInputBase-input': { fontSize: 13, fontWeight: 700, py: 0.5 } }}
                            />
                            <Button
                              size="small"
                              variant={inst.status === 'paid' ? 'contained' : 'outlined'}
                              color={inst.status === 'paid' ? 'success' : 'inherit'}
                              onClick={() => updInstallment(ci.key, idx, {
                                status: inst.status === 'paid' ? 'unpaid' : 'paid',
                                paidDate: inst.status === 'paid' ? '' : inst.paidDate,
                              })}
                              sx={{ fontSize: 11, fontWeight: 700, px: 1.5, py: 0.25 }}
                            >
                              {inst.status === 'paid' ? '✅ Đã TT' : '⏳ Chưa TT'}
                            </Button>
                            {inst.status === 'paid' ? (
                              <TextField
                                type="date"
                                value={inst.paidDate || ''}
                                onChange={(e) => updInstallment(ci.key, idx, { paidDate: e.target.value })}
                                size="small"
                                variant="outlined"
                                sx={{ '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
                              />
                            ) : (
                              <TextField
                                type="date"
                                label="Hạn trả"
                                value={inst.dueDate || ''}
                                onChange={(e) => updInstallment(ci.key, idx, { dueDate: e.target.value })}
                                size="small"
                                variant="outlined"
                                slotProps={{ inputLabel: { shrink: true } }}
                                sx={{ '& .MuiInputBase-input': { fontSize: 12, py: 0.5 } }}
                              />
                            )}
                            <Box sx={{ flex: 1 }} />
                            {canRequestPayment && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                onClick={() => setReqModal({ ci, inst, instIdx: idx })}
                                sx={{ fontSize: 11, py: 0.25, px: 1.25 }}
                              >
                                📄 Phiếu ĐN
                              </Button>
                            )}
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => delInstallment(ci.key, idx)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          );
                        })}
                      </Stack>
                      <Button
                        fullWidth
                        variant="outlined"
                        sx={{
                          mt: 1.25, borderStyle: 'dashed', borderColor: grp.color, color: grp.color, fontWeight: 700,
                        }}
                        onClick={() => addInstallment(ci.key, ci.amount)}
                      >
                        ➕ Thêm đợt thanh toán {(rec.installments ?? []).length === 0 ? '(cọc / toàn bộ)' : ''}
                      </Button>
                      <TextField
                        placeholder="Ghi chú (số TK, điều kiện...)"
                        value={rec.note ?? ''}
                        onChange={(e) => setNote(ci.key, e.target.value)}
                        size="small"
                        fullWidth
                        sx={{ mt: 1 }}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}

      <TrackItemsModal
        open={trackModalOpen}
        onClose={() => setTrackModalOpen(false)}
        items={allItems}
        onToggle={toggleTrack}
      />
      <AddCustomCostModal
        open={addCustomOpen}
        onClose={() => setAddCustomOpen(false)}
        activeCats={activeCats}
        onAdd={addCustom}
      />
      {reqModal && currentUser && (
        <PaymentRequestModal
          open
          onClose={() => setReqModal(null)}
          ci={reqModal.ci}
          inst={reqModal.inst}
          instIdx={reqModal.instIdx}
          info={draft.info}
          currentUser={currentUser}
          approvalEntry={approvals[`${tourKey}_${reqModal.ci.key}_${reqModal.instIdx}`]}
        />
      )}
    </Box>
  );
}

function CatCurrencyMenu({
  value, options, onChange,
}: { value: string; options: string[]; onChange: (cur: string) => void }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const flag = (c: string) => CURRENCY_FLAGS[c as keyof typeof CURRENCY_FLAGS] ?? '💱';
  return (
    <>
      <Button
        size="small"
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}
        sx={{
          minWidth: 0, px: 0.75, py: 0.25, fontSize: 11, fontWeight: 700,
          textTransform: 'none', color: value === 'VND' ? 'text.secondary' : '#0d7a6a',
          bgcolor: value === 'VND' ? 'transparent' : 'rgba(13,122,106,0.08)',
        }}
      >
        {flag(value)} {value}
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {options.map((c) => (
          <MenuItem
            key={c}
            selected={c === value}
            onClick={() => { onChange(c); setAnchorEl(null); }}
            sx={{ fontSize: 13, minWidth: 130, fontWeight: c === value ? 700 : 400 }}
          >
            {flag(c)} {c}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function SummaryCard({
  gradient, icon, label, value, sub,
}: { gradient: string; icon: string; label: string; value: string; sub: string }) {
  return (
    <Box sx={{ background: gradient, color: '#fff', borderRadius: 2, px: 2.5, py: 2 }}>
      <Typography variant="caption" sx={{ opacity: 0.85 }}>{icon} {label}</Typography>
      <Typography fontWeight={800} fontSize={22} sx={{ mt: 0.5 }}>{value}</Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.25, opacity: 0.75 }}>
        {sub}
      </Typography>
    </Box>
  );
}
