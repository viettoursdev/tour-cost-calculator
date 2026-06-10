import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Box, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { UNITS } from './constants';
import { calcVND, fmtVND, qtyOf } from './calc';
import { LEGACY } from '@/theme';
import type { Item, QtyMode } from '@/types';

type Props = {
  item: Item;
  pax: number;
  rates: Record<string, number>;
  catColor: string;
  onUpd: (item: Item) => void;
  onDel: () => void;
};

/** Compact bordered <select> matching legacy `.sel`. */
const Sel = styled('select')({
  background: '#fff',
  border: '1px solid rgba(20,150,140,0.25)',
  borderRadius: 7,
  color: LEGACY.navy,
  padding: '4px 7px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  outline: 'none',
});

/** Inline-edit number (legacy `EN`): formatted text → number input on click. */
function EditNum({
  value, onChange, min = 0, step = 1, width = 80, align = 'right', bold = false,
}: {
  value: number; onChange: (v: number) => void; min?: number; step?: number;
  width?: number; align?: 'right' | 'center' | 'left'; bold?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= min) onChange(n);
    setEditing(false);
  };
  if (editing) {
    return (
      <Box
        component="input" autoFocus type="number" value={draft} step={step}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        sx={{
          width, textAlign: align, background: '#fff', border: '1.5px solid #14a08c',
          borderRadius: '6px', color: LEGACY.navy, outline: 'none', padding: '3px 8px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: bold ? 700 : 400,
        }}
      />
    );
  }
  return (
    <Box
      component="span"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      sx={{
        cursor: 'pointer', borderRadius: '4px', px: 0.5, display: 'inline-block',
        textAlign: align, minWidth: width, fontWeight: bold ? 700 : 400, fontSize: 14,
        '&:hover': { background: 'rgba(20,150,140,0.1)' },
      }}
    >
      {value.toLocaleString('vi-VN')}
    </Box>
  );
}

