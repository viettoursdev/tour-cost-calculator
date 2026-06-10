import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Stack, Table,
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
  /** Opens the rate-card picker for this category (legacy "📋 Rate card"). */
  onOpenRate?: () => void;
};

export function CatBlock({
  cat, items, enabled, pax, rates, onToggleCat, onUpd, onAdd, onDel, onOpenRate,
}: Props) {
  const sub = enabled ? catTotal(items, rates, pax) : 0;

  return (
    <Accordion
      defaultExpanded={enabled}
      disableGutters
      elevation={0}
      sx={{
        mb: 1.5,
        opacity: enabled ? 1 : 0.6,
        borderRadius: 3,
        border: '1px solid rgba(20,150,140,0.14)',
        borderLeft: `4px solid ${cat.color}`,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(20,80,100,0.06)',
        transition: 'box-shadow .2s, transform .2s',
        '&:before': { display: 'none' },
        '&:hover': { boxShadow: '0 6px 20px rgba(20,80,100,0.10)' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ background: `linear-gradient(90deg, ${cat.color}14, transparent)` }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
          <Box
            role="switch"
            aria-checked={enabled}
            aria-label={`Bật/tắt ${cat.label}`}
            onClick={(e) => { e.stopPropagation(); onToggleCat(); }}
            sx={{
              flexShrink: 0, width: 38, height: 21, borderRadius: 11, cursor: 'pointer',
              position: 'relative', transition: 'background .2s',
              background: enabled ? cat.color : 'rgba(15,58,74,0.15)',
            }}
          >
            <Box sx={{
              position: 'absolute', top: 2, left: enabled ? 19 : 2, width: 17, height: 17,
              borderRadius: '50%', background: '#fff', transition: 'left .2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </Box>
          <Box sx={{ fontSize: 20 }}>{cat.icon}</Box>
          <Typography fontWeight={700} sx={{ flex: 1 }}>{cat.label}</Typography>
          {onOpenRate && enabled && (
            <Box
              component="button"
              onClick={(e) => { e.stopPropagation(); onOpenRate(); }}
              sx={{
                background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.4)',
                borderRadius: '8px', px: 1.25, py: 0.5, fontSize: 11, color: '#d18a13',
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                '&:hover': { background: 'rgba(245,166,35,0.25)' },
              }}
            >
              📋 Rate card
            </Box>
          )}
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
          <Box sx={{ borderTop: '1px dashed', borderColor: 'divider' }}>
            <Button fullWidth onClick={onAdd}>＋ Thêm dòng</Button>
          </Box>
        </AccordionDetails>
      )}
    </Accordion>
  );
}
