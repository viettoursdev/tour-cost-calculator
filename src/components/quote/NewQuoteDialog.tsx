import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import PublicIcon from '@mui/icons-material/Public';
import EventIcon from '@mui/icons-material/Event';
import AlarmIcon from '@mui/icons-material/Alarm';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerStore } from '@/stores/customerStore';
import { TPL_ACCENT } from './templateStyle';
import { LEGACY } from '@/theme';
import type { Customer, NewQuoteMeta, QuoteRequestKind, User } from '@/types';

type Props = {
  open: boolean;
  /** Loại báo giá người dùng vừa chọn từ thẻ (nội địa / nước ngoài). */
  initialTemplate: 'domestic' | 'intl';
  onClose: () => void;
  /** Tạo báo giá với template + metadata đã nhập. */
  onConfirm: (template: 'domestic' | 'intl', meta: NewQuoteMeta) => void;
};

const REQUEST_LABEL: Record<QuoteRequestKind, string> = {
  request: 'Request tour',
  thau: 'Thầu',
};

/**
 * Bảng nhập thông tin báo giá khi bấm "Tạo báo giá mới" (chỉ báo giá nội địa/nước
 * ngoài). Thu thập loại báo giá, yêu cầu, tên tour, khách hàng, số ngày/đêm, ngày
 * khởi hành dự kiến, deadline (hệ thống nhắc trước 1 ngày & 6 giờ) và cộng tác viên.
 */
export function NewQuoteDialog({ open, initialTemplate, onClose, onConfirm }: Props) {
  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser);
  const customers = useCustomerStore((s) => s.customers);

  const [template, setTemplate] = useState<'domestic' | 'intl'>(initialTemplate);
  const [request, setRequest] = useState<QuoteRequestKind>('request');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerInput, setCustomerInput] = useState('');
  const [days, setDays] = useState(1);
  const [nights, setNights] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [collabUsers, setCollabUsers] = useState<User[]>([]);

  // Mở mới → reset về mặc định theo thẻ vừa chọn.
  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate);
    setRequest('request');
    setName('');
    setCustomer(null);
    setCustomerInput('');
    setDays(1);
    setNights(0);
    setStartDate('');
    setDeadline('');
    setCollabUsers([]);
  }, [open, initialTemplate]);

  const otherUsers = useMemo(
    () => users.filter((u) => u.u !== currentUser?.u),
    [users, currentUser?.u],
  );

  const handleDays = (v: number) => {
    const d = Math.max(1, v || 1);
    setDays(d);
    // Gợi ý số đêm = ngày - 1 (vẫn sửa tay được sau đó).
    setNights(Math.max(0, d - 1));
  };

  const submit = () => {
    const typed = customerInput.trim();
    const matched = customer
      ?? (typed ? customers.find((c) => c.name.trim().toLowerCase() === typed.toLowerCase()) ?? null : null);
    const meta: NewQuoteMeta = {
      request,
      name: name.trim(),
      customerId: matched?.id,
      // Tên mới (chưa có trong danh sách) vẫn mang theo để hộp thoại Lưu cloud tự tạo.
      customerName: matched?.name ?? (typed || undefined),
      days,
      nights,
      startDate: startDate || null,
      deadline: deadline || undefined,
      collaborators: collabUsers.map((u) => ({ u: u.u, name: u.name })),
    };
    onConfirm(template, meta);
  };

  const ac = TPL_ACCENT[template];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '12px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: ac.grad, color: '#fff',
            boxShadow: `0 6px 16px ${ac.accent}55`, '& svg': { fontSize: 22 },
          }}>
            <ac.Icon />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: 18, color: LEGACY.navy, lineHeight: 1.2 }}>
              Tạo báo giá mới
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Nhập thông tin báo giá — hệ thống tự nhắc deadline
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ mt: 0.5 }}>
          {/* Báo giá: Nội địa / Nước ngoài */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Báo giá
            </Typography>
            <ToggleButtonGroup
              exclusive size="small" value={template}
              onChange={(_, v: 'domestic' | 'intl' | null) => { if (v) setTemplate(v); }}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2 } }}
            >
              <ToggleButton value="domestic"><PlaceIcon fontSize="small" sx={{ mr: 0.75 }} />Nội địa</ToggleButton>
              <ToggleButton value="intl"><PublicIcon fontSize="small" sx={{ mr: 0.75 }} />Nước ngoài</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Yêu cầu: Request tour / Thầu */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Yêu cầu
            </Typography>
            <ToggleButtonGroup
              exclusive size="small" value={request}
              onChange={(_, v: QuoteRequestKind | null) => { if (v) setRequest(v); }}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2 } }}
            >
              <ToggleButton value="request">{REQUEST_LABEL.request}</ToggleButton>
              <ToggleButton value="thau">{REQUEST_LABEL.thau}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label="Tên tour" required value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Đà Lạt 3N2Đ – Đoàn ABC"
          />

          {/* Khách hàng — freeSolo: cho nhập khách chưa có (tự lưu khi lưu cloud). */}
          <Autocomplete
            freeSolo options={customers} value={customer} inputValue={customerInput}
            onInputChange={(_, v) => setCustomerInput(v)}
            onChange={(_, v) => {
              if (v && typeof v !== 'string') { setCustomer(v); setCustomerInput(v.name); }
              else { setCustomer(null); if (typeof v === 'string') setCustomerInput(v); }
            }}
            getOptionLabel={(c) => (typeof c === 'string' ? c : c.name)}
            isOptionEqualToValue={(a, b) => typeof a !== 'string' && typeof b !== 'string' && a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} label="Khách hàng" placeholder="Chọn hoặc gõ tên khách mới" />
            )}
          />

          {/* Ngày tour: ... ngày ... đêm */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Ngày tour
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                type="number" size="small" value={days} sx={{ flex: 1 }}
                onChange={(e) => handleDays(Number(e.target.value))}
                inputProps={{ min: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">ngày</InputAdornment> }}
              />
              <TextField
                type="number" size="small" value={nights} sx={{ flex: 1 }}
                onChange={(e) => setNights(Math.max(0, Number(e.target.value) || 0))}
                inputProps={{ min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">đêm</InputAdornment> }}
              />
            </Stack>
          </Box>

          <TextField
            label="Ngày khởi hành dự kiến" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon fontSize="small" /></InputAdornment> }}
          />

          <Divider flexItem />

          <TextField
            label="Deadline" type="datetime-local" value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            InputLabelProps={{ shrink: true }}
            InputProps={{ startAdornment: <InputAdornment position="start"><AlarmIcon fontSize="small" /></InputAdornment> }}
            helperText="Hệ thống tự nhắc trước 1 ngày và trước 6 giờ. (Nhắc theo bản đã lưu cloud)"
          />

          {/* Thêm nhân sự collab */}
          <Autocomplete
            multiple options={otherUsers} value={collabUsers}
            onChange={(_, v) => setCollabUsers(v)}
            getOptionLabel={(u) => `${u.name} (${u.role})`}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) =>
              value.map((u, idx) => {
                const { key, ...tagProps } = getTagProps({ index: idx });
                return <Chip key={key} {...tagProps} label={u.name} />;
              })
            }
            renderInput={(params) => (
              <TextField {...params} label="Thêm nhân sự collab" placeholder="Chọn người cùng làm báo giá" />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Huỷ</Button>
        <Button
          variant="contained" disabled={!name.trim()} onClick={submit}
          sx={{ background: LEGACY.headerGradient, fontWeight: 800, px: 3 }}
        >
          Tạo báo giá
        </Button>
      </DialogActions>
    </Dialog>
  );
}