/** Inline-edit text (legacy `ET`). */
function EditText({
  value, onChange, placeholder = '', bold = false, italic = false, color,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  bold?: boolean; italic?: boolean; color?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => { onChange(draft); setEditing(false); };
  if (editing) {
    return (
      <Box
        component="input" autoFocus value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        sx={{
          width: '100%', background: '#fff', border: '1.5px solid #14a08c',
          borderRadius: '6px', color: LEGACY.navy, outline: 'none', padding: '3px 8px',
          fontFamily: 'inherit', fontSize: bold ? 13 : 12, fontWeight: bold ? 600 : 400,
        }}
      />
    );
  }
  return (
    <Box
      component="span"
      onClick={() => { setDraft(value); setEditing(true); }}
      sx={{
        cursor: 'pointer', borderRadius: '4px', px: 0.5, py: 0.25, display: 'inline-block',
        minHeight: '1.3em', fontSize: bold ? 13 : 12, fontWeight: bold ? 600 : 400,
        fontStyle: italic && !value ? 'italic' : 'normal',
        color: value ? (color ?? 'inherit') : 'rgba(15,58,74,0.4)',
        '&:hover': { background: 'rgba(20,150,140,0.1)' },
      }}
    >
      {value || placeholder}
    </Box>
  );
}

export function LineRow({ item, pax, rates, catColor, onUpd, onDel }: Props) {
  const vnd = calcVND(item, rates, pax);
  const off = !item.enabled;
  const u = (patch: Partial<Item>) => onUpd({ ...item, ...patch });

  const qty = qtyOf(item, pax);

  // Rooms scale with pax (formula) → read-only. Only package/custom take a typed number.
  const editableQty = item.qtyMode === 'custom' || item.qtyMode === 'package';

  const changeQtyMode = (m: QtyMode) => {
    const patch: Partial<Item> = { qtyMode: m };
    if (m === 'package') patch.customQty = Math.max(1, item.customQty || 1);
    u(patch);
  };

  return (
    <TableRow sx={{ opacity: off ? 0.4 : 1 }}>
      {/* Enable toggle (legacy pill) */}
      <TableCell padding="checkbox" sx={{ textAlign: 'center' }}>
        <Box
          role="switch" aria-checked={item.enabled} aria-label="Bật/tắt dòng"
          onClick={() => u({ enabled: off })}
          sx={{
            display: 'inline-block', width: 38, height: 21, borderRadius: 11, cursor: 'pointer',
            position: 'relative', transition: 'background .2s',
            background: off ? 'rgba(15,58,74,0.15)' : '#14a08c',
          }}
        >
          <Box sx={{
            position: 'absolute', top: 2, left: off ? 2 : 19, width: 17, height: 17,
            borderRadius: '50%', background: '#fff', transition: 'left .2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </Box>
      </TableCell>

      {/* Name */}
      <TableCell sx={{ minWidth: 140 }}>
        <EditText value={item.name} onChange={(v) => u({ name: v })} placeholder="Mô tả..." bold />
      </TableCell>

      {/* Note */}
      <TableCell sx={{ minWidth: 180, maxWidth: 260 }}>
        <EditText value={item.note} onChange={(v) => u({ note: v })} placeholder="Chi tiết / ghi chú..." italic color="rgba(15,58,74,0.7)" />
      </TableCell>

      {/* Currency + price */}
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Sel value={item.cur} onChange={(e) => u({ cur: e.target.value })}>
            {Object.keys(rates).map((c) => <option key={c} value={c}>{c}</option>)}
          </Sel>
          <EditNum value={item.price} onChange={(v) => u({ price: v })} min={0} step={0.01} width={86} bold />
        </Stack>
      </TableCell>

      {/* Unit */}
      <TableCell>
        <Sel value={item.unit} onChange={(e) => u({ unit: e.target.value })}>
          {UNITS.map((un) => <option key={un} value={un}>{un}</option>)}
        </Sel>
      </TableCell>

      {/* Times */}
      <TableCell align="center">
        <EditNum value={item.times} onChange={(v) => u({ times: Math.max(1, v) })} min={1} width={48} align="center" />
      </TableCell>

      {/* Quantity */}
      <TableCell align="center">
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
          <Sel value={item.qtyMode} onChange={(e) => changeQtyMode(e.target.value as QtyMode)} style={{ fontSize: 11 }}>
            <option value="per_pax">×pax</option>
            <option value="per_group">đoàn</option>
            <option value="single_room">phòng đơn</option>
            <option value="double_room">phòng đôi</option>
            <option value="package">gói</option>
            <option value="custom">tuỳ</option>
          </Sel>
          {editableQty ? (
            <EditNum value={item.customQty} onChange={(v) => u({ customQty: Math.max(1, v) })} min={1} width={44} align="center" />
          ) : (
            <Typography variant="caption" sx={{ color: 'rgba(15,58,74,0.4)' }}>= {qty}</Typography>
          )}
        </Stack>
      </TableCell>

      {/* Total + FOC + Optional */}
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Stack alignItems="flex-end" spacing={0.5}>
          {item.foc ? (
            <Box sx={{ background: '#27ae60', color: '#fff', fontSize: 10, fontWeight: 800, px: 0.9, py: 0.25, borderRadius: '5px', letterSpacing: 0.5 }}>
              FOC
            </Box>
          ) : (
            <Stack alignItems="flex-end" spacing={0.25}>
              {item.optional && (
                <Box sx={{ background: '#f5a623', color: '#fff', fontSize: 9, fontWeight: 800, px: 0.7, py: '1px', borderRadius: '4px', letterSpacing: 0.4 }}>
                  TUỲ CHỌN
                </Box>
              )}
              <Typography sx={{
                fontWeight: 700, fontSize: 14,
                color: off ? 'rgba(15,58,74,0.3)' : item.optional ? '#c2410c' : catColor,
                fontStyle: item.optional ? 'italic' : 'normal',
              }}>
                {fmtVND(vnd)}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={item.foc ? 'Bỏ FOC – tính phí lại' : 'Đánh dấu Free of Charge'}>
              <Box
                component="button" onClick={() => u({ foc: !item.foc, ...(item.foc ? {} : { optional: false }) })}
                sx={{
                  background: item.foc ? 'rgba(39,174,96,0.15)' : 'rgba(15,58,74,0.05)',
                  border: `1px solid ${item.foc ? '#27ae60' : 'rgba(15,58,74,0.15)'}`,
                  color: item.foc ? '#27ae60' : 'rgba(15,58,74,0.5)',
                  borderRadius: '6px', px: 0.9, py: '1px', fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
                }}
              >
                {item.foc ? '✓ FOC' : 'FOC?'}
              </Box>
            </Tooltip>
            <Tooltip title={item.optional ? 'Bỏ tuỳ chọn – tính vào tổng' : 'Chi phí tuỳ chọn (không tính vào tổng)'}>
              <Box
                component="button" onClick={() => u({ optional: !item.optional, ...(item.optional ? {} : { foc: false }) })}
                sx={{
                  background: item.optional ? 'rgba(245,166,35,0.18)' : 'rgba(15,58,74,0.05)',
                  border: `1px solid ${item.optional ? '#f5a623' : 'rgba(15,58,74,0.15)'}`,
                  color: item.optional ? '#c2410c' : 'rgba(15,58,74,0.5)',
                  borderRadius: '6px', px: 0.9, py: '1px', fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
                }}
              >
                {item.optional ? '✓ Optional' : 'Optional?'}
              </Box>
            </Tooltip>
          </Stack>
        </Stack>
      </TableCell>

      {/* Delete */}
      <TableCell padding="checkbox" sx={{ textAlign: 'center' }}>
        <Box
          component="button" onClick={onDel} aria-label="Xoá dòng"
          sx={{
            background: 'none', border: 'none', color: 'rgba(220,50,80,0.45)',
            cursor: 'pointer', fontSize: 14, px: 0.75, fontFamily: 'inherit',
            '&:hover': { color: '#dc3250' },
          }}
        >
          ✕
        </Box>
      </TableCell>
    </TableRow>
  );
}
