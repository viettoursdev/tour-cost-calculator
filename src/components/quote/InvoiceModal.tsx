import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { fmtVND, type Totals } from './calc';
import { exportInvoicePDF, type InvoiceCustomer } from '@/lib/exports/exportInvoicePDF';
import type { QuoteDraft, User } from '@/types';

const LS_CUSTOMER = 'vte_last_customer';
const LS_TERMS = 'vte_payment_terms';

const DEFAULT_TERMS_VI =
  '1. Thanh toán 70% sau khi ký hợp đồng\n' +
  '2. Thanh toán 30% còn lại trước ngày khởi hành\n' +
  '3. Báo giá có hiệu lực 7 ngày · Đã bao gồm VAT\n' +
  '4. Chuyển khoản: [Tên ngân hàng] - [Số tài khoản] - [Chủ tài khoản]';

const DEFAULT_TERMS_EN =
  '1. 70% payment after contract signing\n' +
  '2. Remaining 30% before departure\n' +
  '3. Quote valid for 7 days · Inclusive of VAT\n' +
  '4. Bank transfer: [Bank name] - [Account no.] - [Account holder]';

const EMPTY_CUSTOMER: InvoiceCustomer = { name: '', company: '', phone: '', email: '' };

function readCustomer(): InvoiceCustomer {
  try {
    const raw = localStorage.getItem(LS_CUSTOMER);
    if (!raw) return EMPTY_CUSTOMER;
    return { ...EMPTY_CUSTOMER, ...(JSON.parse(raw) as InvoiceCustomer) };
  } catch {
    return EMPTY_CUSTOMER;
  }
}

function readTerms(): string {
  try {
    return localStorage.getItem(LS_TERMS) || DEFAULT_TERMS_VI;
  } catch {
    return DEFAULT_TERMS_VI;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  draft: QuoteDraft;
  totals: Totals;
  user: User;
};

export function InvoiceModal({ open, onClose, draft, totals, user }: Props) {
  const [customer, setCustomer] = useState<InvoiceCustomer>(EMPTY_CUSTOMER);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_TERMS_VI);
  const [editTerms, setEditTerms] = useState(false);

  // Hydrate from localStorage every time the modal opens, so external changes
  // from another tab are picked up.
  useEffect(() => {
    if (!open) return;
    setCustomer(readCustomer());
    setPaymentTerms(readTerms());
    setEditTerms(false);
  }, [open]);

  const setField = <K extends keyof InvoiceCustomer>(k: K, v: InvoiceCustomer[K]) =>
    setCustomer((p) => ({ ...p, [k]: v }));

  const grandTotal = totals.grandTotal;
  const canExport = !!customer.name.trim();

  const handleExport = () => {
    if (!canExport) return;
    try { localStorage.setItem(LS_CUSTOMER, JSON.stringify(customer)); } catch { /* ignore */ }
    try { localStorage.setItem(LS_TERMS, paymentTerms); } catch { /* ignore */ }
    exportInvoicePDF({
      draft,
      totals,
      customer,
      lang,
      paymentTerms,
      savedBy: { name: user.name },
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>🧾 Xuất Invoice cho khách hàng</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Điền thông tin khách để tạo hoá đơn chuẩn doanh nghiệp
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Tên khách hàng / Customer name *"
            value={customer.name}
            onChange={(e) => setField('name', e.target.value)}
            size="small" fullWidth autoFocus
            placeholder="VD: Nguyễn Văn A"
          />
          <TextField
            label="Công ty / Company"
            value={customer.company}
            onChange={(e) => setField('company', e.target.value)}
            size="small" fullWidth
            placeholder="VD: Công ty TNHH ABC"
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Điện thoại / Phone"
              value={customer.phone}
              onChange={(e) => setField('phone', e.target.value)}
              size="small" fullWidth
              placeholder="09xx xxx xxx"
            />
            <TextField
              label="Email"
              value={customer.email}
              onChange={(e) => setField('email', e.target.value)}
              size="small" fullWidth
              placeholder="email@company.com"
            />
          </Stack>

          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Ngôn ngữ Invoice / Invoice language
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={lang}
              onChange={(_, v: 'vi' | 'en' | null) => v && setLang(v)}
              size="small"
              fullWidth
            >
              <ToggleButton value="vi">🇻🇳 Tiếng Việt</ToggleButton>
              <ToggleButton value="en">🇬🇧 English</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Điều khoản thanh toán / Payment terms
              </Typography>
              <Stack direction="row" spacing={0.75}>
                <Button
                  size="small"
                  color="warning"
                  variant="outlined"
                  onClick={() => setPaymentTerms(lang === 'en' ? DEFAULT_TERMS_EN : DEFAULT_TERMS_VI)}
                  sx={{ fontSize: 11, px: 1.25, py: 0.25 }}
                >
                  ↺ Mặc định
                </Button>
                <Button
                  size="small"
                  variant={editTerms ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setEditTerms((e) => !e)}
                  sx={{ fontSize: 11, px: 1.25, py: 0.25 }}
                >
                  {editTerms ? '✓ Xong' : '✏️ Sửa'}
                </Button>
              </Stack>
            </Stack>
            {editTerms ? (
              <TextField
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                multiline
                minRows={5}
                fullWidth
                size="small"
                placeholder="Mỗi dòng một điều khoản..."
              />
            ) : (
              <Box
                sx={{
                  bgcolor: 'rgba(168,230,221,0.15)',
                  border: '1px solid rgba(20,150,140,0.15)',
                  borderRadius: 1.5,
                  px: 1.75, py: 1.25,
                  fontSize: 12,
                  color: 'text.secondary',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-line',
                }}
              >
                {paymentTerms}
              </Box>
            )}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled' }}>
              💾 Mỗi dòng là 1 điều khoản · Tự lưu làm mặc định cho lần sau
            </Typography>
          </Box>

          <Box sx={{ p: 2, bgcolor: 'rgba(168,230,221,0.2)', borderRadius: 1.5, border: '1px solid rgba(20,150,140,0.2)' }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#0d7a6a', letterSpacing: 1, textTransform: 'uppercase' }}>
              Tóm tắt hoá đơn
            </Typography>
            <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 13, mt: 1 }}>
              <span style={{ color: 'rgba(15,58,74,0.65)' }}>Tour:</span>
              <strong>{draft.info.name}</strong>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 13, mt: 0.5 }}>
              <span style={{ color: 'rgba(15,58,74,0.65)' }}>Số khách:</span>
              <strong>{draft.pax} khách</strong>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 13, mt: 0.5 }}>
              <span style={{ color: 'rgba(15,58,74,0.65)' }}>Giá / khách:</span>
              <strong>{fmtVND(totals.roundedPPax)}</strong>
            </Stack>
            <Stack
              direction="row"
              justifyContent="space-between"
              sx={{
                fontSize: 15, pt: 1, mt: 1,
                borderTop: '1px solid rgba(20,150,140,0.2)',
              }}
            >
              <span style={{ color: '#0d7a6a', fontWeight: 700 }}>TỔNG CỘNG:</span>
              <strong style={{ color: '#dc3250', fontWeight: 900 }}>{fmtVND(grandTotal)}</strong>
            </Stack>
          </Box>

          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.6 }}>
            💡 Invoice sẽ gồm: số hoá đơn tự động · chi tiết hạng mục · số tiền bằng chữ · điều khoản thanh toán · chữ ký 2 bên.
            Một số trường công ty (MST, địa chỉ, STK) cần điền sau khi tải về.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button onClick={handleExport} disabled={!canExport} variant="contained" color="primary">
          🧾 Tạo & Tải Invoice PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
