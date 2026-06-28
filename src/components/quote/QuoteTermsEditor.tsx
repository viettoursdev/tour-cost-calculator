import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useQuoteStore } from '@/stores/quoteStore';
import { DEFAULT_INCLUDES, DEFAULT_EXCLUDES, DEFAULT_PAYMENTS, DEFAULT_CANCELS } from '@/components/contract/constants';
import {
  DEFAULT_VALID_DAYS, addDaysISO, effectiveValidUntil, fmtDateVN, isoDate, validityStatus,
} from './quoteValidity';
import { LEGACY } from '@/theme';
import type { ContractCancel, QuotePayment } from '@/types';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        color: 'rgba(15,58,74,0.55)', fontSize: 11, fontWeight: 700,
        letterSpacing: 2, textTransform: 'uppercase', mb: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

/** Reusable bullet-list editor (one line per string), legacy-style. */
function ListEditor({
  items, onChange, color, addLabel, onSeed, placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  color: string;
  addLabel: string;
  onSeed: () => void;
  placeholder: string;
}) {
  const setAt = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const removeAt = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, '']);

  return (
    <Stack spacing={1}>
      {items.length === 0 && (
        <Typography fontSize={13} sx={{ color: 'rgba(15,58,74,0.4)', fontStyle: 'italic' }}>
          Chưa có dòng nào.
        </Typography>
      )}
      {items.map((line, i) => (
        <Stack key={i} direction="row" spacing={0.5} alignItems="flex-start">
          <Box sx={{ color, fontWeight: 800, lineHeight: '38px', pl: 0.5 }}>•</Box>
          <TextField
            size="small" fullWidth multiline value={line}
            placeholder={placeholder}
            onChange={(e) => setAt(i, e.target.value)}
          />
          <IconButton size="small" color="error" onClick={() => removeAt(i)} sx={{ mt: 0.5 }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ color }}>
          {addLabel}
        </Button>
        <Button size="small" startIcon={<AutoFixHighIcon />} onClick={onSeed} sx={{ color: 'rgba(15,58,74,0.55)' }}>
          Dùng mẫu mặc định
        </Button>
      </Stack>
    </Stack>
  );
}

/** Payment instalments editor (đợt 1, đợt 2…). */
function PaymentEditor({
  payments, onChange,
}: {
  payments: QuotePayment[];
  onChange: (next: QuotePayment[]) => void;
}) {
  const setAt = (i: number, patch: Partial<QuotePayment>) =>
    onChange(payments.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const removeAt = (i: number) => onChange(payments.filter((_, j) => j !== i));
  const add = () =>
    onChange([
      ...payments,
      { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: `Đợt ${payments.length + 1}`, amount: 0, note: '' },
    ]);
  const seed = () =>
    onChange(DEFAULT_PAYMENTS.map((p) => ({ id: p.id, label: p.label, amount: 0, note: p.note })));

  return (
    <Stack spacing={1.25}>
      {payments.length === 0 && (
        <Typography fontSize={13} sx={{ color: 'rgba(15,58,74,0.4)', fontStyle: 'italic' }}>
          Chưa có đợt thanh toán nào.
        </Typography>
      )}
      {payments.map((p, i) => (
        <Paper key={p.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              size="small" label="Tên đợt" value={p.label} sx={{ flex: 1 }}
              onChange={(e) => setAt(i, { label: e.target.value })}
            />
            <TextField
              size="small" label="Số tiền (VND)" type="number" value={p.amount || ''}
              onChange={(e) => setAt(i, { amount: Math.max(0, Number(e.target.value) || 0) })}
              sx={{ width: 160 }}
              slotProps={{ htmlInput: { min: 0, step: 1000000, style: { textAlign: 'right' } } }}
            />
            <IconButton size="small" color="error" onClick={() => removeAt(i)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
          <TextField
            size="small" fullWidth multiline label="Điều kiện / thời hạn" value={p.note}
            placeholder="vd: Trong vòng 07 ngày sau khi ký hợp đồng"
            onChange={(e) => setAt(i, { note: e.target.value })}
          />
        </Paper>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ color: LEGACY.teal }}>
          Thêm đợt
        </Button>
        <Button size="small" startIcon={<AutoFixHighIcon />} onClick={seed} sx={{ color: 'rgba(15,58,74,0.55)' }}>
          Dùng mẫu mặc định
        </Button>
      </Stack>
    </Stack>
  );
}

/** Chính sách huỷ tour (mốc thời gian → % phạt). Tái dùng cấu trúc của hợp đồng. */
function CancellationEditor({
  cancels, onChange,
}: {
  cancels: ContractCancel[];
  onChange: (next: ContractCancel[]) => void;
}) {
  const setAt = (i: number, patch: Partial<ContractCancel>) =>
    onChange(cancels.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeAt = (i: number) => onChange(cancels.filter((_, j) => j !== i));
  const add = () => onChange([...cancels, { when: '', penalty: 0 }]);
  const seed = () => onChange(DEFAULT_CANCELS.map((c) => ({ ...c })));

  return (
    <Stack spacing={1.25}>
      {cancels.length === 0 && (
        <Typography fontSize={13} sx={{ color: 'rgba(15,58,74,0.4)', fontStyle: 'italic' }}>
          Chưa có mốc huỷ nào.
        </Typography>
      )}
      {cancels.map((c, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" label="Mốc huỷ" value={c.when} sx={{ flex: 1 }}
            placeholder="vd: Trong vòng 15 ngày trước khởi hành"
            onChange={(e) => setAt(i, { when: e.target.value })}
          />
          <TextField
            size="small" label="Phạt (%)" type="number" value={c.penalty || ''}
            onChange={(e) => setAt(i, { penalty: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            sx={{ width: 110 }}
            slotProps={{ htmlInput: { min: 0, max: 100, style: { textAlign: 'right' } } }}
          />
          <IconButton size="small" color="error" onClick={() => removeAt(i)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={add} sx={{ color: '#dc3250' }}>
          Thêm mốc huỷ
        </Button>
        <Button size="small" startIcon={<AutoFixHighIcon />} onClick={seed} sx={{ color: 'rgba(15,58,74,0.55)' }}>
          Dùng mẫu mặc định
        </Button>
      </Stack>
    </Stack>
  );
}

/** Hiệu lực báo giá (ngày hết hạn hướng khách) + đóng dấu ngày tỷ giá. */
function ValidityEditor() {
  const validUntil = useQuoteStore((s) => s.draft.validUntil);
  const rateDate = useQuoteStore((s) => s.draft.rateDate);
  const setValidUntil = useQuoteStore((s) => s.setValidUntil);
  const today = isoDate(new Date());
  const effective = effectiveValidUntil(validUntil, today);
  const st = validityStatus(effective);

  return (
    <Box sx={{ mb: 3 }}>
      <SectionLabel>📅 Hiệu lực báo giá &amp; tỷ giá</SectionLabel>
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField
              size="small" type="date" label="Hiệu lực đến hết ngày"
              value={validUntil ?? ''} onChange={(e) => setValidUntil(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }}
              sx={{ width: 200 }}
            />
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {[7, 14, 30].map((d) => (
                <Button
                  key={d} size="small" variant="outlined"
                  onClick={() => setValidUntil(addDaysISO(today, d))}
                  sx={{ minWidth: 0, px: 1.25, color: LEGACY.teal }}
                >
                  +{d} ngày
                </Button>
              ))}
              {validUntil && (
                <Button
                  size="small" onClick={() => setValidUntil(undefined)}
                  sx={{ minWidth: 0, px: 1.25, color: 'rgba(15,58,74,0.55)' }}
                >
                  Xoá hạn
                </Button>
              )}
            </Stack>
          </Stack>
          <Typography fontSize={12.5} sx={{ color: st.expired ? '#dc3250' : 'rgba(15,58,74,0.6)' }}>
            {validUntil ? (
              <>Có hiệu lực đến hết <strong>{fmtDateVN(effective)}</strong>{st.expired ? ' — ĐÃ HẾT HẠN' : st.daysLeft === 0 ? ' — hết hạn hôm nay' : ` — còn ${st.daysLeft} ngày`}.</>
            ) : (
              <>Chưa đặt hạn → mặc định <strong>{DEFAULT_VALID_DAYS} ngày</strong> kể từ ngày báo giá (đến hết {fmtDateVN(effective)}).</>
            )}
          </Typography>
          <Typography fontSize={12} sx={{ color: 'rgba(15,58,74,0.5)' }}>
            💱 Tỷ giá áp dụng: <strong>{rateDate ? fmtDateVN(rateDate) : '— (tự cập nhật khi sửa bảng tỷ giá)'}</strong>. Bản in &amp; link khách sẽ ghi rõ tỷ giá + điều khoản biến động khi báo giá có hạng mục ngoại tệ.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export function QuoteTermsEditor() {
  const inclusions = useQuoteStore((s) => s.draft.inclusions);
  const exclusions = useQuoteStore((s) => s.draft.exclusions);
  const payments = useQuoteStore((s) => s.draft.payments);
  const cancellation = useQuoteStore((s) => s.draft.cancellation);
  const setInclusions = useQuoteStore((s) => s.setInclusions);
  const setExclusions = useQuoteStore((s) => s.setExclusions);
  const setPayments = useQuoteStore((s) => s.setPayments);
  const setCancellation = useQuoteStore((s) => s.setCancellation);

  return (
    <Box sx={{ mt: 3 }}>
      <ValidityEditor />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Box>
          <SectionLabel>✅ Giá bao gồm</SectionLabel>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <ListEditor
              items={inclusions ?? []}
              onChange={setInclusions}
              onSeed={() => setInclusions([...DEFAULT_INCLUDES])}
              color={LEGACY.teal}
              addLabel="Thêm mục bao gồm"
              placeholder="vd: Vé máy bay khứ hồi hạng phổ thông…"
            />
          </Paper>
        </Box>
        <Box>
          <SectionLabel>🚫 Giá không bao gồm</SectionLabel>
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
            <ListEditor
              items={exclusions ?? []}
              onChange={setExclusions}
              onSeed={() => setExclusions([...DEFAULT_EXCLUDES])}
              color="#dc3250"
              addLabel="Thêm mục không bao gồm"
              placeholder="vd: Chi phí làm hộ chiếu…"
            />
          </Paper>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <SectionLabel>🧾 Thông tin thanh toán</SectionLabel>
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
          <PaymentEditor payments={payments ?? []} onChange={setPayments} />
        </Paper>
      </Box>

      <Box sx={{ mt: 3 }}>
        <SectionLabel>🚷 Chính sách huỷ tour</SectionLabel>
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
          <CancellationEditor cancels={cancellation ?? []} onChange={setCancellation} />
        </Paper>
      </Box>
    </Box>
  );
}
