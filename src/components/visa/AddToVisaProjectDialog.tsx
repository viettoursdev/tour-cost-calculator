import { useMemo, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { toast } from '@/stores/toastStore';
import { normalizeVN } from '@/lib/search';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { countsFromApplicants, newVisaApplicant } from './constants';
import { normPassport } from './applicantMatch';
import { identityFromTraveler } from './customerLink';
import type { Customer, TravelerDoc, VisaApplicant, VisaProjectDoc } from '@/types';

/** Dựng một applicant từ hồ sơ giấy tờ của khách, gắn sẵn liên kết CRM. */
function applicantFromTraveler(customer: Customer, traveler: TravelerDoc): VisaApplicant {
  const idn = identityFromTraveler(traveler);
  return {
    ...newVisaApplicant(),
    name: idn.name || traveler.fullName || '',
    gender: idn.gender === 'M' ? 'Nam' : idn.gender === 'F' ? 'Nữ' : '',
    dob: idn.dob,
    passport: idn.idNo,
    passportIssue: idn.passportIssue,
    passportExpiry: idn.passportExpiry,
    countriesVisited: '',
    customerId: customer.id,
    customerName: customer.name,
    travelerId: traveler.id,
  };
}

/**
 * Thêm một người (hồ sơ giấy tờ của khách hàng) vào một bộ hồ sơ visa đang có —
 * chiều NGƯỢC của việc gắn khách. Applicant tạo ra mang sẵn liên kết customerId/
 * travelerId để hai danh sách đồng bộ.
 */
export function AddToVisaProjectDialog({ customer, traveler, onClose }: {
  customer: Customer; traveler: TravelerDoc; onClose: () => void;
}) {
  const projects = useVisaProjectStore((s) => s.projects);
  const save = useVisaProjectStore((s) => s.save);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const nq = normalizeVN(q);
    const sorted = [...projects].sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
    if (!nq) return sorted.slice(0, 30);
    return sorted.filter((p) => normalizeVN(`${p.name} ${p.country} ${p.code}`).includes(nq)).slice(0, 30);
  }, [projects, q]);

  const addTo = async (proj: VisaProjectDoc) => {
    const fresh = useVisaProjectStore.getState().projects.find((p) => p.id === proj.id) ?? proj;
    const existing = fresh.applicants ?? [];
    const pass = normPassport(traveler.passportNo);
    const dup = existing.find((a) => (a.travelerId && a.travelerId === traveler.id) || (pass && normPassport(a.passport) === pass));
    if (dup) { toast('Người này đã có trong bộ hồ sơ visa đó.', 'warning'); return; }
    setBusy(true);
    const applicants = [...existing, applicantFromTraveler(customer, traveler)];
    await save({ ...fresh, applicants, ...countsFromApplicants(applicants) });
    setBusy(false);
    toast(`✅ Đã thêm "${traveler.fullName || 'khách'}" vào hồ sơ visa "${proj.name || proj.code}".`);
    onClose();
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        🛂 Thêm vào hồ sơ visa
        <IconButton onClick={onClose} disabled={busy} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Người: <strong>{traveler.fullName || '(chưa có tên)'}</strong>
          {traveler.passportNo ? ` · HC ${traveler.passportNo}` : ''} — từ khách <strong>{customer.name}</strong>
        </Typography>
        <TextField
          fullWidth size="small" placeholder="Tìm bộ hồ sơ visa theo tên / nước / mã…" value={q}
          onChange={(e) => setQ(e.target.value)} autoFocus
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1 }}
        />
        {results.length === 0 ? (
          <Alert severity="info" variant="outlined">Chưa có bộ hồ sơ visa nào khớp. Tạo bộ hồ sơ trong phần Quản lý Visa hoặc từ báo giá.</Alert>
        ) : (
          <List dense disablePadding>
            {results.map((p) => (
              <ListItemButton key={p.id} onClick={() => void addTo(p)} disabled={busy} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 0.75 }}>
                <ListItemText
                  primary={p.name || p.code || '(chưa đặt tên)'}
                  secondary={[p.country, p.code, `${p.applicants?.length ?? 0} khách`].filter(Boolean).join(' · ')}
                  primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }}
                />
                <Chip size="small" label="Thêm vào đây" color="primary" variant="outlined" />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Đóng</Button></DialogActions>
    </Dialog>
  );
}
