import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { userLabel } from '@/auth/ROLES';
import { toast } from '@/stores/toastStore';
import { fmtVND } from './calc';
import { advanceTotals, emptyAdvance, lineAmount, newAdvanceLine } from './advanceCalc';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { sbEnsureNotifThread, sbSendNotification, sbSubscribeNotifThread } from '@/lib/supabase';
import { InlineNumberField } from '@/components/common/InlineNumberField';
import { FxRatesPanel } from './FxRatesPanel';
import { LEGACY } from '@/theme';
import type { ActivityStatus, AdvanceLine, Item, TourAdvance } from '@/types';

type CostKey = 'tourCosts' | 'otherCosts';

const STATUS_META: Record<TourAdvance['status'], { label: string; color: string }> = {
  draft: { label: '📝 Nháp', color: '#64748b' },
  tam_ung: { label: '💵 Tạm ứng', color: '#f5a623' },
  quyet_toan: { label: '✅ Đã quyết toán', color: '#27ae60' },
};

const APPROVAL_META: Partial<Record<ActivityStatus, { label: string; color: string }>> = {
  pending: { label: '⏳ Chờ duyệt', color: '#f39c12' },
  pending_stage2: { label: '⏳ Chờ duyệt bước 2', color: '#e67e22' },
  approved: { label: '✅ Đã duyệt', color: '#27ae60' },
  rejected: { label: '❌ Bị từ chối', color: '#dc3250' },
};

