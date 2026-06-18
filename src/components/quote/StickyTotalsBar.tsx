import { Box, Paper, Stack, Typography } from '@mui/material';
import { fmtVND } from './calc';
import type { Totals } from './calc';

type Props = { totals: Totals; pax: number };

/**
 * Thanh tổng dính ở đáy trang Chi phí: luôn thấy tổng chi phí · lãi · giá bán
 * khi cuộn bảng, cập nhật tức thì theo từng ô vừa nhập → soát tác động ngay.
 */
export function StickyTotalsBar({ totals, pax }: Props) {
  const cells: { label: string; value: string; strong?: boolean; color?: string }[] = [
    { label: 'Tổng chi phí cả đoàn', value: fmtVND(totals.totalCost) },
    { label: 'Lãi gộp', value: fmtVND(totals.totalProfit), color: '#0d7a6a' },
    { label: `Giá bán / khách (${pax})`, value: fmtVND(totals.roundedPPax), color: '#0d7a6a' },
    { label: 'Tổng giá bán', value: fmtVND(totals.grandTotal), strong: true, color: '#0f3a4a' },
  ];
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'sticky', bottom: 8, zIndex: 5, mt: 1.5,
        border: '1px solid rgba(20,150,140,0.22)', borderRadius: 2,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
        boxShadow: '0 6px 20px rgba(15,58,74,0.12)',
        px: 2, py: 1.25,
      }}
    >
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={2} divider={<Box sx={{ width: '1px', alignSelf: 'stretch', background: 'rgba(15,58,74,0.12)' }} />}>
        {cells.map((c) => (
          <Box key={c.label} sx={{ minWidth: 130, flex: 1 }}>
            <Typography sx={{ fontSize: 11, color: 'rgba(15,58,74,0.55)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</Typography>
            <Typography sx={{
              fontSize: c.strong ? 19 : 16, fontWeight: c.strong ? 900 : 800,
              color: c.color ?? '#0f3a4a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, whiteSpace: 'nowrap',
            }}>{c.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
