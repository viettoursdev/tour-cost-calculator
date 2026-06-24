import {
  Alert, Box, Button, Chip, IconButton, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import { useQuoteStore } from '@/stores/quoteStore';
import { fmtVND } from './calc';
import {
  PAY_METHODS, emptyAdvance, lineActual, lineAmount, newSettlePay, payMethodMeta, settlePayVND, settleSummary,
} from './advanceCalc';
import { InlineNumberField } from '@/components/common/InlineNumberField';
import { LEGACY } from '@/theme';
import type { AdvancePayMethod, AdvanceSettlePay, TourAdvance } from '@/types';

/** Tab "Quyết Toán CP Tạm ứng": quyết toán toàn bộ chi phí "nợ công ty" đã tạm ứng
 *  + các khoản phát sinh trên tour, theo nhiều ngoại tệ & nhiều phương thức thanh toán.
 *  Phần dư → hoàn lại tạm ứng cho công ty; phần thiếu → trả công nợ cho công ty. */
export function AdvanceSettleView() {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const advance = useQuoteStore((s) => s.draft.advance);
  const setAdvance = useQuoteStore((s) => s.setAdvance);

  const adv = advance ?? emptyAdvance();
  const entries = adv.settlements ?? [];
  const editable = adv.status !== 'quyet_toan';
  const currencies = ['VND', ...Object.keys(rates ?? {})];
  const sum = settleSummary(adv, rates);

  const patch = (p: Partial<TourAdvance>) => setAdvance({ ...adv, ...p });
  const setEntries = (settlements: AdvanceSettlePay[]) => patch({ settlements });
  const updEntry = (id: string, p: Partial<AdvanceSettlePay>) =>
    setEntries(entries.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const addEntry = () => setEntries([...entries, newSettlePay()]);
  const delEntry = (id: string) => setEntries(entries.filter((e) => e.id !== id));

  /** Lấy các dòng chi phí dự toán (đi tour + khác) thành khoản chi để quyết toán. */
  const importFromCosts = () => {
    const costLines = [...adv.tourCosts, ...adv.otherCosts].filter((l) => l.name.trim() || lineAmount(l, rates) > 0);
    if (costLines.length === 0) {
      window.alert('Chưa có dòng chi phí dự toán nào ở tab "Đề nghị tạm ứng".');
      return;
    }
    const imported = costLines.map((l) =>
      l.actual != null && l.actual >= 0
        ? newSettlePay({ name: l.name, note: l.note, amount: lineActual(l, rates), cur: 'VND' })
        : newSettlePay({ name: l.name, note: l.note, amount: (l.qty || 0) * (l.price || 0), cur: l.cur }),
    );
    setEntries([...entries, ...imported]);
  };

  const exportCSV = () => {
    const head = ['Nội dung', 'Ghi chú', 'Phương thức', 'Ngoại tệ', 'Số tiền', 'Quy VND'];
    const rows = entries.map((e) => [
      e.name, e.note ?? '', payMethodMeta(e.method).label, e.cur ?? 'VND',
      String(e.amount ?? 0), String(settlePayVND(e, rates)),
    ]);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quyet-toan-tam-ung-${(info.name || 'tour').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Box sx={{ p: 2.5, maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>🧾 Quyết toán CP tạm ứng</Typography>
          <Typography variant="caption" color="text.secondary">
            {info.name || 'Tour'} · {pax} khách · Tạm ứng (nợ công ty) {fmtVND(sum.advanced)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {editable && (
            <Button variant="outlined" onClick={importFromCosts} sx={{ color: '#0d7a6a', borderColor: '#0d7a6a' }}>
              ⤵️ Lấy từ chi phí dự toán
            </Button>
          )}
          <Tooltip title="Xuất bảng quyết toán ra Excel/CSV">
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCSV} disabled={entries.length === 0}>
              Xuất CSV
            </Button>
          </Tooltip>
        </Stack>
      </Stack>

      {adv.status === 'draft' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nhập các khoản chi <b>thực tế</b> đã thanh toán trong tour (đa ngoại tệ & nhiều phương thức:
          tiền mặt, thẻ công ty, thẻ cá nhân, thẻ khác…). Số tạm ứng lấy từ tab "Đề nghị tạm ứng".
        </Alert>
      )}
      {adv.status === 'quyet_toan' && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Đã quyết toán & đóng case{adv.settledBy ? ` · ${adv.settledBy}` : ''}. Mở lại ở tab "Đề nghị tạm ứng" để chỉnh.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 0, mb: 2, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, background: 'rgba(20,150,140,0.07)', borderBottom: '1px solid rgba(20,150,140,0.15)' }}>
          <Typography fontWeight={800} fontSize={14}>Các khoản chi thực tế</Typography>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700, fontSize: 12 } }}>
              <TableCell sx={{ minWidth: 220 }}>Nội dung chi</TableCell>
              <TableCell sx={{ width: 150 }}>Phương thức</TableCell>
              <TableCell align="right" sx={{ width: 170 }}>Số tiền</TableCell>
              <TableCell align="right" sx={{ width: 140 }}>Quy VND</TableCell>
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <TextField fullWidth size="small" variant="standard" placeholder="Nội dung khoản chi" value={e.name}
                    onChange={(ev) => updEntry(e.id, { name: ev.target.value })} disabled={!editable}
                    InputProps={{ disableUnderline: true }} />
                  <TextField fullWidth size="small" variant="standard" placeholder="Ghi chú" value={e.note ?? ''}
                    onChange={(ev) => updEntry(e.id, { note: ev.target.value })} disabled={!editable}
                    InputProps={{ disableUnderline: true, sx: { fontSize: 11.5, color: 'text.secondary' } }} />
                </TableCell>
                <TableCell>
                  <Box component="select" value={e.method} disabled={!editable}
                    onChange={(ev: React.ChangeEvent<HTMLSelectElement>) => updEntry(e.id, { method: ev.target.value as AdvancePayMethod })}
                    sx={{ fontSize: 12, fontFamily: 'inherit', border: '1px solid rgba(20,150,140,0.25)', borderRadius: 1, py: '4px', width: '100%', background: '#fff', color: LEGACY.navy }}>
                    {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                    <Box component="select" value={e.cur ?? 'VND'} disabled={!editable}
                      onChange={(ev: React.ChangeEvent<HTMLSelectElement>) => updEntry(e.id, { cur: ev.target.value })}
                      sx={{ fontSize: 11, fontFamily: 'inherit', border: '1px solid rgba(20,150,140,0.25)', borderRadius: 1, py: '2px', background: '#fff', color: LEGACY.navy }}>
                      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Box>
                    <InlineNumberField value={e.amount} width={96} disabled={!editable}
                      onChange={(v) => updEntry(e.id, { amount: v })} />
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtVND(settlePayVND(e, rates))}</TableCell>
                <TableCell padding="checkbox">
                  {editable && (
                    <IconButton size="small" color="error" onClick={() => delEntry(e.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
                  Chưa có khoản chi nào. Bấm "Thêm dòng" hoặc "Lấy từ chi phí dự toán".
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {editable && (
          <Button size="small" startIcon={<AddIcon />} onClick={addEntry} sx={{ m: 1, color: '#0d7a6a' }}>
            Thêm dòng
          </Button>
        )}
      </Paper>

      {(sum.byMethod.length > 0 || sum.byCurrency.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={800} fontSize={13} sx={{ mb: 1 }}>💳 Theo phương thức thanh toán</Typography>
            <Stack spacing={0.5}>
              {sum.byMethod.map((m) => (
                <Row key={m.method} label={`${payMethodMeta(m.method).icon} ${payMethodMeta(m.method).label}`} value={fmtVND(m.vnd)} />
              ))}
              {sum.byMethod.length === 0 && <Typography variant="caption" color="text.secondary">Chưa có khoản chi.</Typography>}
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={800} fontSize={13} sx={{ mb: 1 }}>💱 Theo loại tiền</Typography>
            <Stack spacing={0.5}>
              {sum.byCurrency.map((c) => (
                <Stack key={c.cur} direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography fontSize={14} fontWeight={600}>
                    {c.cur}
                    {c.cur !== 'VND' && (
                      <Typography component="span" variant="caption" color="text.secondary"> · {c.raw.toLocaleString('vi-VN')} {c.cur}</Typography>
                    )}
                  </Typography>
                  <Typography fontSize={14} fontWeight={700}>{fmtVND(c.vnd)}</Typography>
                </Stack>
              ))}
              {sum.byCurrency.length === 0 && <Typography variant="caption" color="text.secondary">Chưa có khoản chi.</Typography>}
            </Stack>
          </Paper>
        </Box>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.75}>
          <Row label="Tổng đã tạm ứng (nợ công ty)" value={fmtVND(sum.advanced)} />
          <Row label="Tổng đã chi (quyết toán)" value={fmtVND(sum.totalSettled)} bold color="#c2410c" />
          {sum.balance >= 0 ? (
            <Row label="✅ Phần dư — hoàn lại tạm ứng cho công ty" value={fmtVND(sum.balance)} bold color="#1b7f4b" />
          ) : (
            <Row label="⚠️ Phần thiếu — trả công nợ cho công ty" value={fmtVND(-sum.balance)} bold color="#dc3250" />
          )}
        </Stack>
        <Chip
          size="small"
          label={sum.balance >= 0 ? 'Công ty được hoàn lại' : 'Công ty cần thanh toán thêm / ghi công nợ'}
          sx={{ mt: 1.25, fontWeight: 700, bgcolor: (sum.balance >= 0 ? '#1b7f4b' : '#dc3250') + '18', color: sum.balance >= 0 ? '#1b7f4b' : '#dc3250' }}
        />
      </Paper>
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
