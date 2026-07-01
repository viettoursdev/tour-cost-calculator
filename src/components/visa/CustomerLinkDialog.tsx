import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, List, ListItemButton, ListItemText, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import LinkIcon from '@mui/icons-material/Link';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerStore } from '@/stores/customerStore';
import type { Customer, Passenger, TravelerDoc } from '@/types';
import {
  customerFromPassenger, findCustomerMatches, linkPatch, searchCustomers, travelerFromPassenger,
} from './customerLink';

const REASON_LABEL: Record<string, string> = { passport: 'trùng hộ chiếu', 'name+dob': 'trùng tên + ngày sinh', name: 'trùng tên' };

/**
 * Gắn một khách xin visa vào hồ sơ Khách hàng (CRM) — chọn khách có sẵn (+ hồ sơ
 * giấy tờ), hoặc tạo khách hàng mới từ chính khách này. Sau khi gắn, danh tính/hộ
 * chiếu của khách hàng là nguồn sự thật (đồng bộ 1 chạm ở màn quản lý khách visa).
 */
export function CustomerLinkDialog({ applicant, onLink, onClose }: {
  applicant: Passenger;
  onLink: (patch: Partial<Passenger>) => void;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.currentUser);
  const customers = useCustomerStore((s) => s.customers);
  const saveCustomer = useCustomerStore((s) => s.save);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => findCustomerMatches(applicant, customers), [applicant, customers]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.customer.id)), [matches]);
  const results = useMemo(
    () => searchCustomers(customers, q).filter((c) => !matchIds.has(c.id)).slice(0, 30),
    [customers, q, matchIds],
  );

  // Gắn vào một traveler cụ thể (hoặc mức khách nếu không có traveler).
  const linkTo = (customer: Customer, traveler?: TravelerDoc) => {
    onLink(linkPatch(customer, traveler));
    toast(`🔗 Đã gắn khách vào hồ sơ "${customer.name}".`);
    onClose();
  };

  // Gắn vào khách chưa có hồ sơ giấy tờ khớp → tạo TravelerDoc từ applicant rồi lưu.
  const linkAndCreateTraveler = async (customer: Customer) => {
    setBusy(true);
    const traveler = travelerFromPassenger(applicant, user);
    const ok = await saveCustomer({ ...customer, travelers: [...(customer.travelers ?? []), traveler] });
    setBusy(false);
    if (!ok) return; // store đã rollback + báo lỗi
    onLink(linkPatch(customer, traveler));
    toast(`🔗 Đã tạo hồ sơ giấy tờ trong "${customer.name}" và gắn khách.`);
    onClose();
  };

  // Tạo khách hàng cá nhân mới từ khách visa này rồi gắn.
  const createCustomer = async () => {
    if (!(applicant.name ?? '').trim()) { toast('Khách chưa có tên — nhập tên trước khi tạo khách hàng.', 'warning'); return; }
    setBusy(true);
    const { customer, traveler } = customerFromPassenger(applicant, user);
    const ok = await saveCustomer(customer);
    setBusy(false);
    if (!ok) return;
    onLink(linkPatch(customer, traveler));
    toast(`✅ Đã tạo khách hàng "${customer.name}" và gắn khách.`);
    onClose();
  };

  const renderCustomer = (c: Customer, reason?: string) => {
    const travelers = c.travelers ?? [];
    return (
      <Box key={c.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1, mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography fontWeight={800} sx={{ flex: 1, minWidth: 140 }}>
            {c.name} <Typography component="span" variant="caption" color="text.secondary">· {c.type === 'company' ? 'Doanh nghiệp' : 'Cá nhân'}</Typography>
          </Typography>
          {reason && <Chip size="small" color="success" variant="outlined" label={REASON_LABEL[reason] ?? reason} />}
          <Button size="small" variant="outlined" startIcon={<LinkIcon />} disabled={busy}
            onClick={() => (travelers.length ? linkTo(c) : void linkAndCreateTraveler(c))}>
            {travelers.length ? 'Gắn ở mức khách' : 'Gắn + tạo hồ sơ giấy tờ'}
          </Button>
        </Stack>
        {travelers.length > 0 && (
          <List dense disablePadding sx={{ mt: 0.5 }}>
            {travelers.map((t) => (
              <ListItemButton key={t.id} onClick={() => linkTo(c, t)} disabled={busy} sx={{ borderRadius: 1 }}>
                <ListItemText
                  primary={t.fullName || '(chưa đặt tên)'}
                  secondary={[t.passportNo ? `HC ${t.passportNo}` : '', t.dob ? `NS ${t.dob}` : ''].filter(Boolean).join(' · ') || 'chưa có hộ chiếu'}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
                />
                <Chip size="small" icon={<LinkIcon fontSize="small" />} label="Gắn hồ sơ này" />
              </ListItemButton>
            ))}
            <ListItemButton onClick={() => void linkAndCreateTraveler(c)} disabled={busy} sx={{ borderRadius: 1, color: '#0d7a6a' }}>
              <ListItemText primary="+ Tạo hồ sơ giấy tờ mới từ khách này" primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }} />
            </ListItemButton>
          </List>
        )}
      </Box>
    );
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        🔗 Gắn khách vào hồ sơ khách hàng
        <IconButton onClick={onClose} disabled={busy} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Khách: <strong>{applicant.name || '(chưa đặt tên)'}</strong>
          {applicant.idNo ? ` · HC ${applicant.idNo}` : ''}{applicant.dob ? ` · NS ${applicant.dob}` : ''}
        </Typography>

        {matches.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={800} color="success.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Gợi ý khớp ({matches.length})
            </Typography>
            <Box sx={{ mt: 0.5 }}>{matches.map((m) => renderCustomer(m.customer, m.reason))}</Box>
          </Box>
        )}

        <TextField
          fullWidth size="small" placeholder="Tìm khách hàng theo tên / hộ chiếu / SĐT…" value={q}
          onChange={(e) => setQ(e.target.value)} autoFocus
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1 }}
        />
        {results.length === 0 ? (
          <Alert severity="info" variant="outlined">
            {q.trim() ? 'Không tìm thấy khách hàng khớp.' : 'Gõ để tìm, hoặc tạo khách hàng mới bên dưới.'}
          </Alert>
        ) : (
          <Box>{results.map((c) => renderCustomer(c))}</Box>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
        <Tooltip title="Tạo một khách hàng cá nhân mới từ chính khách visa này (kèm hồ sơ hộ chiếu)">
          <Button startIcon={<PersonAddAlt1Icon />} variant="contained" disabled={busy}
            onClick={() => void createCustomer()} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            Tạo khách hàng mới từ khách này
          </Button>
        </Tooltip>
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
