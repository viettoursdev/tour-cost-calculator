import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useRateCardStore } from '@/stores/rateCardStore';
import type { Item } from '@/types';

// Generic editor for any of the "other rate" categories (transport, staff, dmc, insurance,
// logistics, gala, teambuild, meeting). Legacy stores each as an array of objects at
// localStorage key vte_rate_<type> (or vte_rate_<template>_<type>_<selectorId> for
// city/country-scoped ones). For the Vite refactor we collapse this into a single
// otherRates[<key>] entry per category — the per-template/per-city slicing is the Cost
// view's concern (Phase 3). This editor edits arbitrary key/value rows of the saved blob.

type Row = Record<string, string | number>;

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.map((r) => {
    if (!r || typeof r !== 'object') return {};
    const out: Row = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      if (typeof v === 'number') out[k] = v;
      else if (typeof v === 'string') out[k] = v;
      else if (v != null) out[k] = String(v);
    }
    return out;
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  type: string;
  label: string;
  /** When set, the modal switches to picker mode: each row is read-only
   *  with a "Chọn" button that emits a partial Item to the caller. */
  onPick?: (line: Partial<Item>) => void;
};

function pickRow(r: Row): { price: number; name: string; unit: string; note: string } {
  // Average min/max when both exist; else fall back to price/cost/amount columns.
  const min = typeof r.min === 'number' ? r.min : Number(r.min) || 0;
  const max = typeof r.max === 'number' ? r.max : Number(r.max) || 0;
  let price = 0;
  if (min > 0 && max > 0) price = Math.round((min + max) / 2);
  else if (max > 0) price = max;
  else if (min > 0) price = min;
  else {
    for (const k of ['price', 'cost', 'amount', 'fee']) {
      const v = r[k];
      if (typeof v === 'number') { price = v; break; }
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) { price = n; break; }
    }
  }
  const name = String(r.label ?? r.name ?? r.title ?? '').trim() || '(không tên)';
  const unit = String(r.unit ?? '').trim() || '/đơn vị';
  const note = String(r.note ?? r.desc ?? '').trim();
  return { price, name, unit, note };
}

export function RateCardModal({ open, onClose, type, label, onPick }: Props) {
  const isPicker = !!onPick;
  const storageKey = `vte_rate_${type}`;
  const stored = useRateCardStore((s) => s.rates.otherRates[storageKey]);
  const updateOtherRate = useRateCardStore((s) => s.updateOtherRate);

  const rows = useMemo(() => asRows(stored), [stored]);

  // Edit/view-mode toggle (legacy at public/legacy.html:2322). Picker mode is
  // always read-only; editor mode defaults to view (prevents accidental edits)
  // and flips to true when the user clicks "✏️ Sửa".
  const [editMode, setEditMode] = useState(false);
  const readOnly = isPicker || !editMode;

  // Column set: union of keys across all rows, or sensible defaults for an empty list.
  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    if (set.size === 0) {
      ['label', 'min', 'max', 'unit', 'note'].forEach((k) => set.add(k));
    }
    return Array.from(set);
  }, [rows]);

  const [newCol, setNewCol] = useState('');

  const save = (next: Row[]) =>
    updateOtherRate(storageKey, next as unknown as Record<string, unknown>);

  const addRow = () => {
    const blank: Row = {};
    columns.forEach((c) => (blank[c] = ''));
    save([...rows, blank]);
  };

  const deleteRow = (idx: number) => {
    if (!confirm('Xoá dòng này?')) return;
    save(rows.filter((_, i) => i !== idx));
  };

  const editCell = (idx: number, col: string, raw: string) => {
    // Preserve numeric type if cell is currently a number AND new value parses as number.
    const current = rows[idx]?.[col];
    let parsed: string | number = raw;
    if (typeof current === 'number' || /^(min|max|price|cost|amount|qty|count|fee)$/i.test(col)) {
      const n = Number(raw);
      parsed = Number.isFinite(n) && raw.trim() !== '' ? n : raw;
    }
    save(rows.map((r, i) => (i === idx ? { ...r, [col]: parsed } : r)));
  };

  const addColumn = () => {
    const name = newCol.trim();
    if (!name) return;
    if (columns.includes(name)) {
      setNewCol('');
      return;
    }
    save(rows.map((r) => ({ ...r, [name]: '' })));
    setNewCol('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ flex: 1 }}>
            <Typography fontSize={18} fontWeight={800}>
              📋 {isPicker ? `Chọn ${label} từ rate card` : `Rate Card · ${label}`}
            </Typography>
            {!isPicker && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25, opacity: 0.85 }}>
                {editMode ? '✏️ Chế độ chỉnh sửa — click số để sửa' : '👀 Chế độ xem — bấm "Sửa" để chỉnh giá'}
              </Typography>
            )}
          </Box>
          {!isPicker && (
            <Button
              size="small"
              variant={editMode ? 'contained' : 'outlined'}
              color={editMode ? 'success' : 'inherit'}
              onClick={() => setEditMode((v) => !v)}
              sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
            >
              {editMode ? '✓ Xong' : '✏️ Sửa'}
            </Button>
          )}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chưa có dữ liệu cho khu vực này. Bấm <strong>+ Thêm dòng</strong> để bắt đầu.
          </Typography>
        )}

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c}>{c}</TableCell>
                ))}
                <TableCell width={48} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  {columns.map((c) => (
                    <TableCell key={c}>
                      {readOnly ? (
                        <Typography variant="body2"
                          fontWeight={c === 'label' || c === 'name' ? 700 : 400}
                          sx={{ whiteSpace: 'nowrap' }}>
                          {typeof r[c] === 'number' ? r[c].toLocaleString('vi-VN') : (r[c] ?? '')}
                        </Typography>
                      ) : (
                        <TextField
                          size="small"
                          value={r[c] ?? ''}
                          onChange={(e) => editCell(idx, c, e.target.value)}
                          fullWidth
                        />
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    {isPicker ? (
                      <Button size="small" variant="contained"
                        onClick={() => {
                          const { price, name, unit, note } = pickRow(r);
                          onPick!({
                            name, cur: 'VND', price, unit,
                            qtyMode: 'custom', customQty: 1, note,
                          });
                          onClose();
                        }}>
                        Chọn →
                      </Button>
                    ) : editMode ? (
                      <IconButton size="small" onClick={() => deleteRow(idx)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {!isPicker && editMode && (
          <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={addRow}>
              Thêm dòng
            </Button>
            <TextField
              size="small"
              placeholder="Tên cột mới"
              value={newCol}
              onChange={(e) => setNewCol(e.target.value)}
            />
            <Button variant="outlined" onClick={addColumn} disabled={!newCol.trim()}>
              Thêm cột
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
