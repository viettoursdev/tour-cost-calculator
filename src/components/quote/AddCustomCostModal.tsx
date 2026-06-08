import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, Typography,
} from '@mui/material';
import type { CustomCostItem } from '@/types';
import type { CategoryDef } from './constants';

type Props = {
  open: boolean;
  onClose: () => void;
  activeCats: readonly CategoryDef[];
  onAdd: (item: CustomCostItem) => void;
};

export function AddCustomCostModal({ open, onClose, activeCats, onAdd }: Props) {
  const [catId, setCatId] = useState(activeCats[0]?.id ?? 'hotel');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [touched, setTouched] = useState(false);

  const cat = activeCats.find((c) => c.id === catId) ?? activeCats[0];
  const nameError = touched && !name.trim();
  const amountError = touched && !(amount > 0);

  const handleSubmit = () => {
    setTouched(true);
    if (!name.trim() || !(amount > 0) || !cat) return;
    const newItem: CustomCostItem = {
      key: 'custom_' + Date.now(),
      catId: cat.id,
      catLabel: cat.label,
      catIcon: cat.icon,
      catColor: cat.color,
      name: name.trim(),
      amount: +amount,
    };
    onAdd(newItem);
    setName('');
    setAmount(0);
    setTouched(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#f5a623,#e67e22)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>➕ Thêm chi phí tự tạo</Typography>
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          Khoản chi ngoài bảng giá vốn (chỉ hiện trong tab Thanh toán)
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              HẠNG MỤC / CATEGORY
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {activeCats.map((c) => {
                const active = catId === c.id;
                return (
                  <Button
                    key={c.id}
                    size="small"
                    onClick={() => setCatId(c.id)}
                    sx={{
                      bgcolor: active ? c.color : '#fff',
                      color: active ? '#fff' : 'text.secondary',
                      border: '1.5px solid',
                      borderColor: active ? 'transparent' : 'rgba(20,150,140,0.2)',
                      fontWeight: active ? 700 : 500,
                      fontSize: 12,
                      px: 1.5, py: 0.5,
                      '&:hover': { bgcolor: active ? c.color : 'action.hover' },
                    }}
                  >
                    {c.icon} {c.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>
          <TextField
            label="Tên khoản chi phí *"
            placeholder="VD: Chi phí phát sinh ngoài kế hoạch, Tip cho HDV..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            helperText={nameError ? 'Vui lòng nhập tên khoản chi phí' : ''}
            autoFocus
            size="small"
            fullWidth
          />
          <TextField
            label="Số tiền (VND) *"
            type="number"
            value={amount || ''}
            onChange={(e) => setAmount(+e.target.value)}
            error={amountError}
            helperText={amountError ? 'Vui lòng nhập số tiền > 0' : ''}
            size="small"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button onClick={handleSubmit} variant="contained" color="warning">
          ➕ Thêm khoản
        </Button>
      </DialogActions>
    </Dialog>
  );
}