export function AdvanceView() {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const template = useQuoteStore((s) => s.draft.template);
  const rates = useQuoteStore((s) => s.draft.rates);
  const advance = useQuoteStore((s) => s.draft.advance);
  const setAdvance = useQuoteStore((s) => s.setAdvance);
  const cloudId = useQuoteStore((s) => s.draft.currentQuoteId);
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);

  const adv = advance ?? emptyAdvance();
  const t = advanceTotals(adv, rates);
  const currencies = ['VND', ...Object.keys(rates ?? {})];
  const editable = adv.status !== 'quyet_toan';
  const showActual = adv.status !== 'draft';

  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [rateModal, setRateModal] = useState<{ type: string; label: string } | null>(null);
  // Trạng thái duyệt live từ thread chung (cả người đề nghị & người duyệt cùng thấy).
  const [approvalStatus, setApprovalStatus] = useState<ActivityStatus | undefined>(undefined);
  useEffect(() => {
    if (!adv.threadId) { setApprovalStatus(undefined); return; }
    return sbSubscribeNotifThread(adv.threadId, (th) => setApprovalStatus(th?.status));
  }, [adv.threadId]);

  const patch = (p: Partial<TourAdvance>) => setAdvance({ ...adv, ...p });
  const updLine = (key: CostKey, id: string, lp: Partial<AdvanceLine>) =>
    patch({ [key]: adv[key].map((l) => (l.id === id ? { ...l, ...lp } : l)) } as Partial<TourAdvance>);
  const addLine = (key: CostKey) => patch({ [key]: [...adv[key], newAdvanceLine()] } as Partial<TourAdvance>);
  const delLine = (key: CostKey, id: string) => patch({ [key]: adv[key].filter((l) => l.id !== id) } as Partial<TourAdvance>);

  const who = currentUser ? `${currentUser.name} (${currentUser.role})` : '';

  const sendApproval = async () => {
    if (adv.tourCosts.length === 0 && adv.otherCosts.length === 0) {
      window.alert('Chưa có dòng chi phí nào để đề nghị tạm ứng.');
      return;
    }
    if (!adv.approver1) { window.alert('Hãy chọn ít nhất "Người duyệt 1" trước khi gửi.'); return; }
    if (!cloudId) { window.alert('Hãy LƯU báo giá lên cloud trước để người duyệt mở được đề nghị (nút Lưu ở thanh trên).'); return; }
    if (!currentUser) return;
    const amount = adv.advanceRequested || t.grandTotal;
    const threadId = `adv_${cloudId}`;
    const members = [currentUser.u, adv.approver1.u, ...(adv.approver2 ? [adv.approver2.u] : [])];
    const link = { kind: 'quote' as const, id: cloudId, label: info.name || 'Tạm ứng tour' };
    try {
      await sbEnsureNotifThread({
        id: threadId, title: `Tạm ứng: ${info.name || 'Tour'}`, members,
        comments: [], createdAt: new Date().toISOString(), createdBy: currentUser.name,
        actType: 'payment_approval', status: 'pending', link, data: { kind: 'advance', amount },
      });
      await sbSendNotification(adv.approver1.u, {
        type: 'payment_approval',
        title: '💵 Đề nghị duyệt TẠM ỨNG tour',
        message: `${currentUser.name} đề nghị tạm ứng ${amount.toLocaleString('vi-VN')} đ · Tour: ${info.name || '—'}`,
        createdBy: who, priority: 'high', threadId, link,
        data: {
          kind: 'advance', advanceStage: 1,
          approver1Username: adv.approver1.u, approver2Username: adv.approver2?.u,
          requestedBy: currentUser.u, requestedByName: currentUser.name,
          tourName: info.name || '', amount, cloudId, threadId,
        },
      });
      patch({ status: 'tam_ung', advanceRequested: amount, requestedBy: who, requestedAt: new Date().toISOString(), threadId });
      toast(`✅ Đã gửi yêu cầu duyệt tới ${adv.approver1.name}.`);
    } catch (e) {
      window.alert('❌ Gửi duyệt lỗi: ' + (e as Error).message);
    }
  };
  const closeSettlement = () => {
    if (!window.confirm('Quyết toán và ĐÓNG case? Sau khi đóng sẽ khoá chỉnh sửa (có thể mở lại nếu cần).')) return;
    patch({ status: 'quyet_toan', settledBy: who, settledAt: new Date().toISOString() });
    toast('✅ Đã quyết toán & đóng case.');
  };
  const reopen = () => patch({ status: 'tam_ung', settledBy: undefined, settledAt: undefined });

  const exportPDF = () => void import('@/lib/exports/exportAdvancePDF')
    .then((m) => m.exportAdvancePDF({ info, pax, adv, totals: t, rates, savedBy: who }))
    .catch((e) => window.alert('❌ Xuất PDF lỗi: ' + (e as Error).message));

  const onPickRate = (line: Partial<Item>) => {
    patch({
      tourCosts: [...adv.tourCosts, {
        ...newAdvanceLine(),
        name: line.name ?? '', price: line.price ?? 0, unit: line.unit, note: line.note,
        cur: line.cur ?? 'VND', qty: line.customQty ?? 1,
      }],
    });
    setRateModal(null);
  };

  const Section = ({ title, k, rate }: { title: string; k: CostKey; rate?: boolean }) => (
    <Paper variant="outlined" sx={{ p: 0, mb: 2, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between"
        sx={{ px: 2, py: 1, background: 'rgba(20,150,140,0.07)', borderBottom: '1px solid rgba(20,150,140,0.15)' }}>
        <Typography fontWeight={800} fontSize={14}>{title}</Typography>
        {rate && editable && (
          <Button size="small" onClick={(e) => setRateAnchor(e.currentTarget)}
            sx={{ color: '#d18a13', fontWeight: 700, fontSize: 12 }}>📋 Rate card</Button>
        )}
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700, fontSize: 12 } }}>
            <TableCell sx={{ minWidth: 200 }}>Hạng mục</TableCell>
            <TableCell sx={{ width: 90 }}>Đơn vị</TableCell>
            <TableCell align="center" sx={{ width: 70 }}>SL</TableCell>
            <TableCell align="right" sx={{ width: 130 }}>Đơn giá</TableCell>
            <TableCell align="right" sx={{ width: 140 }}>Dự toán</TableCell>
            {showActual && <TableCell align="right" sx={{ width: 150 }}>Quyết toán</TableCell>}
            <TableCell padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {adv[k].map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <TextField fullWidth size="small" variant="standard" placeholder="Tên hạng mục" value={l.name}
                  onChange={(e) => updLine(k, l.id, { name: e.target.value })} disabled={!editable}
                  InputProps={{ disableUnderline: true }} />
                <TextField fullWidth size="small" variant="standard" placeholder="Ghi chú" value={l.note ?? ''}
                  onChange={(e) => updLine(k, l.id, { note: e.target.value })} disabled={!editable}
                  InputProps={{ disableUnderline: true, sx: { fontSize: 11.5, color: 'text.secondary' } }} />
              </TableCell>
              <TableCell>
                <TextField size="small" variant="standard" value={l.unit ?? ''}
                  onChange={(e) => updLine(k, l.id, { unit: e.target.value })} disabled={!editable}
                  InputProps={{ disableUnderline: true }} />
              </TableCell>
              <TableCell align="center">
                <InlineNumberField value={l.qty} width={48} align="center" disabled={!editable}
                  onChange={(v) => updLine(k, l.id, { qty: v })} />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                  <Box component="select" value={l.cur ?? 'VND'} disabled={!editable}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updLine(k, l.id, { cur: e.target.value })}
                    sx={{ fontSize: 11, fontFamily: 'inherit', border: '1px solid rgba(20,150,140,0.25)', borderRadius: 1, py: '2px', background: '#fff', color: LEGACY.navy }}>
                    {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Box>
                  <InlineNumberField value={l.price} width={84} disabled={!editable}
                    onChange={(v) => updLine(k, l.id, { price: v })} />
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtVND(lineAmount(l, rates))}</TableCell>
              {showActual && (
                <TableCell align="right">
                  <InlineNumberField value={l.actual ?? 0} width={110} disabled={!editable} color="#c2410c" bold
                    placeholder={lineAmount(l, rates).toLocaleString('vi-VN')}
                    onChange={(v) => updLine(k, l.id, { actual: v })} />
                </TableCell>
              )}
              <TableCell padding="checkbox">
                {editable && (
                  <IconButton size="small" color="error" onClick={() => delLine(k, l.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editable && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => addLine(k)} sx={{ m: 1, color: '#0d7a6a' }}>
          Thêm dòng
        </Button>
      )}
    </Paper>
  );

  return (
    <Box sx={{ p: 2.5, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>💵 Đề nghị tạm ứng & Quyết toán tour</Typography>
          <Typography variant="caption" color="text.secondary">
            {info.name || 'Tour'} · {pax} khách
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip label={STATUS_META[adv.status].label} sx={{ bgcolor: STATUS_META[adv.status].color + '22', color: STATUS_META[adv.status].color, fontWeight: 800 }} />
          {approvalStatus && APPROVAL_META[approvalStatus] && (
            <Chip label={APPROVAL_META[approvalStatus]!.label}
              sx={{ bgcolor: APPROVAL_META[approvalStatus]!.color + '22', color: APPROVAL_META[approvalStatus]!.color, fontWeight: 800 }} />
          )}
          {(adv.status === 'draft' || (adv.status === 'tam_ung' && approvalStatus === 'rejected')) && (
            <Button variant="contained" startIcon={<SendIcon />} onClick={() => void sendApproval()}
              sx={{ background: LEGACY.headerGradient, fontWeight: 700 }}>
              {adv.status === 'draft' ? 'Gửi duyệt (Tạm ứng)' : 'Gửi lại duyệt'}
            </Button>
          )}
          {adv.status === 'tam_ung' && (
            <Button variant="contained" color="success" startIcon={<TaskAltIcon />} onClick={closeSettlement}>
              Quyết toán & đóng
            </Button>
          )}
          {adv.status === 'quyet_toan' && (
            <Button variant="outlined" onClick={reopen}>Mở lại</Button>
          )}
          <Tooltip title="Xuất PDF yêu cầu duyệt">
            <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportPDF}>Xuất PDF</Button>
          </Tooltip>
        </Stack>
      </Stack>

      {adv.status === 'quyet_toan' && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 2, bgcolor: 'rgba(39,174,96,0.08)', borderColor: 'rgba(39,174,96,0.4)' }}>
          <Typography variant="body2" fontWeight={700} sx={{ color: '#1b7f4b' }}>
            ✅ Đã quyết toán & đóng case{adv.settledBy ? ` · ${adv.settledBy}` : ''}{adv.settledAt ? ` · ${new Date(adv.settledAt).toLocaleString('vi-VN')}` : ''}. Bấm "Mở lại" để chỉnh.
          </Typography>
        </Paper>
      )}

      <Box sx={{ mb: 2 }}><FxRatesPanel /></Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>
          👥 Người duyệt <Typography component="span" variant="caption" color="text.secondary">· có thể chỉnh cả sau khi đã gửi duyệt</Typography>
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          {([1, 2] as const).map((n) => {
            const key = (n === 1 ? 'approver1' : 'approver2') as 'approver1' | 'approver2';
            const cur = adv[key];
            return (
              <Autocomplete
                key={n} size="small" options={users}
                value={users.find((u) => u.u === cur?.u) ?? null}
                onChange={(_, v) => patch({ [key]: v ? { u: v.u, name: v.name } : undefined })}
                getOptionLabel={(u) => userLabel(u, currentUser)}
                isOptionEqualToValue={(a, b) => a.u === b.u}
                renderInput={(params) => <TextField {...params} label={`Người duyệt ${n}`} placeholder="Chọn người duyệt" />}
              />
            );
          })}
        </Box>
      </Paper>

      <Section title="① Chi phí đi tour" k="tourCosts" rate />
      <Section title="② Chi phí thanh toán khác" k="otherCosts" />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.75}>
          <Row label="Tổng chi phí đi tour" value={fmtVND(t.tourTotal)} />
          <Row label="Tổng chi phí khác" value={fmtVND(t.otherTotal)} />
          <Row label="TỔNG DỰ TOÁN" value={fmtVND(t.grandTotal)} bold />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
            <Typography fontWeight={700} color="#0f3a4a">Số tiền đề nghị tạm ứng</Typography>
            <InlineNumberField value={adv.advanceRequested} width={160} bold color="#d18a13" disabled={!editable}
              placeholder={t.grandTotal.toLocaleString('vi-VN')}
              onChange={(v) => patch({ advanceRequested: v })} />
          </Stack>
          {showActual && (
            <>
              <Row label="TỔNG QUYẾT TOÁN (thực tế)" value={fmtVND(t.actualTotal)} bold color="#c2410c" />
              <Row
                label={t.balance >= 0 ? 'Hoàn lại công ty' : 'Chi vượt — cần chi thêm'}
                value={fmtVND(Math.abs(t.balance))}
                bold color={t.balance >= 0 ? '#1b7f4b' : '#dc3250'}
              />
            </>
          )}
        </Stack>
        <TextField fullWidth multiline minRows={2} size="small" sx={{ mt: 1.5 }} label="Ghi chú / Lý do tạm ứng"
          value={adv.note ?? ''} onChange={(e) => patch({ note: e.target.value })} disabled={!editable} />
      </Paper>

      <Menu anchorEl={rateAnchor} open={!!rateAnchor} onClose={() => setRateAnchor(null)}>
        {RATE_CATEGORIES.filter((c) => isRateCategoryVisible(c.key, template)).map((c) => (
          <MenuItem key={c.key} onClick={() => { setRateModal({ type: c.key, label: c.label }); setRateAnchor(null); }}>
            <ListItemIcon><Box component="span">{c.icon}</Box></ListItemIcon>
            <ListItemText>{c.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      {rateModal && (
        <RateCardModal open type={rateModal.type} label={rateModal.label}
          onClose={() => setRateModal(null)} onPick={onPickRate} />
      )}
    </Box>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography fontSize={14} fontWeight={bold ? 800 : 500} color={color}>{label}</Typography>
      <Typography fontSize={14} fontWeight={bold ? 800 : 600} color={color}>{value}</Typography>
    </Stack>
  );
}
