/** Hộp thoại xem chi tiết một nguồn trong Thư viện (trích dẫn bấm-mở). */
import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { workerFileUrl } from '@/lib/aiWorker';
import { getSourceChunks, type KbChunkRow, type KbSource } from '@/lib/knowledge';

export function SourceDetailDialog({ source, onClose }: { source: KbSource | null; onClose: () => void }) {
  const [chunks, setChunks] = useState<KbChunkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!source) return;
    let alive = true;
    setLoading(true);
    setError('');
    setChunks([]);
    getSourceChunks(source.id)
      .then((c) => {
        if (alive) setChunks(c);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
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

  return (
    <Dialog open={!!source} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {source.title}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
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
      </DialogContent>
    </Dialog>
  );
}
