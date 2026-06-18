import { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { LineRow } from './LineRow';
import { catTotal, fmtVND } from './calc';
import { fmtOutput } from '@/lib/currency';
import { parseAmountVN } from '@/lib/numParse';
import { lineWarnings, duplicateNames, nameKey } from './lineValidation';
import type { CategoryDef } from './constants';
import type { Item, OutputCurrency } from '@/types';

/** Phân tích dữ liệu dán từ Excel: mỗi dòng = Tên ⭾ Đơn giá ⭾ Đơn vị ⭾ Số lần ⭾ Ghi chú. */
function parsePasted(text: string): Partial<Item>[] {
  return text.split(/\r?\n/).map((line) => line.split('\t')).filter((c) => (c[0] ?? '').trim()).map((c) => {
    const o: Partial<Item> = { name: c[0].trim() };
    if ((c[1] ?? '').trim()) o.price = parseAmountVN(c[1]);
    if ((c[2] ?? '').trim()) o.unit = c[2].trim();
    if ((c[3] ?? '').trim()) o.times = Math.max(1, Math.round(parseAmountVN(c[3])) || 1);
    if ((c[4] ?? '').trim()) o.note = c[4].trim();
    return o;
  });
}

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
  onDup: (item: Item) => void;
  onAddMany: (items: Partial<Item>[]) => void;
  onReorder: (from: number, to: number) => void;
  /** Opens the rate-card picker for this category (legacy "📋 Rate card"). */
  onOpenRate?: () => void;
  /** When set (DMC: "hiển thị tổng theo"), totals show in this currency. */
  displayCurrency?: OutputCurrency;
};

export function CatBlock({
  cat, items, enabled, pax, rates, onToggleCat, onUpd, onAdd, onDel, onDup, onAddMany, onReorder, onOpenRate, displayCurrency,
}: Props) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  useEffect(() => {
    if (!bodyRef.current) return;
    const sortable = Sortable.create(bodyRef.current, {
      handle: '.row-drag',
      animation: 150,
      onEnd: (e) => {
        const from = e.oldIndex, to = e.newIndex;
        if (from === undefined || to === undefined || from === to) return;
        // Hoàn nguyên DOM rồi để React render lại theo state mới (tránh lệch).
        if (e.item.parentNode) {
          const ref = e.item.parentNode.children[from > to ? from + 1 : from];
          e.item.parentNode.insertBefore(e.item, ref ?? null);
        }
        onReorderRef.current(from, to);
      },
    });
    return () => sortable.destroy();
  }, []);
  const doPaste = () => {
    const rows = parsePasted(pasteText);
    if (rows.length) onAddMany(rows);
    setPasteText(''); setPasteOpen(false);
  };
  // Cảnh báo nhập liệu: tính 1 lần cho cả hạng mục (kèm phát hiện trùng tên).
  const dupSet = duplicateNames(items);
  const warnByItem = items.map((it) => lineWarnings(it, !!it.name.trim() && dupSet.has(nameKey(it.name))));
  const warnCount = warnByItem.reduce((s, w) => s + (w.length ? 1 : 0), 0);
  const sub = enabled ? catTotal(items, rates, pax) : 0;
  const fmtMoney = (n: number) =>
    displayCurrency && displayCurrency !== 'VND' ? fmtOutput(n, displayCurrency, rates) : fmtVND(n);

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
          {warnCount > 0 && (
            <Tooltip title={`${warnCount} dòng có cảnh báo nhập liệu`}>
              <Box sx={{
                background: 'rgba(245,166,35,0.18)', border: '1px solid rgba(245,166,35,0.5)',
                borderRadius: '8px', px: 0.9, py: 0.25, fontSize: 11, color: '#b9770f', fontWeight: 800, whiteSpace: 'nowrap',
              }}>⚠ {warnCount}</Box>
            </Tooltip>
          )}
          <Typography variant="caption" color="text.secondary">{items.length} dòng</Typography>
          {enabled
            ? <Typography fontWeight={800} sx={{ color: cat.color, mr: 1 }}>{fmtMoney(sub)}</Typography>
            : <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Đã tắt</Typography>}
        </Stack>
      </AccordionSummary>

      {enabled && (
        <AccordionDetails sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: '72vh' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700 } }}>
                  <TableCell padding="checkbox" />
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
              <TableBody ref={bodyRef}>
                {items.map((item, i) => (
                  <LineRow
                    key={item.id}
                    item={item}
                    index={i}
                    pax={pax}
                    rates={rates}
                    catColor={cat.color}
                    onUpd={onUpd}
                    onDel={() => onDel(item.id)}
                    onDup={() => onDup(item)}
                    warnings={warnByItem[i]}
                    prevItem={items[i - 1]}
                    onMove={(dir) => onReorder(i, dir === 'up' ? i - 1 : i + 1)}
                    onAddRow={onAdd}
                    displayCurrency={displayCurrency}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" sx={{ borderTop: '1px dashed', borderColor: 'divider' }}>
            <Button fullWidth onClick={onAdd}>＋ Thêm dòng</Button>
            <Button onClick={() => setPasteOpen(true)} startIcon={<ContentPasteIcon />} sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>Dán từ Excel</Button>
            <Tooltip title="Phím tắt nhập liệu">
              <Button onClick={() => setHelpOpen(true)} sx={{ minWidth: 44, color: 'text.secondary' }}>⌨</Button>
            </Tooltip>
          </Stack>
        </AccordionDetails>
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>⌨ Phím tắt nhập liệu</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {[
              ['Enter', 'Lưu ô & xuống ô cùng cột dòng dưới'],
              ['Tab / ⇧Tab', 'Sang ô kế / ô trước'],
              ['Ctrl/⌘ + D', 'Chép giá trị ô ngay phía trên xuống'],
              ['Alt + ↑ / ↓', 'Di chuyển dòng đang sửa lên / xuống'],
              ['Alt + N', 'Thêm dòng mới'],
              ['Esc', 'Huỷ sửa ô (không lưu)'],
              ['Ctrl/⌘ + Enter', 'Lưu ô ghi chú nhiều dòng'],
            ].map(([k, d]) => (
              <Stack key={k} direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ flexShrink: 0, minWidth: 96, fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                  background: 'rgba(20,150,140,0.1)', border: '1px solid rgba(20,150,140,0.25)', borderRadius: '6px', px: 0.9, py: 0.4, textAlign: 'center' }}>{k}</Box>
                <Typography variant="body2">{d}</Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Dán nhiều dòng từ Excel — {cat.label}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Copy khối ở Excel rồi dán vào đây. Mỗi dòng 1 hạng mục, các cột cách nhau bằng <b>Tab</b> theo thứ tự:
            <b> Tên · Đơn giá · Đơn vị · Số lần · Ghi chú</b> (chỉ Tên là bắt buộc). Giá hiểu cả <code>1.500.000</code>, <code>1500k</code>, <code>1tr5</code>.
          </Typography>
          <TextField fullWidth multiline minRows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Xe 45 chỗ\t5500000\t/xe/ngày\t2\tMáy lạnh\nHDV\t1200000\t/ngày\t3'} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasteOpen(false)} color="inherit">Huỷ</Button>
          <Button variant="contained" disabled={!pasteText.trim()} onClick={doPaste} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            Thêm {parsePasted(pasteText).length || ''} dòng
          </Button>
        </DialogActions>
      </Dialog>
    </Accordion>
  );
}
