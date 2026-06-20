import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { fmtVND } from './calc';
import { advanceTotals, emptyAdvance, lineAmount, newAdvanceLine } from './advanceCalc';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { LEGACY } from '@/theme';
import type { AdvanceLine, Item, TourAdvance } from '@/types';

type CostKey = 'tourCosts' | 'otherCosts';

const STATUS_META: Record<TourAdvance['status'], { label: string; color: string }> = {
  draft: { label: '📝 Nháp', color: '#64748b' },
  tam_ung: { label: '💵 Tạm ứng', color: '#f5a623' },
  quyet_toan: { label: '✅ Đã quyết toán', color: '#27ae60' },
};

export function AdvanceView() {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const template = useQuoteStore((s) => s.draft.template);
  const advance = useQuoteStore((s) => s.draft.advance);
  const setAdvance = useQuoteStore((s) => s.setAdvance);
  const currentUser = useAuthStore((s) => s.currentUser);

  const adv = advance ?? emptyAdvance();
  const t = advanceTotals(adv);
  const editable = adv.status !== 'quyet_toan';
  const showActual = adv.status !== 'draft';

  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [rateModal, setRateModal] = useState<{ type: string; label: string } | null>(null);

  const patch = (p: Partial<TourAdvance>) => setAdvance({ ...adv, ...p });
  const updLine = (key: CostKey, id: string, lp: Partial<AdvanceLine>) =>
    patch({ [key]: adv[key].map((l) => (l.id === id ? { ...l, ...lp } : l)) } as Partial<TourAdvance>);
  const addLine = (key: CostKey) => patch({ [key]: [...adv[key], newAdvanceLine()] } as Partial<TourAdvance>);
  const delLine = (key: CostKey, id: string) => patch({ [key]: adv[key].filter((l) => l.id !== id) } as Partial<TourAdvance>);

  const who = currentUser ? `${currentUser.name} (${currentUser.role})` : '';

  const sendApproval = () => {
    if (adv.tourCosts.length === 0 && adv.otherCosts.length === 0) {
      window.alert('Chưa có dòng chi phí nào để đề nghị tạm ứng.');
      return;
    }
    patch({
      status: 'tam_ung',
      advanceRequested: adv.advanceRequested || t.grandTotal,
      requestedBy: who, requestedAt: new Date().toISOString(),
    });
    toast('💵 Đã chuyển trạng thái TẠM ỨNG. Bấm "Xuất PDF" để gửi yêu cầu duyệt.');
  };
  const closeSettlement = () => {
    if (!window.confirm('Quyết toán và ĐÓNG case? Sau khi đóng sẽ khoá chỉnh sửa (có thể mở lại nếu cần).')) return;
    patch({ status: 'quyet_toan', settledBy: who, settledAt: new Date().toISOString() });
    toast('✅ Đã quyết toán & đóng case.');
  };
  const reopen = () => patch({ status: 'tam_ung', settledBy: undefined, settledAt: undefined });

  const exportPDF = () => void import('@/lib/exports/exportAdvancePDF')
    .then((m) => m.exportAdvancePDF({ info, pax, adv, totals: t, savedBy: who }))
    .catch((e) => window.alert('❌ Xuất PDF lỗi: ' + (e as Error).message));

  const onPickRate = (line: Partial<Item>) => {
    patch({
      tourCosts: [...adv.tourCosts, {
        ...newAdvanceLine(),
        name: line.name ?? '', price: line.price ?? 0, unit: line.unit, note: line.note,
        qty: line.customQty ?? 1,
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
                <TextField size="small" variant="standard" type="number" value={l.qty}
                  onChange={(e) => updLine(k, l.id, { qty: Math.max(0, +e.target.value || 0) })} disabled={!editable}
                  InputProps={{ disableUnderline: true, sx: { '& input': { textAlign: 'center' } } }} />
              </TableCell>
              <TableCell align="right">
                <TextField size="small" variant="standard" type="number" value={l.price}
                  onChange={(e) => updLine(k, l.id, { price: Math.max(0, +e.target.value || 0) })} disabled={!editable}
                  InputProps={{ disableUnderline: true, sx: { '& input': { textAlign: 'right' } } }} />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtVND(lineAmount(l))}</TableCell>
              {showActual && (
                <TableCell align="right">
                  <TextField size="small" variant="standard" type="number" placeholder={String(lineAmount(l))}
                    value={l.actual ?? ''} onChange={(e) => updLine(k, l.id, { actual: e.target.value === '' ? undefined : Math.max(0, +e.target.value || 0) })}
                    disabled={!editable}
                    InputProps={{ disableUnderline: true, sx: { '& input': { textAlign: 'right', color: '#c2410c', fontWeight: 700 } } }} />
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
          {adv.status === 'draft' && (
            <Button variant="contained" startIcon={<SendIcon />} onClick={sendApproval}
              sx={{ background: LEGACY.headerGradient, fontWeight: 700 }}>Gửi duyệt (Tạm ứng)</Button>
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

      <Section title="① Chi phí đi tour" k="tourCosts" rate />
      <Section title="② Chi phí thanh toán khác" k="otherCosts" />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.75}>
          <Row label="Tổng chi phí đi tour" value={fmtVND(t.tourTotal)} />
          <Row label="Tổng chi phí khác" value={fmtVND(t.otherTotal)} />
          <Row label="TỔNG DỰ TOÁN" value={fmtVND(t.grandTotal)} bold />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
            <Typography fontWeight={700} color="#0f3a4a">Số tiền đề nghị tạm ứng</Typography>
            <TextField size="small" type="number" value={adv.advanceRequested || ''} disabled={!editable}
              onChange={(e) => patch({ advanceRequested: Math.max(0, +e.target.value || 0) })}
              placeholder={String(t.grandTotal)}
              InputProps={{ sx: { '& input': { textAlign: 'right', fontWeight: 800, color: '#d18a13' } } }} sx={{ width: 180 }} />
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
