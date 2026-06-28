import { MenuItem, Stack, TextField } from '@mui/material';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { DATE_RANGE_OPTIONS, type DateRangeKey } from '@/lib/listFilters';
import { filterFieldSx } from './filterStyles';
import { iconValue } from './iconValue';

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
        select size="small" value={dateRange}
        onChange={(e) => onDateRange(e.target.value as DateRangeKey)} sx={{ minWidth: 148, ...filterFieldSx }}
        slotProps={{ select: { displayEmpty: true, renderValue: (v) => iconValue(<CalendarMonthOutlinedIcon />, DATE_RANGE_OPTIONS.find((o) => o.key === v)?.label ?? dateLabel) } }}
      >
        {DATE_RANGE_OPTIONS.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
      </TextField>
      {dateRange === 'custom' && (
        <>
          <TextField size="small" type="date" label="Từ" value={from} onChange={(e) => onFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} sx={{ width: 150, ...filterFieldSx }} />
          <TextField size="small" type="date" label="Đến" value={to} onChange={(e) => onTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} sx={{ width: 150, ...filterFieldSx }} />
        </>
      )}
      {owners && onOwner && (
        <TextField select size="small" value={owner ?? ''} onChange={(e) => onOwner(e.target.value)} sx={{ minWidth: 150, ...filterFieldSx }}
          slotProps={{ select: { displayEmpty: true, renderValue: (v) => iconValue(<PersonOutlineIcon />, v ? String(v) : 'Người tạo') } }}>
          <MenuItem value="">Tất cả người tạo</MenuItem>
          {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </TextField>
      )}
    </Stack>
  );
}
