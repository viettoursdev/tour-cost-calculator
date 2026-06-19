import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { extractFileContent, parseQuoteAI, type ParsedQuoteLine, type QuoteCat } from '@/lib/quoteFileParse';
import { useQuoteStore } from '@/stores/quoteStore';
import { getCATS } from './constants';
import { fmtVND } from './calc';
import { toast } from '@/stores/toastStore';
import type { CategoryId, Item, QtyMode, Template } from '@/types';

const QTY_LABEL: Record<QtyMode, string> = {
  per_pax: '×khách', per_group: 'đoàn', single_room: 'phòng đơn', double_room: 'phòng đôi', package: 'gói', custom: 'tuỳ',
};

/** Upload file báo giá → AI phân tích → xem trước → thêm vào bảng giá. */
export function AIQuoteImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const addItems = useQuoteStore((s) => s.addItems);
  const toggleCat = useQuoteStore((s) => s.toggleCat);

  const catDefs = useMemo(() => getCATS(template), [template]);
  const cats: QuoteCat[] = useMemo(() => catDefs.map((c) => ({ id: c.id as CategoryId, label: c.label })), [catDefs]);
  const catMeta = useMemo(() => Object.fromEntries(catDefs.map((c) => [c.id, c])), [catDefs]);

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
          <Button onClick={run} disabled={!file || busy} variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
            {busy ? (progress || 'Đang xử lý…') : result ? 'Phân tích lại' : 'Phân tích'}
          </Button>
        </Stack>

        {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run}>Thử lại</Button>}>{error}</Alert>}

        {result && result.length > 0 && !busy && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              XEM TRƯỚC — {result.length} dòng / {grouped.size} hạng mục
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 0.75, maxHeight: 340, overflowY: 'auto' }}>
              {[...grouped.entries()].map(([cid, lines]) => (
                <Box key={cid} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
                  <Typography variant="body2" fontWeight={800} sx={{ mb: 0.5 }}>
                    {catMeta[cid]?.icon} {catMeta[cid]?.label ?? cid} <Chip size="small" label={`${lines.length} dòng`} sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                  </Typography>
                  {lines.map((l, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="baseline" sx={{ fontSize: 13, py: 0.15 }}>
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{l.name}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {l.cur === 'VND' ? fmtVND(l.price) : `${l.price.toLocaleString('vi-VN')} ${l.cur}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{l.unit}{l.times > 1 ? ` ×${l.times}` : ''}</Typography>
                      <Chip size="small" label={QTY_LABEL[l.qtyMode]} sx={{ height: 17, fontSize: 9.5, bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a' }} />
                    </Stack>
                  ))}
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              ⚠ AI có thể nhầm phân loại/đơn giá. Sau khi thêm, hãy soát lại trong bảng giá (đặc biệt <b>cách tính SL</b>: ×pax / theo đoàn…).
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
