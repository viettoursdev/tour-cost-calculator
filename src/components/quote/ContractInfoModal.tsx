import { useMemo, useState } from 'react';
import {
  Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, Typography,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import { useCustomerStore } from '@/stores/customerStore';
import { exportContractPDF } from '@/lib/exports/exportContractPDF';
import { LEGACY } from '@/theme';
import type { Contract, ContractPartyB, Customer } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Contract pre-built from the current quote draft (without partyB). */
  baseContract: Contract;
};

const EMPTY_B: ContractPartyB = { name: '', address: '', tel: '', rep: '', title: 'Giám đốc', taxCode: '', email: '' };

/** Best-effort extraction of address / tax code stored in a customer's note. */
function parseNote(note: string): { address: string; taxCode: string } {
  const address = /Địa chỉ:\s*(.*)/i.exec(note)?.[1]?.trim() ?? '';
  const taxCode = /MST:\s*(\S+)/i.exec(note)?.[1]?.trim() ?? '';
  return { address, taxCode };
}

export function ContractInfoModal({ open, onClose, baseContract }: Props) {
  const customers = useCustomerStore((s) => s.customers);
  const saveCustomer = useCustomerStore((s) => s.save);

  const [form, setForm] = useState<ContractPartyB>(EMPTY_B);
  const [picked, setPicked] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const setF = <K extends keyof ContractPartyB>(k: K, v: ContractPartyB[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const companyOptions = useMemo(() => customers, [customers]);

  const prefillFrom = (c: Customer | null) => {
    setPicked(c);
    if (!c) return;
    const contact = c.contacts[0];
    const legacy = parseNote(c.note ?? '');
    setForm({
      name: c.name,
      address: c.address || legacy.address,
      taxCode: c.taxCode || legacy.taxCode,
      tel: contact?.phone ?? '',
      rep: contact?.name ?? '',
      title: contact?.position || 'Giám đốc',
      email: contact?.email ?? '',
    });
  };

  const handleConfirm = async () => {
    if (!form.name.trim()) { window.alert('Vui lòng nhập tên khách hàng / công ty'); return; }
    setBusy(true);
    try {
      // 1) Export the contract PDF with the filled Bên B info.
      exportContractPDF({ ...baseContract, partyB: { ...form } });

      // 2) Save back into the customer list (update if an existing one was picked).
      const customer: Customer = {
        id: picked?.id ?? '',
        name: form.name.trim(),
        type: 'company',
        address: form.address.trim(),
        taxCode: form.taxCode.trim(),
        contacts: [{
          name: form.rep.trim(),
          phone: form.tel.trim(),
          email: form.email.trim(),
          position: form.title.trim(),
        }],
        note: picked?.note ?? '',
        createdAt: picked?.createdAt ?? new Date().toISOString(),
        createdBy: picked?.createdBy ?? '',
      };
      await saveCustomer(customer);
      onClose();
      setForm(EMPTY_B);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: LEGACY.headerGradient, color: '#fff', fontWeight: 800 }}>
        📜 Thông tin hợp đồng (Bên B)
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
          Nhập thông tin khách hàng để xuất hợp đồng. Thông tin sẽ được lưu vào <strong>Danh sách khách hàng</strong>.
        </Typography>
        <Stack spacing={1.75}>
          <Autocomplete
            size="small"
            options={companyOptions}
            value={picked}
            onChange={(_, v) => prefillFrom(v)}
            getOptionLabel={(c) => c.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} label="Chọn khách hàng có sẵn (tuỳ chọn — để cập nhật)" />
            )}
          />
          <TextField
            label="Tên khách hàng / Công ty *" size="small" fullWidth
            value={form.name} onChange={(e) => setF('name', e.target.value)}
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Mã số thuế" size="small" fullWidth
              value={form.taxCode} onChange={(e) => setF('taxCode', e.target.value)}
            />
            <TextField
              label="Điện thoại" size="small" fullWidth
              value={form.tel} onChange={(e) => setF('tel', e.target.value)}
            />
          </Stack>
          <TextField
            label="Địa chỉ" size="small" fullWidth multiline
            value={form.address} onChange={(e) => setF('address', e.target.value)}
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Người đại diện" size="small" fullWidth
              value={form.rep} onChange={(e) => setF('rep', e.target.value)}
            />
            <TextField
              label="Chức vụ" size="small" fullWidth
              value={form.title} onChange={(e) => setF('title', e.target.value)}
            />
          </Stack>
          <TextField
            label="Email" size="small" fullWidth
            value={form.email} onChange={(e) => setF('email', e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button
          variant="contained" startIcon={<DescriptionIcon />} onClick={handleConfirm} disabled={busy}
          sx={{ fontWeight: 700, background: LEGACY.headerGradient }}
        >
          {busy ? 'Đang xử lý…' : 'Xuất hợp đồng & Lưu khách hàng'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
