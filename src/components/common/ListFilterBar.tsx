import { MenuItem, Stack, TextField } from '@mui/material';
import { DATE_RANGE_OPTIONS, type DateRangeKey } from '@/lib/listFilters';

type Props = {
  dateRange: DateRangeKey;
  onDateRange: (k: DateRangeKey) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  /** Danh sách người tạo/phụ trách (optional). Bỏ qua → không hiển thị ô người. */
  owners?: string[];
  owner?: string;
  onOwner?: (v: string) => void;
  dateLabel?: string;
};

/** Thanh lọc dùng chung: khoảng thời gian (+ tùy chọn ngày) và người tạo/phụ trách. */
export function ListFilterBar({
  dateRange, onDateRange, from, to, onFrom, onTo, owners, owner, onOwner, dateLabel = 'Cập nhật',
}: Props) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
      <TextField
        select size="small" label={dateLabel} value={dateRange}
        onChange={(e) => onDateRange(e.target.value as DateRangeKey)} sx={{ minWidth: 150 }}
      >
        {DATE_RANGE_OPTIONS.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
      </TextField>
      {dateRange === 'custom' && (
        <>
          <TextField size="small" type="date" label="Từ" value={from} onChange={(e) => onFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
          <TextField size="small" type="date" label="Đến" value={to} onChange={(e) => onTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150 }} />
        </>
      )}
      {owners && onOwner && (
        <TextField select size="small" label="Người tạo" value={owner ?? ''} onChange={(e) => onOwner(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Tất cả</MenuItem>
          {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </TextField>
      )}
    </Stack>
  );
}
