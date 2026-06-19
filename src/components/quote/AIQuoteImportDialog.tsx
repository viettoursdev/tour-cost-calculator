import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { AiButton } from '@/components/common/AiButton';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { extractFileContent, parseQuoteAI, type ParsedQuoteLine, type QuoteCat } from '@/lib/quoteFileParse';
import { parseAmountVN } from '@/lib/numParse';
import { useQuoteStore } from '@/stores/quoteStore';
import { getCATS } from './constants';
import { toast } from '@/stores/toastStore';
import type { CategoryId, Item, QtyMode, Template } from '@/types';

const QTY_LABEL: Record<QtyMode, string> = {
  per_pax: '×khách', per_group: 'đoàn', single_room: 'phòng đơn', double_room: 'phòng đôi', room: 'phòng', package: 'gói', custom: 'tuỳ',
};

/** Upload file báo giá → AI phân tích → xem trước → thêm vào bảng giá. */
export function AIQuoteImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const addItems = useQuoteStore((s) => s.addItems);
  const toggleCat = useQuoteStore((s) => s.toggleCat);

  const catDefs = useMemo(() => getCATS(template), [template]);
  const cats: QuoteCat[] = useMemo(() => catDefs.map((c) => ({ id: c.id as CategoryId, label: c.label })), [catDefs]);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedQuoteLine[] | null>(null);

  const reset = () => { setFile(null); setResult(null); setError(null); setProgress(''); };
  const close = () => { reset(); onClose(); };

  const pick = (f: File | null | undefined) => { if (f) { setFile(f); setResult(null); setError(null); } };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files[0]); };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => { pick(e.target.files?.[0]); e.target.value = ''; };

  const run = () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setProgress('Đang đọc file…');
    extractFileContent(file, setProgress)
      .then((c) => { setProgress('AI đang phân tích…'); return parseQuoteAI({ text: c.text, imageB64: c.imageB64 }, cats); })
      .then((lines) => { setResult(lines); if (!lines.length) setError('AI không tìm được dòng chi phí nào trong file.'); })
      .catch((e) => setError((e as Error).message))
      .finally(() => { setBusy(false); setProgress(''); });
  };

  const grouped = useMemo(() => {
    const m = new Map<CategoryId, ParsedQuoteLine[]>();
    (result ?? []).forEach((l) => { const a = m.get(l.category) ?? []; a.push(l); m.set(l.category, a); });
    return m;
  }, [result]);

  const apply = () => {
    if (!result?.length) return;
    let total = 0;
    grouped.forEach((lines, cid) => {
      if (!catEnabled[cid]) toggleCat(cid);
      const items: Partial<Item>[] = lines.map((l) => ({
        name: l.name, price: l.price, cur: l.cur, times: l.times, qtyMode: l.qtyMode,
        ...(l.unit ? { unit: l.unit } : {}), ...(l.note ? { note: l.note } : {}),
      }));
      addItems(cid, items);
      total += items.length;
    });
    toast(`✅ Đã thêm ${total} dòng từ file vào bảng giá. Hãy kiểm tra đơn vị / cách tính SL.`);
    close();
  };

  const update = (idx: number, patch: Partial<ParsedQuoteLine>) =>
    setResult((prev) => (prev ? prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)) : prev));
  const remove = (idx: number) =>
    setResult((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="md" fullWidth>
      <DialogTitle>🤖 AI nhập báo giá từ file</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          Tải lên file báo giá (<b>Excel .xlsx · PDF · Word .docx · CSV · ảnh chụp</b>). AI sẽ bóc từng dòng chi phí, phân loại vào hạng mục, đoán cả <b>cách tính SL</b> (×khách / đoàn / phòng) rồi điền vào bảng giá (kiểm tra lại trước khi dùng).
        </Typography>

        <Box
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          sx={{
            p: 2, borderRadius: 2, border: '1.5px dashed', textAlign: 'center',
            borderColor: dragOver ? '#7c3aed' : 'rgba(124,58,237,0.35)',
            bgcolor: dragOver ? 'rgba(124,58,237,0.08)' : 'transparent', transition: 'all .15s',
          }}
        >
          <UploadFileIcon sx={{ color: '#7c3aed', fontSize: 30 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#7c3aed', mt: 0.5 }}>
            {file ? file.name : 'Kéo-thả file vào đây hoặc bấm Chọn file'}
          </Typography>
          <Button component="label" size="small" variant="outlined" sx={{ mt: 1 }}>
            Chọn file<input type="file" hidden accept=".xlsx,.pdf,.docx,.csv,.tsv,.txt,image/*" onChange={onInput} />
          </Button>
        </Box>

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.25 }}>
          <AiButton onClick={run} disabled={!file || busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {busy ? (progress || 'Đang xử lý…') : result ? 'Phân tích lại' : 'Phân tích'}
          </AiButton>
        </Stack>

        {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run}>Thử lại</Button>}>{error}</Alert>}

        {result && result.length > 0 && !busy && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              XEM TRƯỚC & CHỈNH — {result.length} dòng / {grouped.size} hạng mục (sửa hạng mục · SL · tên · giá trước khi thêm)
            </Typography>
            <TableContainer sx={{ mt: 0.75, maxHeight: 360, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: '#f3faf8', fontWeight: 700, fontSize: 12 } }}>
                    <TableCell>Tên dịch vụ</TableCell>
                    <TableCell sx={{ width: 110 }}>Đơn giá</TableCell>
                    <TableCell sx={{ width: 150 }}>Hạng mục</TableCell>
                    <TableCell sx={{ width: 120 }}>Cách tính SL</TableCell>
                    <TableCell sx={{ width: 36 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.map((l, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>
                        <TextField variant="standard" fullWidth value={l.name} onChange={(e) => update(idx, { name: e.target.value })}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }} />
                      </TableCell>
                      <TableCell>
                        <TextField variant="standard" value={String(l.price)} onChange={(e) => update(idx, { price: parseAmountVN(e.target.value) })}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 13, fontWeight: 700 } }} inputProps={{ inputMode: 'decimal' }} sx={{ width: 100 }} />
                        <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.25 }}>{l.cur}{l.times > 1 ? ` ×${l.times}` : ''}</Typography>
                      </TableCell>
                      <TableCell>
                        <Select variant="standard" disableUnderline fullWidth value={l.category} onChange={(e) => update(idx, { category: e.target.value as ParsedQuoteLine['category'] })} sx={{ fontSize: 12.5 }}>
                          {catDefs.map((c) => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12.5 }}>{c.icon} {c.label}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select variant="standard" disableUnderline fullWidth value={l.qtyMode} onChange={(e) => update(idx, { qtyMode: e.target.value as ParsedQuoteLine['qtyMode'] })} sx={{ fontSize: 12.5 }}>
                          {(Object.keys(QTY_LABEL) as (keyof typeof QTY_LABEL)[]).map((k) => <MenuItem key={k} value={k} sx={{ fontSize: 12.5 }}>{QTY_LABEL[k]}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell sx={{ p: 0 }}>
                        <IconButton size="small" color="error" onClick={() => remove(idx)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              ⚠ AI có thể nhầm — chỉnh ngay tại đây trước khi thêm. Có thể sửa thêm trong bảng giá sau.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">Huỷ</Button>
        {result && result.length > 0 && (
          <Button variant="contained" onClick={apply} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            Thêm {result.length} dòng vào báo giá
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
