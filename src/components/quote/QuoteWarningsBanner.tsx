import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { lineWarnings, duplicateNames, nameKey } from './lineValidation';
import { foreignRatesMissing } from './calc';
import { fxLabel } from '@/lib/currency';
import type { CategoryId, Item } from '@/types';

type CatDef = { id: string; label: string; icon: string; color: string };

type Props = {
  cats: CatDef[];
  items: Partial<Record<CategoryId, Item[]>>;
  catEnabled: Partial<Record<CategoryId, boolean>>;
  /** Bảng tỷ giá báo giá — để cảnh báo hạng mục ngoại tệ thiếu tỷ giá. */
  rates: Record<string, number>;
  /** Tổng giá để cảnh báo định giá (chưa có lợi nhuận / bán dưới giá vốn). */
  pricing?: { totalCost: number; totalProfit: number; grandTotal: number };
};

/**
 * Banner tổng kiểm tra đầu trang Chi phí: cảnh báo định giá (chưa có lợi nhuận /
 * dưới giá vốn) + cảnh báo nhập liệu toàn báo giá + hạng mục "bật nhưng trống".
 * Bấm chip → cuộn tới hạng mục tương ứng.
 */
export function QuoteWarningsBanner({ cats, items, catEnabled, rates, pricing }: Props) {
  const rows = cats.map((cat) => {
    const arr = items[cat.id as CategoryId] ?? [];
    const dup = duplicateNames(arr);
    const count = arr.reduce(
      (s, it) => s + (lineWarnings(it, !!it.name.trim() && dup.has(nameKey(it.name))).length ? 1 : 0),
      0,
    );
    const emptyEnabled = !!catEnabled[cat.id as CategoryId] && arr.length === 0;
    return { cat, count, emptyEnabled };
  }).filter((r) => r.count > 0 || r.emptyEnabled);

  // Cảnh báo định giá (đỏ, nghiêm trọng): chỉ khi có chi phí thực.
  const priceMsgs: string[] = [];
  if (pricing && pricing.totalCost > 0) {
    if (pricing.grandTotal < pricing.totalCost) priceMsgs.push('Giá bán đang THẤP HƠN giá vốn — kiểm tra lại margin/làm tròn.');
    else if (pricing.totalProfit <= 0) priceMsgs.push('Báo giá chưa có lợi nhuận (margin 0%) — xác nhận lại trước khi gửi.');
  }

  // Cảnh báo thiếu tỷ giá (đỏ, nghiêm trọng): hạng mục ngoại tệ chưa có tỷ giá > 0
  // sẽ bị quy ×1 (1 ngoại tệ = 1 VND) → tổng SAI rất xa. Phải nhập tỷ giá trước khi gửi.
  const missingRates = foreignRatesMissing({ items, catEnabled, rates });
  if (missingRates.length > 0) {
    priceMsgs.push(
      `Thiếu tỷ giá cho ${missingRates.map(fxLabel).join(', ')} — hạng mục ngoại tệ đang bị tính 1:1 với VND. ` +
        'Nhập tỷ giá trong bảng "Tỷ giá quy đổi → VND" trước khi gửi.',
    );
  }

  if (rows.length === 0 && priceMsgs.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <>
      {priceMsgs.length > 0 && (
        <Paper
          variant="outlined"
          sx={{ mb: 1.5, p: 1.25, borderRadius: 2, borderColor: 'rgba(220,50,80,0.6)', background: 'rgba(220,50,80,0.08)' }}
        >
          {priceMsgs.map((m) => (
            <Typography key={m} sx={{ fontWeight: 800, fontSize: 13.5, color: '#b01030' }}>
              ⛔ {m}
            </Typography>
          ))}
        </Paper>
      )}
      {rows.length > 0 && (
    <Paper
      variant="outlined"
      sx={{ mb: 1.5, p: 1.25, borderRadius: 2, borderColor: 'rgba(245,166,35,0.6)', background: 'rgba(245,166,35,0.08)' }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: '#b9770f', mr: 0.5 }}>
          ⚠ Kiểm tra trước khi gửi{total > 0 ? ` — ${total} dòng cần xem lại` : ''}
        </Typography>
        {rows.map((r) => (
          <Chip
            key={r.cat.id}
            size="small"
            clickable
            onClick={() => document.getElementById(`cat-${r.cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            label={
              <Box component="span" sx={{ fontWeight: 600 }}>
                {r.cat.icon} {r.cat.label}: {r.count > 0 ? `${r.count} cảnh báo` : 'bật nhưng trống'}
              </Box>
            }
            sx={{
              background: '#fff', border: `1px solid ${r.cat.color}55`,
              '& .MuiChip-label': { px: 1 },
              '&:hover': { background: 'rgba(255,255,255,0.7)' },
            }}
          />
        ))}
      </Stack>
    </Paper>
      )}
    </>
  );
}
