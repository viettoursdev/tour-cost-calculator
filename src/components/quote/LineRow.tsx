import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Box, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { UNITS } from './constants';
import { calcVND, fmtVND, qtyOf } from './calc';
import { fmtOutput } from '@/lib/currency';
import { LEGACY } from '@/theme';
import type { Item, OutputCurrency, QtyMode } from '@/types';

type Props = {
  item: Item;
  pax: number;
  rates: Record<string, number>;
  catColor: string;
  onUpd: (item: Item) => void;
  onDel: () => void;
  onDup?: () => void;
  /** When set (DMC: "hiển thị tổng theo"), line totals show in this currency. */
  displayCurrency?: OutputCurrency;
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

/** Render note text: preserve newlines (pre-wrap by container) + `**bold**`. */
function renderNote(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith('**') && seg.endsWith('**') && seg.length > 4 ? (
      <Box key={i} component="strong" sx={{ fontWeight: 800 }}>{seg.slice(2, -2)}</Box>
    ) : (
      <span key={i}>{seg}</span>
    ),
  );
}

/**
 * Multi-line rich note editor for the "Chi tiết / ghi chú" column.
 * - Enter = xuống dòng; Ctrl/⌘+Enter hoặc rời ô = lưu; Esc = huỷ.
 * - `**chữ**` hiển thị in đậm; nội dung dài tự xuống dòng, hiện đầy đủ.
 */
function EditNote({
  value, onChange, placeholder = '',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => { onChange(draft); setEditing(false); };
  if (editing) {
    return (
      <Box
        component="textarea" autoFocus value={draft}
        rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        sx={{
          width: '100%', minHeight: 64, resize: 'vertical', background: '#fff',
          border: '1.5px solid #14a08c', borderRadius: '6px', color: LEGACY.navy,
          outline: 'none', padding: '6px 8px', fontFamily: 'inherit', fontSize: 12.5,
          lineHeight: 1.5, boxSizing: 'border-box',
        }}
      />
    );
  }
  return (
    <Box
      onClick={() => { setDraft(value); setEditing(true); }}
      sx={{
        cursor: 'text', borderRadius: '4px', px: 0.5, py: 0.4, minHeight: '1.4em',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.5,
        fontStyle: value ? 'normal' : 'italic',
        color: value ? 'rgba(15,58,74,0.78)' : 'rgba(15,58,74,0.4)',
        '&:hover': { background: 'rgba(20,150,140,0.1)' },
      }}
    >
      {value ? renderNote(value) : placeholder}
    </Box>
  );
}

export function LineRow({ item, pax, rates, catColor, onUpd, onDel, onDup, displayCurrency }: Props) {
  const vnd = calcVND(item, rates, pax);
  const off = !item.enabled;
  const u = (patch: Partial<Item>) => onUpd({ ...item, ...patch });
  // Line total in the chosen display currency (DMC) or VND.
  const fmtMoney = (n: number) =>
    displayCurrency && displayCurrency !== 'VND' ? fmtOutput(n, displayCurrency, rates) : fmtVND(n);

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

      {/* Note (chi tiết / ghi chú — đa dòng, in đậm, hiện đầy đủ) */}
      <TableCell sx={{ minWidth: 260, maxWidth: 460, verticalAlign: 'top' }}>
        <EditNote
          value={item.note}
          onChange={(v) => u({ note: v })}
          placeholder="Chi tiết / ghi chú… (Enter để xuống dòng · **chữ** = in đậm · Ctrl/⌘+Enter để lưu)"
        />
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
          {(UNITS.includes(item.unit) ? UNITS : [item.unit, ...UNITS]).map((un) => (
            <option key={un} value={un}>{un}</option>
          ))}
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

      {/* Total + FOC + Optional + Including */}
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Stack alignItems="flex-end" spacing={0.5}>
          {item.foc ? (
            <Box sx={{ background: '#27ae60', color: '#fff', fontSize: 10, fontWeight: 800, px: 0.9, py: 0.25, borderRadius: '5px', letterSpacing: 0.5 }}>
              FOC
            </Box>
          ) : item.included ? (
            <Box sx={{ background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 800, px: 0.9, py: 0.25, borderRadius: '5px', letterSpacing: 0.4 }}>
              ĐÃ GỒM
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
                {fmtMoney(vnd)}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={item.foc ? 'Bỏ FOC – tính phí lại' : 'Đánh dấu Free of Charge'}>
              <Box
                component="button" onClick={() => u({ foc: !item.foc, ...(item.foc ? {} : { optional: false, included: false }) })}
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
                component="button" onClick={() => u({ optional: !item.optional, ...(item.optional ? {} : { foc: false, included: false }) })}
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
            <Tooltip title={item.included ? 'Bỏ "đã gồm" – tính vào tổng' : 'Đã bao gồm trong giá khác (không cộng vào tổng)'}>
              <Box
                component="button" onClick={() => u({ included: !item.included, ...(item.included ? {} : { foc: false, optional: false }) })}
                sx={{
                  background: item.included ? 'rgba(37,99,235,0.15)' : 'rgba(15,58,74,0.05)',
                  border: `1px solid ${item.included ? '#2563eb' : 'rgba(15,58,74,0.15)'}`,
                  color: item.included ? '#2563eb' : 'rgba(15,58,74,0.5)',
                  borderRadius: '6px', px: 0.9, py: '1px', fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
                }}
              >
                {item.included ? '✓ Đã gồm' : 'Including?'}
              </Box>
            </Tooltip>
          </Stack>
        </Stack>
      </TableCell>

      {/* Nhân bản + Xoá */}
      <TableCell padding="checkbox" sx={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        {onDup && (
          <Tooltip title="Nhân bản dòng">
            <Box component="button" onClick={onDup} aria-label="Nhân bản dòng"
              sx={{ background: 'none', border: 'none', color: 'rgba(15,58,74,0.4)', cursor: 'pointer', fontSize: 13, px: 0.5, fontFamily: 'inherit', '&:hover': { color: '#0d7a6a' } }}>
              ⧉
            </Box>
          </Tooltip>
        )}
        <Tooltip title="Xoá dòng">
          <Box component="button" onClick={onDel} aria-label="Xoá dòng"
            sx={{ background: 'none', border: 'none', color: 'rgba(220,50,80,0.45)', cursor: 'pointer', fontSize: 14, px: 0.5, fontFamily: 'inherit', '&:hover': { color: '#dc3250' } }}>
            ✕
          </Box>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
