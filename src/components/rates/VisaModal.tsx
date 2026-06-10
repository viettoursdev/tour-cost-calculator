import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useRateCardStore } from '@/stores/rateCardStore';
import { VISA_COST_TYPES, VISA_COUNTRIES, VISA_TYPES } from './constants';

type VisaRatesShape = Record<string, Record<string, Record<string, number>>>;

function asRates(value: unknown): VisaRatesShape {
  if (!value || typeof value !== 'object') return {};
  const out: VisaRatesShape = {};
  for (const [country, byCountry] of Object.entries(value as Record<string, unknown>)) {
    if (!byCountry || typeof byCountry !== 'object') continue;
    out[country] = {};
    for (const [vt, byType] of Object.entries(byCountry as Record<string, unknown>)) {
      if (!byType || typeof byType !== 'object') continue;
      out[country][vt] = {};
      for (const [cost, price] of Object.entries(byType as Record<string, unknown>)) {
        const n = Number(price);
        if (!Number.isNaN(n)) out[country][vt][cost] = n;
      }
    }
  }
  return out;
}

type Props = { open: boolean; onClose: () => void };

export function VisaModal({ open, onClose }: Props) {
  const visaRates = useRateCardStore((s) => s.rates.visaRates);
  const updateVisa = useRateCardStore((s) => s.updateVisa);

  const [country, setCountry] = useState<string>(VISA_COUNTRIES[0].id);
  const [visaType, setVisaType] = useState<string>(VISA_TYPES[0].id);

  const rates = asRates(visaRates);
  const getPrice = (costId: string): number => rates[country]?.[visaType]?.[costId] ?? 0;

  const setPrice = (costId: string, val: number) => {
    const next: VisaRatesShape = { ...rates };
    if (!next[country]) next[country] = {};
    if (!next[country][visaType]) next[country][visaType] = {};
    next[country][visaType] = { ...next[country][visaType], [costId]: val };
    updateVisa(next as unknown as Record<string, unknown>);
  };

  const resetPrice = (costId: string) => {
    if (rates[country]?.[visaType]?.[costId] == null) return;
    const next: VisaRatesShape = { ...rates };
    next[country] = { ...next[country] };
    next[country][visaType] = { ...next[country][visaType] };
    delete next[country][visaType][costId];
    if (Object.keys(next[country][visaType]).length === 0) delete next[country][visaType];
    if (Object.keys(next[country]).length === 0) delete next[country];
    updateVisa(next as unknown as Record<string, unknown>);
  };

  const ct = VISA_COUNTRIES.find((c) => c.id === country)!;
  const vt = VISA_TYPES.find((v) => v.id === visaType)!;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#16a085,#1abc9c)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>🛂 Bảng giá Visa quốc tế</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            1. Chọn quốc gia
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Select
              size="small"
              value={country}
              onChange={(e) => setCountry(String(e.target.value))}
              fullWidth
            >
              {VISA_COUNTRIES.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  <span style={{ marginRight: 8 }}>{c.flag}</span> {c.label}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            2. Chọn loại visa
          </Typography>
          <Tabs
            value={visaType}
            onChange={(_, v) => setVisaType(String(v))}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mt: 1 }}
          >
            {VISA_TYPES.map((v) => (
              <Tab key={v.id} value={v.id} label={`${v.icon} ${v.label}`} />
            ))}
          </Tabs>
        </Box>

        <Paper variant="outlined">
          <Stack
            direction="row"
            alignItems="center"
            sx={{ px: 2, py: 1, bgcolor: 'rgba(20,150,140,0.06)' }}
          >
            <Typography variant="caption" sx={{ flexGrow: 1, fontWeight: 700, color: 'primary.main' }}>
              3. Các hạng mục chi phí · {ct.flag} {ct.label} · {vt.label}
            </Typography>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Hạng mục</TableCell>
                <TableCell align="right">Giá (VND/người)</TableCell>
                <TableCell width={120} />
              </TableRow>
            </TableHead>
            <TableBody>
              {VISA_COST_TYPES.map((cost) => {
                const price = getPrice(cost.id);
                const overridden = rates[country]?.[visaType]?.[cost.id] != null;
                return (
                  <TableRow key={cost.id}>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span style={{ fontSize: 18 }}>{cost.icon}</span>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {cost.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {cost.labelEn}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(cost.id, Number(e.target.value))}
                        slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      {overridden && (
                        <Button size="small" onClick={() => resetPrice(cost.id)}>
                          ↺ Mặc định
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          💡 Giá tự lưu lên cloud sau ~2 giây. Hệ thống ghi đè giá mặc định từng hạng mục theo
          quốc gia + loại visa.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
