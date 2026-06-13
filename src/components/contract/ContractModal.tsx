import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { CONTRACT_STATUS } from './constants';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import type { Contract, ContractCancel, ContractPayment } from '@/types';

type Props = {
  initial: Contract;
  onSave: (form: Contract) => void;
  onClose: () => void;
};

export function ContractModal({ initial, onSave, onClose }: Props) {
  const { state: form, set: setForm, undo, redo, canUndo, canRedo } = useHistoryState<Contract>(initial);
  useUndoRedoShortcuts(undo, redo);
  const [tab, setTab] = useState(0);

  const setF = <K extends keyof Contract>(k: K, v: Contract[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const setPartyB = (k: keyof Contract['partyB'], v: string) =>
    setForm((p) => ({ ...p, partyB: { ...p.partyB, [k]: v } }));

  // Includes/excludes
  const updList = (field: 'includes' | 'excludes', idx: number, val: string) =>
    setForm((p) => ({ ...p, [field]: p[field].map((x, i) => (i === idx ? val : x)) }));
  const delList = (field: 'includes' | 'excludes', idx: number) =>
    setForm((p) => ({ ...p, [field]: p[field].filter((_, i) => i !== idx) }));
  const addList = (field: 'includes' | 'excludes') =>
    setForm((p) => ({ ...p, [field]: [...p[field], ''] }));

  // Payments
  const updPayment = (idx: number, k: keyof ContractPayment, v: unknown) =>
    setForm((p) => ({ ...p, payments: p.payments.map((x, i) => (i === idx ? { ...x, [k]: v } : x)) }));
  const delPayment = (idx: number) =>
    setForm((p) => ({ ...p, payments: p.payments.filter((_, i) => i !== idx) }));
  const addPayment = () =>
    setForm((p) => ({
      ...p,
      payments: [...p.payments, { id: Date.now().toString(36), label: '', amount: 0, dueDate: '', note: '', status: 'pending' as const }],
    }));

  // Cancels
  const updCancel = (idx: number, k: keyof ContractCancel, v: unknown) =>
    setForm((p) => ({ ...p, cancels: p.cancels.map((x, i) => (i === idx ? { ...x, [k]: v } : x)) }));
  const delCancel = (idx: number) =>
    setForm((p) => ({ ...p, cancels: p.cancels.filter((_, i) => i !== idx) }));
  const addCancel = () =>
    setForm((p) => ({ ...p, cancels: [...p.cancels, { when: '', penalty: 0 }] }));

  const totalAmount = Math.round((form.pricePerPax || 0) * (form.contractPax || 0));
  const canSave = !!form.tourName.trim() && !!form.partyB.name.trim();

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{initial.id ? '✏️ Sửa hợp đồng' : '➕ Tạo hợp đồng mới'}</Box>
        <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Thông tin chung" />
          <Tab label="Dịch vụ" />
          <Tab label="Thanh toán" />
          <Tab label="Phạt huỷ" />
        </Tabs>
      </Box>

      <DialogContent sx={{ minHeight: 420 }}>
        {/* ── Tab 0: General info ── */}
        {tab === 0 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Số hợp đồng" value={form.contractNo}
                onChange={(e) => setF('contractNo', e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Ngày ký (DD/MM/YYYY)" value={form.contractDate}
                onChange={(e) => setF('contractDate', e.target.value)} sx={{ flex: 1 }} />
              <Select size="small" value={form.contractStatus}
                onChange={(e) => setF('contractStatus', e.target.value as Contract['contractStatus'])}
                sx={{ minWidth: 160 }}>
                {Object.entries(CONTRACT_STATUS).map(([k, s]) => (
                  <MenuItem key={k} value={k}>{s.icon} {s.label}</MenuItem>
                ))}
              </Select>
            </Stack>

            <Divider><Typography variant="caption">Thông tin tour</Typography></Divider>
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Tên tour *" required value={form.tourName}
                onChange={(e) => setF('tourName', e.target.value)} sx={{ flex: 2 }} />
              <TextField size="small" label="Điểm đến" value={form.tourDest}
                onChange={(e) => setF('tourDest', e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Số ngày" type="number" value={form.tourDays}
                onChange={(e) => setF('tourDays', Number(e.target.value) || 1)} sx={{ flex: 1 }} />
              <TextField size="small" label="Số đêm" type="number" value={form.tourNights}
                onChange={(e) => setF('tourNights', Number(e.target.value) || 0)} sx={{ flex: 1 }} />
              <TextField size="small" label="Ngày khởi hành" type="date" value={form.tourStartDate ?? ''}
                onChange={(e) => setF('tourStartDate', e.target.value || undefined)}
                slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
              <TextField size="small" label="Điểm xuất phát" value={form.departure}
                onChange={(e) => setF('departure', e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Số khách" type="number" value={form.contractPax}
                onChange={(e) => setF('contractPax', Number(e.target.value) || 1)} sx={{ flex: 1 }} />
              <TextField size="small" label="Giá / khách (₫)" type="number" value={form.pricePerPax}
                onChange={(e) => setF('pricePerPax', Number(e.target.value) || 0)} sx={{ flex: 1 }} />
              <TextField size="small" label="Tổng giá trị (₫)" value={totalAmount.toLocaleString('vi-VN')}
                slotProps={{ htmlInput: { readOnly: true } }} sx={{ flex: 1 }} />
              <TextField size="small" label="Tiền cọc (%)" type="number" value={form.bondPercent}
                onChange={(e) => setF('bondPercent', Number(e.target.value) || 0)} sx={{ flex: 1 }} />
            </Stack>

            <Divider><Typography variant="caption">Bên B (Khách hàng)</Typography></Divider>
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Tên công ty / cá nhân *" required value={form.partyB.name}
                onChange={(e) => setPartyB('name', e.target.value)} sx={{ flex: 2 }} />
              <TextField size="small" label="MST" value={form.partyB.taxCode}
                onChange={(e) => setPartyB('taxCode', e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            <TextField size="small" label="Địa chỉ" value={form.partyB.address}
              onChange={(e) => setPartyB('address', e.target.value)} />
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Đại diện" value={form.partyB.rep}
                onChange={(e) => setPartyB('rep', e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Chức vụ" value={form.partyB.title}
                onChange={(e) => setPartyB('title', e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Điện thoại" value={form.partyB.tel}
                onChange={(e) => setPartyB('tel', e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Email" value={form.partyB.email}
                onChange={(e) => setPartyB('email', e.target.value)} sx={{ flex: 1 }} />
            </Stack>
          </Stack>
        )}

        {/* ── Tab 1: Includes / Excludes ── */}
        {tab === 1 && (
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Dịch vụ bao gồm</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addList('includes')}>Thêm</Button>
              </Stack>
              <Stack spacing={0.5}>
                {form.includes.map((item, i) => (
                  <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                    <TextField size="small" fullWidth value={item}
                      onChange={(e) => updList('includes', i, e.target.value)} multiline />
                    <IconButton size="small" color="error" onClick={() => delList('includes', i)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Dịch vụ không bao gồm</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addList('excludes')}>Thêm</Button>
              </Stack>
              <Stack spacing={0.5}>
                {form.excludes.map((item, i) => (
                  <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                    <TextField size="small" fullWidth value={item}
                      onChange={(e) => updList('excludes', i, e.target.value)} multiline />
                    <IconButton size="small" color="error" onClick={() => delList('excludes', i)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}

        {/* ── Tab 2: Payments ── */}
        {tab === 2 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Tổng giá trị: <strong>{totalAmount.toLocaleString('vi-VN')} ₫</strong>
            </Typography>
            {form.payments.map((p, i) => (
              <Box key={p.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    <TextField size="small" label="Tên đợt" value={p.label}
                      onChange={(e) => updPayment(i, 'label', e.target.value)} />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant={(p.mode ?? 'percent') === 'percent' ? 'contained' : 'outlined'}
                        onClick={() => {
                          const nextMode = (p.mode ?? 'percent') === 'percent' ? 'fixed' : 'percent';
                          if (nextMode === 'fixed') {
                            // Convert percent → amount (lock the computed value)
                            const computed = p.percent !== undefined
                              ? Math.round((totalAmount * p.percent) / 100)
                              : p.amount;
                            updPayment(i, 'mode', nextMode);
                            updPayment(i, 'amount', computed);
                            updPayment(i, 'percent', undefined);
                          } else {
                            // Convert amount → percent
                            const pct = totalAmount > 0
                              ? Math.round((p.amount / totalAmount) * 10000) / 100
                              : 0;
                            updPayment(i, 'mode', nextMode);
                            updPayment(i, 'percent', pct);
                          }
                        }}
                        title="Đổi giữa % và số tiền"
                        sx={{ minWidth: 44, px: 1 }}
                      >
                        {(p.mode ?? 'percent') === 'percent' ? '%' : '₫'}
                      </Button>
                      {(p.mode ?? 'percent') === 'percent' ? (
                        <TextField size="small" label="%" type="number" value={p.percent ?? ''}
                          onChange={(e) => updPayment(i, 'percent', e.target.value ? Number(e.target.value) : undefined)}
                          sx={{ flex: 1 }} />
                      ) : (
                        <TextField size="small" label="Số tiền (₫)" type="number" value={p.amount}
                          onChange={(e) => updPayment(i, 'amount', Number(e.target.value) || 0)}
                          sx={{ flex: 1 }} />
                      )}
                      <TextField size="small" label="Hạn TT" type="date" value={p.dueDate}
                        onChange={(e) => updPayment(i, 'dueDate', e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ flex: 1 }} />
                    </Stack>
                    <TextField size="small" label="Ghi chú" value={p.note}
                      onChange={(e) => updPayment(i, 'note', e.target.value)} />
                  </Stack>
                  <IconButton size="small" color="error" onClick={() => delPayment(i)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            ))}
            <Button startIcon={<AddIcon />} onClick={addPayment} size="small">Thêm đợt</Button>
          </Stack>
        )}

        {/* ── Tab 3: Cancellation policy ── */}
        {tab === 3 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {form.cancels.map((c, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <TextField size="small" label="Điều kiện" value={c.when}
                  onChange={(e) => updCancel(i, 'when', e.target.value)} sx={{ flex: 3 }} />
                <TextField size="small" label="Phạt (%)" type="number" value={c.penalty}
                  onChange={(e) => updCancel(i, 'penalty', Number(e.target.value) || 0)} sx={{ flex: 1 }} />
                <IconButton size="small" color="error" onClick={() => delCancel(i)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button startIcon={<AddIcon />} onClick={addCancel} size="small">Thêm điều kiện</Button>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => onSave(form)}>
          💾 Lưu hợp đồng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
