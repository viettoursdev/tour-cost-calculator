import {
  Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { fmtOutput, toOutputCurrency, fmtCurrency } from '@/lib/currency';
import type { DmcPrices, OutputCurrency } from '@/types';

const GROUP_SIZES = [20, 25, 30, 35, 40] as const;

type Props = {
  totalCostVND: number;          // includes dmc margin
  pax: number;
  rates: Record<string, number>;
  outputCurrency: OutputCurrency;
  dmcPrices: DmcPrices;
  setDmcPrice: (groupSize: number, value: number) => void;
};

export function DMCComparePanel({
  totalCostVND, pax, rates, outputCurrency, dmcPrices, setDmcPrice,
}: Props) {
  const breakdownPerPaxVND = pax > 0 ? totalCostVND / pax : 0;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, mt: 2.5, borderColor: 'rgba(142,68,173,0.2)', borderRadius: 2 }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1}>
        <Typography fontWeight={800} fontSize={15} color="#0f3a4a">
          📊 So sánh với giá DMC Package
        </Typography>
        <Typography fontSize={12} color="rgba(15,58,74,0.5)">
          Nhập giá DMC /pax theo từng group size
        </Typography>
      </Stack>

      <Box
        sx={{
          background: 'rgba(142,68,173,0.07)',
          border: '1px solid rgba(142,68,173,0.15)',
          borderRadius: 1.5,
          p: 1.5,
          mb: 1.5,
        }}
      >
        <Typography
          fontSize={11}
          fontWeight={700}
          letterSpacing={1}
          textTransform="uppercase"
          color="rgba(15,58,74,0.5)"
          mb={0.5}
        >
          Chi phí Breakdown của bạn
        </Typography>
        <Stack direction="row" gap={3} flexWrap="wrap">
          <Box>
            <Typography component="span" fontSize={12} color="rgba(15,58,74,0.5)">
              Tổng đoàn ({pax} pax):{' '}
            </Typography>
            <strong style={{ color: '#8e44ad' }}>
              {fmtOutput(totalCostVND, outputCurrency, rates)}
            </strong>
          </Box>
          <Box>
            <Typography component="span" fontSize={12} color="rgba(15,58,74,0.5)">
              Per pax:{' '}
            </Typography>
            <strong style={{ color: '#8e44ad' }}>
              {fmtOutput(breakdownPerPaxVND, outputCurrency, rates)}
            </strong>
          </Box>
        </Stack>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow sx={{ background: 'rgba(142,68,173,0.06)' }}>
            <TableCell sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(15,58,74,0.55)' }}>
              Group size
            </TableCell>
            <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(15,58,74,0.55)' }}>
              Giá DMC /pax ({outputCurrency})
            </TableCell>
            <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(15,58,74,0.55)' }}>
              Tổng DMC
            </TableCell>
            <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(15,58,74,0.55)' }}>
              Breakdown /pax
            </TableCell>
            <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(15,58,74,0.55)' }}>
              Margin
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {GROUP_SIZES.map((gs) => {
            const dmcPpax = +(dmcPrices[gs] || 0);
            const dmcTotal = dmcPpax * gs;
            const rateMissing = outputCurrency !== 'VND' && !rates[outputCurrency];
            const bdTotalDisplay = toOutputCurrency(totalCostVND, outputCurrency, rates);
            const bdPpaxDisplay = gs > 0 ? bdTotalDisplay / gs : 0;
            const margin = dmcPpax - bdPpaxDisplay;
            const marginPct = dmcPpax > 0 ? (margin / dmcPpax) * 100 : 0;
            const isPos = margin >= 0;
            return (
              <TableRow key={gs}>
                <TableCell sx={{ fontWeight: 700, color: '#0f3a4a' }}>{gs} pax</TableCell>
                <TableCell align="right">
                  <TextField
                    type="number"
                    size="small"
                    value={dmcPrices[gs] || ''}
                    onChange={(e) => setDmcPrice(gs, +e.target.value)}
                    placeholder="0"
                    slotProps={{ htmlInput: { style: { textAlign: 'right', width: 90 } } }}
                    sx={{ '& input': { fontSize: 13 } }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#0f3a4a' }}>
                  {dmcPpax > 0 ? fmtCurrency(dmcTotal, outputCurrency) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#8e44ad' }}>
                  {rateMissing ? '—' : fmtCurrency(bdPpaxDisplay, outputCurrency)}
                </TableCell>
                <TableCell align="right">
                  {dmcPpax > 0 && !rateMissing ? (
                    <Chip
                      size="small"
                      label={`${isPos ? '+' : ''}${fmtCurrency(margin, outputCurrency)} (${isPos ? '+' : ''}${marginPct.toFixed(1)}%)`}
                      sx={{
                        fontWeight: 800,
                        color: isPos ? '#27ae60' : '#e74c3c',
                        background: isPos ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)',
                      }}
                    />
                  ) : (
                    <Typography component="span" color="rgba(15,58,74,0.3)" fontSize={12}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
