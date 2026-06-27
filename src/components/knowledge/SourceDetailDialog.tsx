/** Hộp thoại xem chi tiết một nguồn (trích dẫn bấm-mở) + quản lý: sửa metadata, tạo lại embedding. */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuthStore } from '@/stores/authStore';
import { workerFileUrl } from '@/lib/aiWorker';
import {
  getSourceChunks,
  KB_CATEGORIES,
  reEmbedSource,
  updateSourceMeta,
  type KbChunkRow,
  type KbSource,
} from '@/lib/knowledge';

export function SourceDetailDialog({
  source,
  onClose,
  onChanged,
}: {
  source: KbSource | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const user = useAuthStore((s) => s.currentUser);
  const [chunks, setChunks] = useState<KbChunkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!source) return;
    setEditing(false);
    setMsg('');
    setTitle(source.title);
    setCategory(source.category ?? '');
    setTags(source.tags ?? []);
    setShared(source.department === null);

    let alive = true;
    setLoading(true);
    setError('');
    setChunks([]);
    getSourceChunks(source.id)
      .then((c) => alive && setChunks(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [source]);

  if (!source) return null;

  const originalHref =
    source.raw_ref && source.kind === 'link'
      ? source.raw_ref
      : source.raw_ref && source.kind === 'file'
        ? workerFileUrl(source.raw_ref)
        : null;

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 8 ? prev : [...prev, t]));
    setTagInput('');
  };

  const saveMeta = async () => {
    setBusy(true);
    setMsg('');
    try {
      await updateSourceMeta(source.id, {
        title: title.trim() || source.title,
        category: category || null,
        tags,
        department: shared ? null : (source.department ?? user?.department ?? null),
      });
      setMsg('✓ Đã lưu.');
      setEditing(false);
      onChanged?.();
    } catch (e) {
      setMsg('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const reEmbed = async () => {
    if (!window.confirm('Tạo lại embedding cho toàn bộ nội dung nguồn này?')) return;
    setBusy(true);
    setMsg('');
    try {
      await reEmbedSource(source.id, setMsg);
      setMsg('✓ Đã tạo lại embedding.');
      onChanged?.();
    } catch (e) {
      setMsg('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!source} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {editing ? 'Sửa nguồn' : source.title}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {editing ? (
          <Stack spacing={1.5}>
            <TextField size="small" label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
            <TextField
              select
              size="small"
              label="Chủ đề"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              sx={{ maxWidth: 240 }}
            >
              <MenuItem value="">
                <em>— Chưa phân loại —</em>
              </MenuItem>
              {KB_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <TextField
                size="small"
                label="Thêm thẻ (Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                sx={{ maxWidth: 240 }}
              />
              {tags.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {tags.map((t) => (
                    <Chip key={t} size="small" label={t} onDelete={() => setTags((p) => p.filter((x) => x !== t))} />
                  ))}
                </Stack>
              )}
            </Box>
            <FormControlLabel
              control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />}
              label="Chia sẻ toàn công ty (bỏ chọn = chỉ phòng)"
            />
          </Stack>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              {source.category && <Chip size="small" label={source.category} />}
              {(source.tags ?? []).map((t) => (
                <Chip key={t} size="small" variant="outlined" label={t} />
              ))}
              {originalHref && (
                <Link
                  href={originalHref}
                  target="_blank"
                  rel="noopener"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}
                >
                  <OpenInNewIcon sx={{ fontSize: 15 }} /> Mở bản gốc
                </Link>
              )}
            </Stack>
            <Divider sx={{ mb: 1.5 }} />
            {loading && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Đang tải nội dung…
                </Typography>
              </Stack>
            )}
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            {!loading && !error && (
              <Box sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14 }}>
                {chunks.map((c) => c.content).join('\n\n')}
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, justifyContent: 'space-between' }}>
        <Typography variant="body2" color={msg.startsWith('Lỗi') ? 'error' : 'success.main'} sx={{ ml: 1 }}>
          {msg}
        </Typography>
        <Stack direction="row" spacing={1}>
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)} disabled={busy}>
                Huỷ
              </Button>
              <Button variant="contained" onClick={() => void saveMeta()} disabled={busy}>
                Lưu
              </Button>
            </>
          ) : (
            <>
              <Button
                startIcon={busy ? <CircularProgress size={15} /> : <RefreshIcon />}
                onClick={() => void reEmbed()}
                disabled={busy}
              >
                Tạo lại embedding
              </Button>
              <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)} disabled={busy}>
                Sửa
              </Button>
            </>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
