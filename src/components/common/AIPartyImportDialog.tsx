import { useState, type ChangeEvent } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';
import { parseNccAI, parseCustomerAI, type ParsedNcc, type ParsedCustomer } from '@/lib/partyParse';

type AnyParsed = ParsedNcc & ParsedCustomer;

/** AI nhập: dán văn bản / tải ảnh (danh thiếp, hồ sơ) → trích xuất → điền form. */
export function AIPartyImportDialog({ open, kind, onClose, onApply }: {
  open: boolean;
  kind: 'ncc' | 'customer';
  onClose: () => void;
  onApply: (parsed: ParsedNcc | ParsedCustomer) => void;
}) {
  const [text, setText] = useState('');
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [imgName, setImgName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedNcc | ParsedCustomer | null>(null);

  const reset = () => { setText(''); setImageB64(null); setImgName(''); setResult(null); setError(null); };
  const close = () => { reset(); onClose(); };

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setImageB64(String(reader.result).split(',')[1] ?? null); setImgName(f.name); };
    reader.readAsDataURL(f);
  };

  const run = () => {
    if (!text.trim() && !imageB64) return;
    setBusy(true); setError(null); setResult(null);
    const p = kind === 'ncc'
      ? parseNccAI({ text, imageB64: imageB64 ?? undefined })
      : parseCustomerAI({ text, imageB64: imageB64 ?? undefined });
    p.then((r) => setResult(r)).catch((e) => setError((e as Error).message)).finally(() => setBusy(false));
  };
  const apply = () => { if (result) { onApply(result); close(); } };

  const r = result as AnyParsed | null;
  const label = kind === 'ncc' ? 'nhà cung cấp' : 'khách hàng';

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>🤖 AI nhập thông tin {label}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          Dán danh thiếp / hồ sơ / chữ ký email… hoặc tải ảnh chụp. AI sẽ trích xuất rồi điền vào form (kiểm tra lại trước khi lưu).
        </Typography>
        <TextField fullWidth multiline minRows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'VD: CÔNG TY DU LỊCH ABC\nĐịa chỉ: 12 Lê Lợi, Đà Nẵng · MST: 0401234567\nNguyễn Văn A — Trưởng phòng KD · 0905 123 456 · a@abc.vn'}
          sx={{ '& textarea': { fontSize: 13.5 } }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Button component="label" size="small" variant="outlined" startIcon={<ImageIcon />}>
            Tải ảnh<input type="file" hidden accept="image/*" onChange={onPickImage} />
          </Button>
          {imgName && <Chip size="small" label={imgName} onDelete={() => { setImageB64(null); setImgName(''); }} />}
          <Box sx={{ flex: 1 }} />
          <Button onClick={run} disabled={busy || (!text.trim() && !imageB64)} variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
            {busy ? 'Đang phân tích…' : result ? 'Phân tích lại' : 'Phân tích'}
          </Button>
        </Stack>

        {error && !busy && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button size="small" onClick={run}>Thử lại</Button>}>{error}</Alert>}

        {r && !busy && (
          <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f7faf9' }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">KẾT QUẢ TRÍCH XUẤT</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.75 }}>
              {r.name && <Field label="Tên" value={r.name} />}
              {kind === 'customer' && r.type && <Field label="Loại" value={r.type === 'company' ? 'Công ty' : 'Cá nhân'} />}
              {kind === 'ncc' && r.sectors?.length ? <Field label="Lĩnh vực" value={r.sectors.join(', ')} /> : null}
              {kind === 'ncc' && r.location ? <Field label="Địa điểm" value={r.location} /> : null}
              {kind === 'customer' && r.address ? <Field label="Địa chỉ" value={r.address} /> : null}
              {kind === 'customer' && r.taxCode ? <Field label="MST" value={r.taxCode} /> : null}
              {kind === 'customer' && r.source ? <Field label="Nguồn" value={r.source} /> : null}
              {kind === 'customer' && r.tags?.length ? <Field label="Nhãn" value={r.tags.join(', ')} /> : null}
              {(r.contacts ?? []).map((c, i) => (
                <Field key={i} label={`Liên hệ ${i + 1}`} value={[c.name, c.position, c.phone, c.email].filter(Boolean).join(' · ')} />
              ))}
              {r.note && <Field label="Ghi chú" value={r.note} />}
            </Stack>
            {r.analysis && (
              <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}>
                <Typography variant="caption" fontWeight={800} sx={{ color: '#7c3aed' }}>🔎 Nhận định AI</Typography>
                <Typography variant="body2" color="text.secondary">{r.analysis}</Typography>
              </Box>
            )}
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>⚠ AI có thể nhầm — hãy kiểm tra lại sau khi điền. Nhận định chỉ để tham khảo.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">Huỷ</Button>
        {result && <Button variant="contained" onClick={apply} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Điền vào form</Button>}
      </DialogActions>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 92 }}>{label}</Typography>
      <Typography variant="body2" color="text.secondary">{value}</Typography>
    </Stack>
  );
}
