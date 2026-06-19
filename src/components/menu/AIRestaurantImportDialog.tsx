import { useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { analyzeRestaurantFile, type ParsedRestaurant } from '@/lib/restaurantFileParse';
import { StarRating } from './StarRating';
import type { Restaurant } from '@/types';

/** Upload file/ảnh thực đơn → AI phân tích → thêm NH mới hoặc điền vào NH đang có. */
export function AIRestaurantImportDialog({ open, onClose, onAdd, onMerge, restaurants }: {
  open: boolean;
  onClose: () => void;
  onAdd: (r: Restaurant) => void;
  onMerge: (targetId: string, parsed: ParsedRestaurant) => void;
  restaurants: Restaurant[];
}) {
  const [target, setTarget] = useState('');  // '' = thêm mới
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ parsed: ParsedRestaurant; restaurant: Restaurant } | null>(null);

  const reset = () => { setFile(null); setResult(null); setError(null); setProgress(''); setTarget(''); };
  const close = () => { reset(); onClose(); };
  const pick = (f: File | null | undefined) => { if (f) { setFile(f); setResult(null); setError(null); } };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files[0]); };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => { pick(e.target.files?.[0]); e.target.value = ''; };

  const run = () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setProgress('Đang đọc file…');
    analyzeRestaurantFile(file, setProgress)
      .then((r) => { setResult(r); if (!r.parsed.name && r.parsed.menus.length === 0) setError('AI không trích được thông tin nhà hàng.'); })
      .catch((e) => setError((e as Error).message))
      .finally(() => { setBusy(false); setProgress(''); });
  };
  const apply = () => {
    if (!result) return;
    if (target) onMerge(target, result.parsed); else onAdd(result.restaurant);
    close();
  };

  const p = result?.parsed;

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>🤖 AI nhập nhà hàng từ thực đơn</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          Tải file/ảnh thực đơn (<b>ảnh · PDF · Excel · Word · CSV</b>). AI sẽ bóc thông tin nhà hàng + các set menu rồi thêm vào thư viện (kiểm tra lại sau).
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
          <Button onClick={run} disabled={!file || busy} variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />} sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
            {busy ? (progress || 'Đang xử lý…') : result ? 'Phân tích lại' : 'Phân tích'}
          </Button>
        </Stack>

        {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run}>Thử lại</Button>}>{error}</Alert>}

        {p && !busy && (
          <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f7faf9' }}>
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
        <Button onClick={close} color="inherit">Huỷ</Button>
        {result && (
          <Button variant="contained" onClick={apply} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            {target ? 'Điền vào nhà hàng' : 'Thêm vào thư viện'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
