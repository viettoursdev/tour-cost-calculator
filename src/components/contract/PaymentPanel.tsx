import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import AddIcon from '@mui/icons-material/Add';
import { fmtVND } from '@/components/quote/calc';
import type { Contract, ContractPayment } from '@/types';

type Props = {
  contract: Contract;
  canEdit: boolean;
  onUpdate: (payments: ContractPayment[]) => void;
};

export function PaymentPanel({ contract, canEdit, onUpdate }: Props) {
  const [payments, setPayments] = useState<ContractPayment[]>(
    (contract.payments ?? []).map((p, i) => p.id ? p : { ...p, id: `p_${i}_${Date.now()}` }),
  );
  const [adding, setAdding] = useState(false);
  const [newP, setNewP] = useState({ label: '', amount: '', dueDate: '', note: '' });
  const [editAmt, setEditAmt] = useState<{ id: string; val: string } | null>(null);

  const totalAmount = Math.round((contract.pricePerPax || 0) * (contract.contractPax || 0));
  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.receivedAmount ?? p.amount), 0);
  const paidPct = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;

  const commit = (next: ContractPayment[]) => {
    setPayments(next);
    onUpdate(next);
  };

  const togglePaid = (id: string) => {
    const next = payments.map((p) =>
      p.id === id
        ? {
            ...p,
            status: (p.status === 'paid' ? 'pending' : 'paid') as ContractPayment['status'],
            paidDate: p.status === 'paid' ? undefined : new Date().toISOString().slice(0, 10),
          }
        : p,
    );
    commit(next);
  };

  const saveAmt = (id: string) => {
    if (!editAmt || editAmt.id !== id) return;
    const next = payments.map((p) =>
      p.id === id ? { ...p, receivedAmount: Number(editAmt.val) || p.amount } : p,
    );
    commit(next);
    setEditAmt(null);
  };

  const delPayment = (id: string) => commit(payments.filter((p) => p.id !== id));

  const addPayment = () => {
    if (!newP.label.trim() || !newP.amount) return;
    const next = [
      ...payments,
      {
        id: Date.now().toString(36),
        label: newP.label,
        amount: Number(newP.amount),
        dueDate: newP.dueDate,
        note: newP.note,
        status: 'pending' as const,
      },
    ];
    commit(next);
    setAdding(false);
    setNewP({ label: '', amount: '', dueDate: '', note: '' });
  };

  return (
    <Box sx={{ p: 1 }}>
      {/* Progress */}
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption">Đã thanh toán: {fmtVND(totalPaid)} / {fmtVND(totalAmount)}</Typography>
        <Typography variant="caption">{paidPct.toFixed(0)}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={paidPct} sx={{ mb: 2, height: 6, borderRadius: 3 }} />

      {/* Payment rows */}
      <Stack spacing={1} sx={{ mb: 1 }}>
        {payments.map((p) => {
          const isPaid = p.status === 'paid';
          return (
            <Paper key={p.id} variant="outlined" sx={{ p: 1.5, opacity: isPaid ? 0.85 : 1 }}>
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                {canEdit && (
                  <Tooltip title={isPaid ? 'Bỏ đánh dấu đã TT' : 'Đánh dấu đã TT'}>
                    <IconButton size="small" onClick={() => togglePaid(p.id)} color={isPaid ? 'success' : 'default'}>
                      {isPaid ? <CheckCircleOutlineIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={600}>{p.label}</Typography>
                    <Chip
                      size="small"
                      label={isPaid ? 'Đã TT' : 'Chờ TT'}
                      color={isPaid ? 'success' : 'warning'}
                      variant="outlined"
                      sx={{ fontSize: 10 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {fmtVND(p.amount)}{p.dueDate ? ` · Hạn: ${p.dueDate}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </Typography>
                  {isPaid && canEdit && (
                    <Box sx={{ mt: 0.5 }}>
                      {editAmt?.id === p.id ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <TextField
                            size="small"
                            label="Số thực nhận (₫)"
                            type="number"
                            value={editAmt.val}
                            onChange={(e) => setEditAmt({ id: p.id, val: e.target.value })}
                            onBlur={() => saveAmt(p.id)}
                            autoFocus
                            slotProps={{ htmlInput: { min: 0 } }}
                          />
                          <Button size="small" onClick={() => saveAmt(p.id)}>Lưu</Button>
                        </Stack>
                      ) : (
                        <Typography
                          variant="caption"
                          color="success.main"
                          sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                          onClick={() => setEditAmt({ id: p.id, val: String(p.receivedAmount ?? p.amount) })}
                        >
                          Thực nhận: {fmtVND(p.receivedAmount ?? p.amount)} (click để sửa)
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                {canEdit && (
                  <IconButton size="small" color="error" onClick={() => delPayment(p.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {/* Add payment */}
      {canEdit && !adding && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          Thêm đợt thanh toán
        </Button>
      )}
      {canEdit && adding && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={1}>
            <TextField size="small" label="Tên đợt *" value={newP.label}
              onChange={(e) => setNewP((p) => ({ ...p, label: e.target.value }))} />
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Số tiền (₫) *" type="number" value={newP.amount}
                onChange={(e) => setNewP((p) => ({ ...p, amount: e.target.value }))}
                slotProps={{ htmlInput: { min: 0 } }} sx={{ flex: 1 }} />
              <TextField size="small" label="Hạn TT" value={newP.dueDate}
                onChange={(e) => setNewP((p) => ({ ...p, dueDate: e.target.value }))}
                sx={{ flex: 1 }} />
            </Stack>
            <TextField size="small" label="Ghi chú" value={newP.note}
              onChange={(e) => setNewP((p) => ({ ...p, note: e.target.value }))} />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => setAdding(false)}>Huỷ</Button>
              <Button size="small" variant="contained"
                disabled={!newP.label.trim() || !newP.amount}
                onClick={addPayment}>
                Thêm
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
