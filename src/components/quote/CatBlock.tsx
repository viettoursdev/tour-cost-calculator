import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Stack, Switch, Table,
  TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { LineRow } from './LineRow';
import { catTotal, fmtVND } from './calc';
import type { CategoryDef } from './constants';
import type { Item } from '@/types';

type Props = {
  cat: CategoryDef;
  items: Item[];
  enabled: boolean;
  pax: number;
  rates: Record<string, number>;
  onToggleCat: () => void;
  onUpd: (item: Item) => void;
  onAdd: () => void;
  onDel: (id: number) => void;
};

export function CatBlock({ cat, items, enabled, pax, rates, onToggleCat, onUpd, onAdd, onDel }: Props) {
  const sub = enabled ? catTotal(items, rates, pax) : 0;

  return (
    <Accordion defaultExpanded={enabled} disableGutters sx={{ mb: 1, opacity: enabled ? 1 : 0.6 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
          <Switch
            size="small" checked={enabled}
            onChange={onToggleCat}
            onClick={(e) => e.stopPropagation()}
          />
          <Box sx={{ fontSize: 20 }}>{cat.icon}</Box>
          <Typography fontWeight={700} sx={{ flex: 1 }}>{cat.label}</Typography>
          <Typography variant="caption" color="text.secondary">{items.length} dòng</Typography>
          {enabled
            ? <Typography fontWeight={800} sx={{ color: cat.color, mr: 1 }}>{fmtVND(sub)}</Typography>
            : <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Đã tắt</Typography>}
        </Stack>
      </AccordionSummary>

      {enabled && (
        <AccordionDetails sx={{ p: 0 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">✓</TableCell>
                  <TableCell>Hạng mục</TableCell>
                  <TableCell>Chi tiết / Ghi chú</TableCell>
                  <TableCell>Đơn giá</TableCell>
                  <TableCell>Đơn vị</TableCell>
                  <TableCell align="center">Lần</TableCell>
                  <TableCell align="center">SL</TableCell>
                  <TableCell align="right">Thành tiền</TableCell>
                  <TableCell padding="checkbox" />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <LineRow
                    key={item.id}
                    item={item}
                    pax={pax}
                    rates={rates}
                    catColor={cat.color}
                    onUpd={onUpd}
                    onDel={() => onDel(item.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>
          <Button fullWidth onClick={onAdd} sx={{ borderTop: '1px dashed', borderColor: 'divider' }}>
            ＋ Thêm dòng
          </Button>
        </AccordionDetails>
      )}
    </Accordion>
  );
}
