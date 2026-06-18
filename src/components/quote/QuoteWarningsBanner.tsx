import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { lineWarnings, duplicateNames, nameKey } from './lineValidation';
import type { CategoryId, Item } from '@/types';

type CatDef = { id: string; label: string; icon: string; color: string };

type Props = {
  cats: CatDef[];
  items: Partial<Record<CategoryId, Item[]>>;
  catEnabled: Partial<Record<CategoryId, boolean>>;
};

/**
 * Banner tổng kiểm tra đầu trang Chi phí: gộp cảnh báo toàn báo giá + hạng mục
 * "bật nhưng trống". Bấm chip → cuộn tới hạng mục tương ứng.
 */
export function QuoteWarningsBanner({ cats, items, catEnabled }: Props) {
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

  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
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
  );
}
