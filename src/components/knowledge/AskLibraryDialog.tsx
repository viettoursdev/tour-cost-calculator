/**
 * Hỏi nhanh Thư viện từ bất kỳ đâu (báo giá, hồ sơ tour, visa…). Tái dùng askKnowledge.
 * `context` (vd điểm đến / nước) được nối vào câu hỏi để truy hồi BÁM ngữ cảnh hơn.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { askKnowledge, type AskResult } from '@/lib/knowledge';

export function AskLibraryDialog({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context?: string;
}) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAnswer('');
    setResult(null);
    setError('');
    try {
      const query = context ? `${q}\n(bối cảnh: ${context})` : q;
      const res = await askKnowledge(query, (d) => setAnswer((a) => a + d));
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Hỏi thư viện
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {context && <Chip size="small" label={`Bối cảnh: ${context}`} sx={{ mb: 1.5 }} />}
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder="Hỏi điều gì? (vd: lưu ý gì khi làm tour này?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={() => void ask()}
            disabled={asking || !question.trim()}
            startIcon={asking ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
          >
            Hỏi
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {(answer || asking) && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {answer}
              {asking && (
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {' ▍'}
                </Box>
              )}
            </Typography>
            {result && result.sources.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                {result.sources.map((s) => (
                  <Chip key={s.id} size="small" variant="outlined" label={s.title} />
                ))}
              </Stack>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
