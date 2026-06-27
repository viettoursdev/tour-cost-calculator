/**
 * Thư viện Viettours — màn hình hỏi-đáp + nạp kiến thức (Đợt 1, MVP).
 * Hỏi: câu hỏi → truy hồi ngữ nghĩa → Claude trả lời có trích dẫn (stream).
 * Nạp: dán tiêu đề + nội dung → chunk + embedding (Voyage) → lưu kho.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import { useAuthStore } from '@/stores/authStore';
import {
  askKnowledge,
  deleteSource,
  ingestText,
  listSources,
  type AskResult,
  type KbKind,
  type KbSource,
} from '@/lib/knowledge';

function fmtMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });
}

function kindIcon(kind: KbKind) {
  if (kind === 'file') return <InsertDriveFileOutlinedIcon fontSize="small" />;
  if (kind === 'link') return <LinkOutlinedIcon fontSize="small" />;
  return <ChatBubbleOutlineIcon fontSize="small" />;
}

export function KnowledgeView() {
  const user = useAuthStore((s) => s.currentUser);

  // ── Hỏi đáp ──
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState('');

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAnswer('');
    setResult(null);
    setAskError('');
    try {
      const res = await askKnowledge(q, (delta) => setAnswer((a) => a + delta));
      setResult(res);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }, [question, asking]);

  // ── Nguồn ──
  const [sources, setSources] = useState<KbSource[]>([]);
  const refreshSources = useCallback(async () => {
    try {
      setSources(await listSources());
    } catch {
      /* im lặng — danh sách nguồn không chặn hỏi đáp */
    }
  }, []);
  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  // ── Nạp kiến thức ──
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [ingestMsg, setIngestMsg] = useState('');

  const save = useCallback(async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t || !c || saving) return;
    setSaving(true);
    setIngestMsg('');
    try {
      await ingestText({
        title: t,
        text: c,
        createdBy: user?.u ?? '',
        department: user?.department ?? null,
      });
      setIngestMsg('✓ Đã lưu vào thư viện.');
      setTitle('');
      setContent('');
      void refreshSources();
    } catch (e) {
      setIngestMsg('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }, [title, content, saving, user, refreshSources]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('Xoá nguồn này (và toàn bộ nội dung) khỏi thư viện?')) return;
      try {
        await deleteSource(id);
        void refreshSources();
      } catch (e) {
        window.alert('Lỗi xoá: ' + (e instanceof Error ? e.message : String(e)));
      }
    },
    [refreshSources],
  );

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <MenuBookOutlinedIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          Thư viện Viettours
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Hỏi đáp kiến thức & kinh nghiệm nội bộ
        </Typography>
      </Stack>

      {/* HỎI ĐÁP */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            placeholder="Hỏi thư viện… (vd: Khách Schengen thiếu sao kê thì xử lý sao?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
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

        {askError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {askError}
          </Alert>
        )}

        {(answer || asking) && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {answer}
              {asking && <Box component="span" sx={{ color: 'text.disabled' }}> ▍</Box>}
            </Typography>

            {result && result.sources.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Nguồn ({result.sources.length})
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {result.sources.map((s) => (
                    <Chip
                      key={s.id}
                      size="small"
                      icon={kindIcon(s.kind)}
                      label={fmtMonth(s.updatedAt) ? `${s.title} · ${fmtMonth(s.updatedAt)}` : s.title}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* NẠP KIẾN THỨC */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <AddIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={600}>
            Thêm vào thư viện
          </Typography>
        </Stack>
        <TextField
          fullWidth
          size="small"
          label="Tiêu đề"
          placeholder="vd: SOP xử lý sao kê visa Schengen"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 1.5 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Nội dung"
          placeholder="Dán hoặc gõ kiến thức/kinh nghiệm vào đây…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => void save()}
            disabled={saving || !title.trim() || !content.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : <AddIcon />}
          >
            Lưu vào thư viện
          </Button>
          {ingestMsg && (
            <Typography
              variant="body2"
              color={ingestMsg.startsWith('Lỗi') ? 'error' : 'success.main'}
            >
              {ingestMsg}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* DANH SÁCH NGUỒN */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          Nguồn trong kho ({sources.length})
        </Typography>
        {sources.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Chưa có nguồn nào. Thêm kiến thức đầu tiên ở khung phía trên.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={0}>
            {sources.map((s) => (
              <Stack
                key={s.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ py: 1 }}
              >
                {kindIcon(s.kind)}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={s.title}>
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.created_by || '—'}
                    {fmtMonth(s.updated_at) ? ` · ${fmtMonth(s.updated_at)}` : ''}
                    {s.status !== 'ready' ? ` · ${s.status}` : ''}
                  </Typography>
                </Box>
                <Tooltip title="Xoá nguồn">
                  <IconButton size="small" onClick={() => void remove(s.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
