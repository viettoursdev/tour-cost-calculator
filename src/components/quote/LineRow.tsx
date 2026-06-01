import {
  IconButton, MenuItem, Select, Stack, Switch, TableCell, TableRow,
  TextField, ToggleButton, Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { UNITS } from './constants';
import { calcVND, fmtVND } from './calc';
import type { Item, QtyMode } from '@/types';

type Props = {
  item: Item;
  pax: number;
  rates: Record<string, number>;
  catColor: string;
  onUpd: (item: Item) => void;
  onDel: () => void;
};

export function LineRow({ item, pax, rates, catColor, onUpd, onDel }: Props) {
  const vnd = calcVND(item, rates, pax);
  const off = !item.enabled;
  const u = (patch: Partial<Item>) => onUpd({ ...item, ...patch });

  const qty =
    item.qtyMode === 'per_pax' ? pax :
    item.qtyMode === 'per_group' ? 1 :
    item.customQty;

  return (
    <TableRow sx={{ opacity: off ? 0.45 : 1 }}>
      <TableCell padding="checkbox">
        <Switch size="small" checked={item.enabled} onChange={(_, c) => u({ enabled: c })} />
      </TableCell>

      <TableCell>
        <TextField
          size="small" fullWidth variant="standard"
          value={item.name}
          placeholder="Mô tả..."
          onChange={(e) => u({ name: e.target.value })}
        />
      </TableCell>

      <TableCell>
        <TextField
          size="small" fullWidth variant="standard"
          value={item.note}
          placeholder="Chi tiết / ghi chú..."
          onChange={(e) => u({ note: e.target.value })}
        />
      </TableCell>

      <TableCell>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Select
            size="small" variant="standard" value={item.cur}
            onChange={(e) => u({ cur: String(e.target.value) })}
            sx={{ minWidth: 64 }}
          >
            {Object.keys(rates).map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
          <TextField
            size="small" variant="standard" type="number"
            value={item.price}
            onChange={(e) => u({ price: Number(e.target.value) || 0 })}
            slotProps={{ htmlInput: { min: 0, step: 0.01, style: { width: 90, textAlign: 'right' } } }}
          />
        </Stack>
      </TableCell>

      <TableCell>
        <Select
          size="small" variant="standard" value={item.unit}
          onChange={(e) => u({ unit: String(e.target.value) })}
          sx={{ minWidth: 110 }}
        >
          {UNITS.map((un) => <MenuItem key={un} value={un}>{un}</MenuItem>)}
        </Select>
      </TableCell>

      <TableCell align="center">
        <TextField
          size="small" variant="standard" type="number"
          value={item.times}
          onChange={(e) => u({ times: Math.max(1, Number(e.target.value) || 1) })}
          slotProps={{ htmlInput: { min: 1, style: { width: 40, textAlign: 'center' } } }}
        />
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
          <Select
            size="small" variant="standard" value={item.qtyMode}
            onChange={(e) => u({ qtyMode: e.target.value as QtyMode })}
            sx={{ minWidth: 64, fontSize: 12 }}
          >
            <MenuItem value="per_pax">×pax</MenuItem>
            <MenuItem value="per_group">đoàn</MenuItem>
            <MenuItem value="custom">tuỳ</MenuItem>
          </Select>
          {item.qtyMode === 'custom' ? (
            <TextField
              size="small" variant="standard" type="number"
              value={item.customQty}
              onChange={(e) => u({ customQty: Math.max(1, Number(e.target.value) || 1) })}
              slotProps={{ htmlInput: { min: 1, style: { width: 40, textAlign: 'center' } } }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary">= {qty}</Typography>
          )}
        </Stack>
      </TableCell>

      <TableCell align="right">
        <Stack alignItems="flex-end" spacing={0.5}>
          <Typography
            fontWeight={700}
            sx={{ color: off ? 'text.disabled' : (item.foc ? 'success.main' : catColor) }}
          >
            {item.foc ? 'FOC' : fmtVND(vnd)}
          </Typography>
          <Tooltip title={item.foc ? 'Bỏ FOC – tính phí lại' : 'Đánh dấu Free of Charge'}>
            <ToggleButton
              size="small" value="foc"
              selected={item.foc}
              onChange={() => u({ foc: !item.foc })}
              sx={{ py: 0, px: 1, fontSize: 10 }}
            >
              {item.foc ? '✓ FOC' : 'FOC?'}
            </ToggleButton>
          </Tooltip>
        </Stack>
      </TableCell>

      <TableCell padding="checkbox">
        <IconButton size="small" onClick={onDel} color="error">
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
