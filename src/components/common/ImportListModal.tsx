import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { LEGACY } from '@/theme';
import { toast } from '@/stores/toastStore';
import { parseTableAI } from '@/lib/aiTableParse';

export type ImportCol = { key: string; label: string; aliases?: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: ImportCol[];
  note?: string;
  /** Returns the number of rows actually added. */
  onImport: (rows: Record<string, string>[]) => Promise<number>;
};

const norm = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Parse pasted CSV/TSV text into a row matrix (quote-aware). */
function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  ws?.eachRow((r) => {
    const vals = (r.values as unknown[]).slice(1).map((v) => {
      if (v == null) return '';
      if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
        return String((v as { text: unknown }).text ?? '');
      }
      return String(v);
    });
    rows.push(vals);
  });
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function mapRows(matrix: string[][], cols: ImportCol[]): Record<string, string>[] {
  if (matrix.length < 2) return [];
  const header = matrix[0].map(norm);
  const idx: Record<string, number> = {};
  cols.forEach((c) => {
    const cands = [c.key, c.label, ...(c.aliases ?? [])].map(norm);
    const i = header.findIndex((h) => cands.includes(h));
    if (i >= 0) idx[c.key] = i;
  });
  return matrix.slice(1)
    .map((r) => {
      const o: Record<string, string> = {};
      cols.forEach((c) => { o[c.key] = (idx[c.key] != null ? (r[idx[c.key]] ?? '') : '').trim(); });
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));
}

export function ImportListModal({ open, onClose, title, columns, note, onImport }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const reset = () => { setText(''); setRows([]); setError(null); };

  const previewFromText = () => {
    setError(null);
    try {
      const mapped = mapRows(parseDelimited(text), columns);
      if (!mapped.length) setError('Không đọc được dòng nào — dòng tiêu đề (header) chưa khớp tên cột. Hãy bấm “🤖 AI quét” để AI tự nhận diện.');
      setRows(mapped);
    } catch (e) { setError('Lỗi đọc dữ liệu: ' + (e as Error).message); }
  };

  const aiScan = () => {
    setError(null); setAiBusy(true);
    parseTableAI(text, columns)
      .then((mapped) => { if (!mapped.length) setError('AI không trích được dòng nào — kiểm tra lại nội dung dán.'); setRows(mapped); })
      .catch((e) => setError('AI quét lỗi: ' + (e as Error).message))
      .finally(() => setAiBusy(false));
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    try {
      let matrix: string[][];
      if (f.name.toLowerCase().endsWith('.xlsx')) matrix = await parseXlsx(await f.arrayBuffer());
      else matrix = parseDelimited(await f.text());
      const mapped = mapRows(matrix, columns);
      if (!mapped.length) setError('Không đọc được dòng nào. Kiểm tra header có khớp tên cột không.');
      setRows(mapped);
    } catch (err) { setError('Lỗi đọc file: ' + (err as Error).message); }
  };

  const doImport = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const added = await onImport(rows);
      toast(`✅ Đã nhập ${added} mục mới (bỏ qua trùng tên / để trống).`);
      reset();
      onClose();
    } catch (e) {
      setError('Lỗi nhập: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ background: LEGACY.headerGradient, color: '#fff', fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            Dán dữ liệu từ Excel/Google Sheets (gồm dòng tiêu đề) hoặc tải file .csv/.xlsx — bấm <strong>Xem trước (dán)</strong>.
            Dữ liệu lộn xộn / không có tiêu đề chuẩn? Bấm <strong>🤖 AI quét</strong> để AI tự nhận diện.
            Cột nhận biết: <strong>{columns.map((c) => c.label).join(' · ')}</strong>.
            {note ? ` ${note}` : ''} Bỏ qua dòng trùng tên hoặc để trống.
          </Typography>
          <TextField
            label="Dán dữ liệu (Tab/CSV)" multiline minRows={4} value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={columns.map((c) => c.label).join('\t')}
          />
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button variant="outlined" onClick={previewFromText} disabled={!text.trim() || busy || aiBusy}>Xem trước (dán)</Button>
            <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={aiScan} disabled={!text.trim() || busy || aiBusy}
              sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
              {aiBusy ? 'AI đang quét…' : '🤖 AI quét'}
            </Button>
            <Button component="label" variant="outlined" disabled={busy || aiBusy}>
              Tải file .csv/.xlsx
              <Box component="input" type="file" hidden accept=".csv,.xlsx" onChange={onPickFile} />
            </Button>
            {rows.length > 0 && <Typography fontWeight={700} color={LEGACY.teal}>{rows.length} dòng đọc được</Typography>}
          </Stack>

          {error && <Alert severity="warning">{error}</Alert>}

          {rows.length > 0 && (
            <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid rgba(20,150,140,0.2)', borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>{columns.map((c) => <TableCell key={c.key} sx={{ fontWeight: 700 }}>{c.label}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>{columns.map((c) => <TableCell key={c.key}>{r[c.key]}</TableCell>)}</TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" onClick={doImport} disabled={!rows.length || busy || aiBusy} sx={{ background: LEGACY.headerGradient, fontWeight: 700 }}>
          {busy ? 'Đang nhập…' : `Nhập ${rows.length} mục`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
