import { useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, Typography,
} from '@mui/material';
import { AiButton } from '@/components/common/AiButton';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { toast } from '@/stores/toastStore';
import { analyzeRestaurantFileMulti, type ParsedRestaurant } from '@/lib/restaurantFileParse';
import { StarRating } from './StarRating';
import type { Restaurant } from '@/types';

type Result = { parsed: ParsedRestaurant; restaurant: Restaurant };

/**
 * Upload file/ảnh thực đơn → AI phân tích → có thể NHIỀU nhà hàng cùng lúc.
 * User duyệt LẦN LƯỢT từng nhà hàng: thêm mới / ghép vào NH có sẵn / bỏ qua.
 */
export function AIRestaurantImportDialog({ open, onClose, onAdd, onMerge, restaurants }: {
  open: boolean;
  onClose: () => void;
  onAdd: (r: Restaurant) => void;
  onMerge: (targetId: string, parsed: ParsedRestaurant) => void;
  restaurants: Restaurant[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [idx, setIdx] = useState(0);          // nhà hàng đang duyệt
  const [target, setTarget] = useState('');   // '' = thêm mới, hoặc id NH để ghép
  const [done, setDone] = useState(0);        // số nhà hàng đã áp dụng (để báo cuối)

  const reset = () => { setFile(null); setResults([]); setIdx(0); setTarget(''); setDone(0); setError(null); setProgress(''); };
  const close = () => { reset(); onClose(); };
  const pick = (f: File | null | undefined) => { if (f) { setFile(f); setResults([]); setIdx(0); setError(null); } };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files[0]); };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => { pick(e.target.files?.[0]); e.target.value = ''; };

  const run = () => {
    if (!file) return;
    setBusy(true); setError(null); setResults([]); setIdx(0); setDone(0); setProgress('Đang đọc file…');
    analyzeRestaurantFileMulti(file, setProgress)
      .then((list) => {
        if (list.length === 0) { setError('AI không trích được nhà hàng nào từ file.'); return; }
        setResults(list); setIdx(0); setTarget('');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => { setBusy(false); setProgress(''); });
  };

  // Sang nhà hàng kế; hết danh sách → đóng + báo tổng kết.
  const advance = (appliedDelta: number) => {
    const nextDone = done + appliedDelta;
    if (idx + 1 < results.length) {
      setDone(nextDone); setIdx(idx + 1); setTarget('');
    } else {
      if (nextDone > 0) toast(`✅ Đã xử lý ${nextDone}/${results.length} nhà hàng.`);
      close();
    }
  };

  const current = results[idx] ?? null;
  const applyCurrent = () => {
    if (!current) return;
    if (target) onMerge(target, current.parsed); else onAdd(current.restaurant);
    advance(1);
  };
  const skipCurrent = () => advance(0);

  const p = current?.parsed;
  const multi = results.length > 1;
  const isLast = idx === results.length - 1;

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>
        🤖 AI nhập nhà hàng từ thực đơn
        {results.length > 0 && (
          <Chip size="small" label={`Nhà hàng ${idx + 1}/${results.length}`} color="primary"
            sx={{ ml: 1, fontWeight: 700, verticalAlign: 'middle' }} />
        )}
      </DialogTitle>
      <DialogContent dividers>
        {results.length === 0 && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
              Tải file/ảnh thực đơn (<b>ảnh · PDF · Excel · Word · CSV</b>). AI bóc thông tin nhà hàng + set menu;
              một file có thể chứa <b>nhiều nhà hàng</b> — bạn sẽ duyệt lần lượt từng nhà hàng.
            </Typography>

            <Box onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              sx={{ p: 2, borderRadius: 2, border: '1.5px dashed', textAlign: 'center', borderColor: dragOver ? '#7c3aed' : 'rgba(124,58,237,0.35)', bgcolor: dragOver ? 'rgba(124,58,237,0.08)' : 'transparent', transition: 'all .15s' }}>
              <UploadFileIcon sx={{ color: '#7c3aed', fontSize: 30 }} />
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#7c3aed', mt: 0.5 }}>{file ? file.name : 'Kéo-thả file vào đây hoặc bấm Chọn file'}</Typography>
              <Button component="label" size="small" variant="outlined" sx={{ mt: 1 }}>
                Chọn file<input type="file" hidden accept=".xlsx,.pdf,.docx,.csv,.txt,image/*" onChange={onInput} />
              </Button>
            </Box>

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.25 }}>
              <AiButton onClick={run} disabled={!file || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                {busy ? (progress || 'Đang xử lý…') : 'Phân tích'}
              </AiButton>
            </Stack>

            {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run} disabled={!file}>Thử lại</Button>}>{error}</Alert>}
          </>
        )}

        {p && (
          <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f7faf9' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Typography fontWeight={800}>{p.name || '(chưa rõ tên)'}</Typography>
              {p.rating > 0 && <StarRating value={p.rating} onChange={() => {}} size={15} />}
            </Stack>
            {(p.address || p.city || p.country) && <Typography variant="body2" color="text.secondary">📍 {[p.address, p.city, p.country, p.continent].filter(Boolean).join(' · ')}</Typography>}
            {p.contact && <Typography variant="body2" color="text.secondary">☎ {p.contact}</Typography>}
            {p.note && <Typography variant="body2" color="text.secondary">📝 {p.note}</Typography>}
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ display: 'block', mt: 1 }}>{p.menus.length} set menu:</Typography>
            <Stack spacing={0.75} sx={{ mt: 0.5, maxHeight: 220, overflowY: 'auto' }}>
              {p.menus.map((m, i) => (
                <Box key={i} sx={{ p: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={700}>{m.name}</Typography>
                    <Typography variant="body2" fontWeight={700}>{m.price.toLocaleString('vi-VN')} {m.cur}</Typography>
                  </Stack>
                  {m.dishes && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{m.dishes}</Typography>}
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>⚠ AI có thể nhầm — sau khi thêm hãy soát lại trong thư viện.</Typography>

            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Áp dụng vào:</Typography>
              <Select size="small" fullWidth value={target} onChange={(e) => setTarget(e.target.value)}>
                <MenuItem value="">➕ Thêm nhà hàng mới</MenuItem>
                {restaurants.map((r) => (
                  <MenuItem key={r.id} value={r.id}>✎ {r.name || '(chưa đặt tên)'}{r.city ? ` · ${r.city}` : ''}</MenuItem>
                ))}
              </Select>
              {target && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Sẽ ghép set menu + điền các ô đang trống vào nhà hàng đã chọn.</Typography>}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">{results.length > 0 ? 'Đóng' : 'Huỷ'}</Button>
        {current && (
          <>
            {multi && <Button onClick={skipCurrent} color="inherit">Bỏ qua</Button>}
            <Button variant="contained" onClick={applyCurrent} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
              {target ? 'Điền vào nhà hàng' : 'Thêm vào thư viện'}{multi ? (isLast ? ' & xong' : ' & tiếp →') : ''}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
