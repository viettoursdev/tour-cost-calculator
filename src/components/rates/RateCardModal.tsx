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
};

export function RateCardModal({ open, onClose, type, label }: Props) {
  const storageKey = `vte_rate_${type}`;
  const stored = useRateCardStore((s) => s.rates.otherRates[storageKey]);
  const updateOtherRate = useRateCardStore((s) => s.updateOtherRate);

  const rows = useMemo(() => asRows(stored), [stored]);

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
      <DialogTitle>
        📋 Rate Card · {label}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          ({storageKey})
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chưa có dữ liệu cho hạng mục này. Bấm <strong>+ Thêm dòng</strong> để bắt đầu.
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
                      <TextField
                        size="small"
                        value={r[c] ?? ''}
                        onChange={(e) => editCell(idx, c, e.target.value)}
                        fullWidth
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <IconButton size="small" onClick={() => deleteRow(idx)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
