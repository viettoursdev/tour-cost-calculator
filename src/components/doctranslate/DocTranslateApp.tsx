import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TranslateIcon from '@mui/icons-material/Translate';
import { saveAs } from 'file-saver';
import { callAIWorker, getAIWorker, setAIWorker } from '@/lib/aiWorker';
import { chunkText, extractDocx, extractImage, extractPdf } from '@/lib/docExtract';
import { translateDocxInPlace } from '@/lib/docxTranslate';
// Trình xuất bản dịch nạp động khi bấm.

type Props = { onExit: () => void };

const ACCEPTED = '.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp';
const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

export function DocTranslateApp({ onExit }: Props) {
  const [workerUrl, setWorkerUrl] = useState(getAIWorker());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [source, setSource] = useState('');
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');
  const [layoutBusy, setLayoutBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const hasWorker = !!getAIWorker();
  const isDocx = !!file && file.name.toLowerCase().endsWith('.docx');

  // Dịch .docx GIỮ NGUYÊN layout (bảng/định dạng) → tải về .docx mới.
  const exportLayoutDocx = async () => {
    if (!file) return;
    setLayoutBusy(true); setErr(''); setProgress('Đang đọc file Word...');
    try {
      const blob = await translateDocxInPlace(
        file,
        async (t) => (await callAIWorker('/translate', { text: t })).text ?? '',
        setProgress,
      );
      const base = file.name.replace(/\.[^.]+$/, '') || 'BanDich';
      saveAs(blob, `${base}_EN.docx`);
      setProgress('');
    } catch (e) {
      setErr((e as Error).message);
      setProgress('');
    } finally {
      setLayoutBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setSource('');
      setResult('');
      setErr('');
    }
    e.target.value = '';
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setErr(''); setSource(''); setResult('');
    try {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      let text = '';
      setProgress('Đang trích xuất nội dung...');
      if (ext === 'docx') text = await extractDocx(file);
      else if (ext === 'pdf') text = await extractPdf(file, setProgress);
      else if (IMG_EXTS.has(ext)) text = await extractImage(file, setProgress);
      else throw new Error('Định dạng không hỗ trợ (.docx, .pdf, .png, .jpg)');
      text = text.trim();
      if (!text) throw new Error('Không trích xuất được nội dung (file rỗng hoặc OCR không ra chữ).');
      setSource(text);

      const chunks = chunkText(text, 3500);
      const out: string[] = [];
      for (let i = 0; i < chunks.length; i += 1) {
        setProgress(`Đang dịch phần ${i + 1}/${chunks.length}...`);
        const r = await callAIWorker('/translate', { text: chunks[i] });
        out.push(r.text ?? '');
      }
      setResult(out.join('\n\n').trim());
      setProgress('');
    } catch (e) {
      setErr((e as Error).message);
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100%' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>📑 Dịch hồ sơ (Việt → Anh)</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              OCR scan + dịch sạch · Word/PDF
            </Typography>
          </Box>
          <Button color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onExit}>
            Quay lại
          </Button>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        {!hasWorker && (
          <Paper sx={{ p: 2, mb: 2, borderLeft: '4px solid #f5a623' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#d18a13', mb: 1 }}>
              ⚙️ Chưa cấu hình AI Worker URL
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Dán URL Cloudflare Worker (cùng URL với Chương trình tour). Cần đã thêm endpoint /ocr &amp; /translate.
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField fullWidth size="small" value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                placeholder="https://viettours-ai.xxx.workers.dev" />
              <Button variant="contained"
                onClick={() => {
                  setAIWorker(workerUrl.trim());
                  window.location.reload();
                }}
                sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', whiteSpace: 'nowrap' }}>
                Lưu
              </Button>
            </Stack>
          </Paper>
        )}

        <Paper sx={{ p: 3, mb: 2 }}>
          <input ref={fileRef} type="file" accept={ACCEPTED} onChange={onFile} hidden />
          <Box
            onClick={() => fileRef.current?.click()}
            sx={{
              border: '2px dashed rgba(20,150,140,0.4)',
              borderRadius: 1.5, p: 3.5, textAlign: 'center', cursor: 'pointer',
              bgcolor: 'rgba(20,150,140,0.03)',
              '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' },
            }}
          >
            <Typography fontSize={38} sx={{ mb: 1 }}>📎</Typography>
            <Typography fontWeight={800}>
              {file ? file.name : 'Chọn file để dịch'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Word (.docx) · PDF (có chữ hoặc scan) · Ảnh (.jpg/.png)
            </Typography>
          </Box>
          <Button fullWidth variant="contained" size="large"
            startIcon={<TranslateIcon />}
            disabled={!file || busy || layoutBusy}
            onClick={() => void run()}
            sx={{ mt: 1.5, background: (!file || busy || layoutBusy) ? undefined : 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            {busy ? '⏳ Đang xử lý...' : 'Dịch sang tiếng Anh'}
          </Button>
          {isDocx && (
            <Button fullWidth variant="outlined" size="large"
              startIcon={<DescriptionIcon />}
              disabled={busy || layoutBusy}
              onClick={() => void exportLayoutDocx()}
              sx={{ mt: 1 }}>
              {layoutBusy ? '⏳ Đang dịch giữ layout...' : '📄 Dịch & tải Word giữ nguyên layout'}
            </Button>
          )}
          {progress && (
            <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5, color: '#0d7a6a' }}>
              {progress}
            </Typography>
          )}
          {err && (
            <Alert severity="error" sx={{ mt: 1.5 }}>{err}</Alert>
          )}
        </Paper>

        {result && (
          <Paper sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" gap={1.5}>
              <Typography variant="subtitle1" fontWeight={800}>
                ✅ Bản dịch tiếng Anh
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />}
                  onClick={() => { navigator.clipboard?.writeText(result); }}>
                  Copy
                </Button>
                <Button size="small" variant="outlined" startIcon={<DescriptionIcon />}
                  onClick={() => void import('@/lib/exports/exportTranslationDocx').then((m) => m.exportTranslationDocxMd(result, file?.name ?? null))}>
                  Word (giữ bố cục)
                </Button>
                <Button size="small" variant="outlined" color="error" startIcon={<PictureAsPdfIcon />}
                  onClick={() => void import('@/lib/exports/exportTranslationPDF').then((m) => m.exportTranslationPDF(result, file?.name ?? null))}>
                  PDF
                </Button>
              </Stack>
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <Box>
                <Typography variant="caption" fontWeight={800} color="text.secondary"
                  sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🇻🇳 Bản gốc (trích xuất)
                </Typography>
                <TextField fullWidth multiline minRows={20} value={source}
                  onChange={(e) => setSource(e.target.value)}
                  InputProps={{ sx: { fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' } }} />
              </Box>
              <Box>
                <Typography variant="caption" fontWeight={800} sx={{ color: '#0d7a6a', display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🇬🇧 Bản dịch
                </Typography>
                <TextField fullWidth multiline minRows={20} value={result}
                  onChange={(e) => setResult(e.target.value)}
                  InputProps={{ sx: { fontSize: 12.5, lineHeight: 1.6 } }}
                  sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(20,150,140,0.4)' } }} />
              </Box>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 1.25, display: 'block' }}>
              💡 Có thể sửa trực tiếp bản dịch trước khi xuất. Bản gốc trích xuất chỉnh được nếu OCR sai.
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
