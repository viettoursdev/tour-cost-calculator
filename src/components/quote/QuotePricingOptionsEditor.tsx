import {
  Box, Button, IconButton, MenuItem, Paper, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuoteStore } from '@/stores/quoteStore';
import { computeTotals, fmtVND } from './calc';
import { DEFAULT_PRICING_OPTIONS, resolveMod } from './pricing';
import { LEGACY } from '@/theme';
import type { PriceMod, QuotePricingOptions } from '@/types';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ color: 'rgba(15,58,74,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', mb: 1.5 }}>
      {children}
    </Typography>
  );
}

/** One fixed add-on row (single-room supplement, infant, child, tips). */
function ModRow({
  label, mod, adultPPax, onChange,
}: {
  label: string;
  mod: PriceMod;
  adultPPax: number;
  onChange: (m: PriceMod) => void;
}) {
  const resolved = resolveMod(mod, adultPPax);
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ opacity: mod.enabled ? 1 : 0.55 }}>
      <Switch size="small" checked={mod.enabled} onChange={(e) => onChange({ ...mod, enabled: e.target.checked })} />
      <Typography fontSize={13} sx={{ flex: 1, minWidth: 0 }}>{label}</Typography>
      <Select
        size="small" value={mod.mode} disabled={!mod.enabled}
        onChange={(e) => onChange({ ...mod, mode: e.target.value as PriceMod['mode'] })}
        sx={{ width: 88 }}
      >
        <MenuItem value="percent">%</MenuItem>
        <MenuItem value="fixed">VND</MenuItem>
      </Select>
      <TextField
        size="small" type="number" value={mod.value || ''} disabled={!mod.enabled}
        onChange={(e) => onChange({ ...mod, value: Math.max(0, Number(e.target.value) || 0) })}
        sx={{ width: 120 }}
        slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
      />
      <Typography fontSize={13} fontWeight={700} sx={{ color: LEGACY.tealLight, width: 130, textAlign: 'right' }}>
        {mod.enabled ? fmtVND(resolved) : '—'}
      </Typography>
    </Stack>
  );
}

export function QuotePricingOptionsEditor() {
  const draft = useQuoteStore((s) => s.draft);
  const setPricingOptions = useQuoteStore((s) => s.setPricingOptions);
  const opts: QuotePricingOptions = draft.pricingOptions ?? DEFAULT_PRICING_OPTIONS;
  const adultPPax = computeTotals(draft).roundedPPax;

  const patch = (p: Partial<QuotePricingOptions>) => setPricingOptions({ ...opts, ...p });

  const addExtra = () =>
    patch({ extras: [...opts.extras, { id: Date.now().toString(36), label: '', mode: 'fixed', value: 0 }] });
  const setExtra = (i: number, p: Partial<QuotePricingOptions['extras'][number]>) =>
    patch({ extras: opts.extras.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const removeExtra = (i: number) => patch({ extras: opts.extras.filter((_, j) => j !== i) });

  return (
    <Box sx={{ mt: 3 }}>
      <SectionLabel>⚙️ Tuỳ chọn định giá thêm</SectionLabel>
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.25 }}>
        <Stack spacing={1.25}>
          <ModRow label="Phụ thu phòng đơn" mod={opts.singleSupp} adultPPax={adultPPax} onChange={(m) => patch({ singleSupp: m })} />
          <ModRow label="Trẻ em dưới 2 tuổi (em bé)" mod={opts.infant} adultPPax={adultPPax} onChange={(m) => patch({ infant: m })} />
          <ModRow label="Trẻ em 2–12 tuổi" mod={opts.child} adultPPax={adultPPax} onChange={(m) => patch({ child: m })} />
          <ModRow label="Tips / khách" mod={opts.tips} adultPPax={adultPPax} onChange={(m) => patch({ tips: m })} />

          {opts.extras.map((e, i) => (
            <Stack key={e.id} direction="row" spacing={1.25} alignItems="center">
              <TextField
                size="small" placeholder="Tên khoản phụ thu" value={e.label}
                onChange={(ev) => setExtra(i, { label: ev.target.value })} sx={{ flex: 1 }}
              />
              <Select size="small" value={e.mode} onChange={(ev) => setExtra(i, { mode: ev.target.value as 'percent' | 'fixed' })} sx={{ width: 88 }}>
                <MenuItem value="percent">%</MenuItem>
                <MenuItem value="fixed">VND</MenuItem>
              </Select>
              <TextField
                size="small" type="number" value={e.value || ''}
                onChange={(ev) => setExtra(i, { value: Math.max(0, Number(ev.target.value) || 0) })}
                sx={{ width: 120 }} slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
              />
              <Typography fontSize={13} fontWeight={700} sx={{ color: LEGACY.tealLight, width: 130, textAlign: 'right' }}>
                {fmtVND(resolveMod(e, adultPPax))}
              </Typography>
              <IconButton size="small" color="error" onClick={() => removeExtra(i)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}

          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={addExtra} sx={{ color: LEGACY.teal }}>
              Thêm khoản phụ thu khác
            </Button>
          </Box>
          <Typography fontSize={11} sx={{ color: 'rgba(15,58,74,0.45)' }}>
            % tính trên giá bán/khách người lớn ({fmtVND(adultPPax)}). Các khoản này hiển thị trên báo giá trọn gói.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
