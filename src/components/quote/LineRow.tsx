import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Box, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { UNITS } from './constants';
import { calcVND, fmtVND, qtyOf } from './calc';
import { navFrom, type NavCol } from './cellNav';
import { guessItemMeta } from './guessMeta';
import { parseAmountVN } from '@/lib/numParse';
import { docTienVN } from '@/lib/numToWords';
import { recordItem, suggestItems, type ItemSuggestion } from '@/lib/itemSuggest';
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
  index?: number;
  /** Cảnh báo nhập liệu của dòng này (nơi gọi tính qua lineWarnings). */
  warnings?: string[];
  /** Dòng ngay phía trên — phục vụ fill-down (Ctrl+D). */
  prevItem?: Item;
  /** Di chuyển dòng lên/xuống (Alt+↑/↓). */
  onMove?: (dir: 'up' | 'down') => void;
  /** Thêm dòng mới vào hạng mục (Alt+N). */
  onAddRow?: () => void;
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
  value, onChange, min = 0, width = 80, align = 'right', bold = false, navCol, showWords = false, fillFrom,
}: {
  value: number; onChange: (v: number) => void; min?: number;
  width?: number; align?: 'right' | 'center' | 'left'; bold?: boolean; navCol?: NavCol;
  showWords?: boolean; fillFrom?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const n = parseAmountVN(draft); // hiểu 1500k / 1tr5 / 1.500.000
    if (n >= min) onChange(n);
    setEditing(false);
  };
  if (editing) {
    const parsed = showWords ? parseAmountVN(draft) : 0;
    return (
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <Box
          component="input" autoFocus inputMode="decimal" value={draft} data-nav={navCol}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape') { setEditing(false); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
              e.preventDefault(); if (fillFrom !== undefined) { setDraft(String(fillFrom)); onChange(fillFrom); } return;
            }
            if (!navCol) { if (e.key === 'Enter') commit(); return; }
            if (e.key === 'Enter') { e.preventDefault(); commit(); navFrom(e.currentTarget, 'down'); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(); navFrom(e.currentTarget, e.shiftKey ? 'prev' : 'next'); }
          }}
          sx={{
            width, textAlign: align, background: '#fff', border: '1.5px solid #14a08c',
            borderRadius: '6px', color: LEGACY.navy, outline: 'none', padding: '3px 8px',
            fontFamily: 'inherit', fontSize: 14, fontWeight: bold ? 700 : 400,
          }}
        />
        {showWords && parsed >= 1000 && (
          <Box sx={{
            position: 'absolute', top: '100%', right: 0, mt: 0.5, zIndex: 30, pointerEvents: 'none',
            background: '#0f3a4a', color: '#fff', px: 1, py: 0.5, borderRadius: '6px',
            fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }}>
            {docTienVN(parsed)}
          </Box>
        )}
      </Box>
    );
  }
  return (
    <Box
      component="span" data-nav={navCol}
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
  value, onChange, placeholder = '', bold = false, italic = false, color, navCol, fillFrom, suggest = false, onPick,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  bold?: boolean; italic?: boolean; color?: string; navCol?: NavCol; fillFrom?: string;
  suggest?: boolean; onPick?: (s: ItemSuggestion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hideSug, setHideSug] = useState(false);
  const [hi, setHi] = useState(-1);
  const commit = () => { onChange(draft); setEditing(false); };
  const matches = suggest && !hideSug && editing ? suggestItems(draft) : [];
  const pick = (s: ItemSuggestion) => { setDraft(s.name); onPick?.(s); setEditing(false); };
  if (editing) {
    return (
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Box
          component="input" autoFocus value={draft} data-nav={navCol}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setDraft(e.target.value); setHideSug(false); setHi(-1); }}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape') { if (matches.length) { e.preventDefault(); setHideSug(true); } else setEditing(false); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
              e.preventDefault(); if (fillFrom !== undefined) { setDraft(fillFrom); onChange(fillFrom); } return;
            }
            if (matches.length && e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(matches.length - 1, h + 1)); return; }
            if (matches.length && e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); return; }
            if (e.key === 'Enter' && hi >= 0 && matches[hi]) { e.preventDefault(); pick(matches[hi]); return; }
            if (!navCol) { if (e.key === 'Enter') commit(); return; }
            if (e.key === 'Enter') { e.preventDefault(); commit(); navFrom(e.currentTarget, 'down'); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(); navFrom(e.currentTarget, e.shiftKey ? 'prev' : 'next'); }
          }}
          sx={{
            width: '100%', background: '#fff', border: '1.5px solid #14a08c',
            borderRadius: '6px', color: LEGACY.navy, outline: 'none', padding: '3px 8px',
            fontFamily: 'inherit', fontSize: bold ? 13 : 12, fontWeight: bold ? 600 : 400,
          }}
        />
        {matches.length > 0 && (
          <Box sx={{
            position: 'absolute', top: '100%', left: 0, mt: 0.5, zIndex: 40, minWidth: 220, maxWidth: 340,
            background: '#fff', border: '1px solid rgba(20,150,140,0.3)', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(15,58,74,0.18)', overflow: 'hidden',
          }}>
            {matches.map((s, i) => (
              <Box key={s.name}
                onMouseDown={(e: ReactMouseEvent) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setHi(i)}
                sx={{
                  display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'baseline',
                  px: 1, py: 0.6, cursor: 'pointer', fontSize: 12,
                  background: i === hi ? 'rgba(20,150,140,0.12)' : 'transparent',
                }}
              >
                <Box component="span" sx={{ fontWeight: 600, color: LEGACY.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Box>
                <Box component="span" sx={{ flexShrink: 0, color: 'rgba(15,58,74,0.55)', fontSize: 11 }}>
                  {s.price.toLocaleString('vi-VN')} {s.cur} {s.unit}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }
  return (
    <Box
      component="span" data-nav={navCol}
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
  value, onChange, placeholder = '', fillFrom,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; fillFrom?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => { onChange(draft); setEditing(false); };
  if (editing) {
    return (
      <Box
        component="textarea" autoFocus value={draft} data-nav="note"
        rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault(); if (fillFrom !== undefined) { setDraft(fillFrom); onChange(fillFrom); } return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); navFrom(e.currentTarget, 'down'); }
          else if (e.key === 'Tab') { e.preventDefault(); commit(); navFrom(e.currentTarget, e.shiftKey ? 'prev' : 'next'); }
          else if (e.key === 'Escape') setEditing(false);
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
      data-nav="note"
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

export function LineRow({ item, pax, rates, catColor, onUpd, onDel, onDup, index, warnings, prevItem, onMove, onAddRow, displayCurrency }: Props) {
  const warns = warnings ?? [];
  const vnd = calcVND(item, rates, pax);
  const off = !item.enabled;
  const u = (patch: Partial<Item>) => {
    const next = { ...item, ...patch };
    onUpd(next);
    // Tự học hạng mục cho gợi ý lần sau (chỉ khi đã có tên + đơn giá).
    if (next.name.trim() && next.price > 0)
      recordItem({ name: next.name, price: next.price, unit: next.unit, cur: next.cur });
  };
  // Line total in the chosen display currency (DMC) or VND.
  const fmtMoney = (n: number) =>
    displayCurrency && displayCurrency !== 'VND' ? fmtOutput(n, displayCurrency, rates) : fmtVND(n);

  // Đổi tên hạng mục: nếu dòng còn ở mặc định (chưa chỉnh đơn vị/kiểu SL) thì
  // tự đoán đơn vị + cách tính SL hợp lý từ tên. Không đụng dòng đã chỉnh tay.
  const onNameChange = (name: string) => {
    const patch: Partial<Item> = { name };
    if (item.unit === '/người' && item.qtyMode === 'per_pax') {
      const g = guessItemMeta(name);
      if (g) { patch.unit = g.unit; patch.qtyMode = g.qtyMode; }
    }
    u(patch);
  };

  const qty = qtyOf(item, pax);

  // Rooms scale with pax (formula) → read-only. Only package/custom take a typed number.
  const editableQty = item.qtyMode === 'custom' || item.qtyMode === 'package';

  const changeQtyMode = (m: QtyMode) => {
    const patch: Partial<Item> = { qtyMode: m };
    if (m === 'package') patch.customQty = Math.max(1, item.customQty || 1);
    u(patch);
  };

  return (
    <TableRow
      data-index={index}
      onKeyDown={(e: KeyboardEvent<HTMLTableRowElement>) => {
        if (!e.altKey) return;
        if (e.key === 'ArrowUp') { e.preventDefault(); onMove?.('up'); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); onMove?.('down'); }
        else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); onAddRow?.(); }
      }}
      sx={{ opacity: off ? 0.4 : 1, ...(warns.length ? { background: 'rgba(245,166,35,0.07)' } : null) }}
    >
      {/* STT + tay kéo sắp xếp */}
      <TableCell padding="checkbox" className="row-drag" sx={{ textAlign: 'center', cursor: 'grab', color: 'rgba(15,58,74,0.4)', userSelect: 'none', fontSize: 11, fontVariantNumeric: 'tabular-nums', '&:hover': { color: '#0d7a6a' } }} title="Kéo để đổi thứ tự">
        {typeof index === 'number' ? index + 1 : '⋮⋮'}
      </TableCell>
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
        <Stack direction="row" spacing={0.5} alignItems="center">
          {warns.length > 0 && (
            <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{warns.map((w) => `• ${w}`).join('\n')}</Box>}>
              <Box component="span" aria-label={`${warns.length} cảnh báo`}
                sx={{ flexShrink: 0, fontSize: 13, color: '#d18a13', cursor: 'help', lineHeight: 1 }}>⚠</Box>
            </Tooltip>
          )}
          <EditText value={item.name} onChange={onNameChange} placeholder="Mô tả..." bold navCol="name" fillFrom={prevItem?.name}
            suggest onPick={(s) => u({ name: s.name, price: s.price, unit: s.unit, cur: s.cur })} />
        </Stack>
      </TableCell>

      {/* Note (chi tiết / ghi chú — đa dòng, in đậm, hiện đầy đủ) */}
      <TableCell sx={{ minWidth: 260, maxWidth: 460, verticalAlign: 'top' }}>
        <EditNote
          value={item.note}
          onChange={(v) => u({ note: v })}
          fillFrom={prevItem?.note}
          placeholder="Chi tiết / ghi chú… (Enter để xuống dòng · **chữ** = in đậm · Ctrl/⌘+Enter để lưu)"
        />
      </TableCell>

      {/* Currency + price */}
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Sel value={item.cur} onChange={(e) => u({ cur: e.target.value })}>
            {Object.keys(rates).map((c) => <option key={c} value={c}>{c}</option>)}
          </Sel>
          <EditNum value={item.price} onChange={(v) => u({ price: v })} min={0} width={86} bold navCol="price" showWords fillFrom={prevItem?.price} />
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
        <EditNum value={item.times} onChange={(v) => u({ times: Math.max(1, v) })} min={1} width={48} align="center" navCol="times" fillFrom={prevItem?.times} />
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
