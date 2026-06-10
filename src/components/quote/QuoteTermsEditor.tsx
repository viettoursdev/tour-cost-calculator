import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useQuoteStore } from '@/stores/quoteStore';
import { DEFAULT_INCLUDES, DEFAULT_EXCLUDES, DEFAULT_PAYMENTS } from '@/components/contract/constants';
import { LEGACY } from '@/theme';
import type { QuotePayment } from '@/types';

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

export function QuoteTermsEditor() {
  const inclusions = useQuoteStore((s) => s.draft.inclusions);
  const exclusions = useQuoteStore((s) => s.draft.exclusions);
  const payments = useQuoteStore((s) => s.draft.payments);
  const setInclusions = useQuoteStore((s) => s.setInclusions);
  const setExclusions = useQuoteStore((s) => s.setExclusions);
  const setPayments = useQuoteStore((s) => s.setPayments);

  return (
    <Box sx={{ mt: 3 }}>
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
    </Box>
  );
}
