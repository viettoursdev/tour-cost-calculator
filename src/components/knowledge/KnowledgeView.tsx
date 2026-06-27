/**
 * Thư viện Viettours — màn hình hỏi-đáp + nạp kiến thức.
 * Đợt 1: hỏi-đáp có trích dẫn + nạp văn bản.
 * Đợt 2: nạp Tệp (PDF/Word/Excel/ảnh) & Liên kết; gợi ý phân loại + thẻ; cảnh báo trùng.
 * Đợt 3: FAQ "hay hỏi" + gợi ý gõ + câu hỏi liên quan + trích dẫn bấm-mở + lọc nguồn.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { useAuthStore } from '@/stores/authStore';
import { extractFile } from '@/lib/docExtract';
import { fetchLink, uploadFileToWorker } from '@/lib/aiWorker';
import {
  askKnowledge,
  deleteSource,
  findSimilarSources,
  ingestText,
  KB_CATEGORIES,
  listSources,
  logQuestion,
  recentQuestions,
  relatedQuestions,
  suggestMeta,
  topQuestions,
  type AskResult,
  type KbKind,
  type KbSource,
  type SimilarSource,
} from '@/lib/knowledge';
import { SourceDetailDialog } from './SourceDetailDialog';

type Mode = 'text' | 'file' | 'link';

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
  const [related, setRelated] = useState<string[]>([]);
  const [detail, setDetail] = useState<KbSource | null>(null);

  // Gợi ý câu hỏi (Đợt 3)
  const [faqs, setFaqs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  // ── Nguồn ──
  const [sources, setSources] = useState<KbSource[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const refreshSources = useCallback(async () => {
    try {
      setSources(await listSources());
    } catch {
      /* im lặng */
    }
  }, []);
  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);
  useEffect(() => {
    topQuestions().then(setFaqs).catch(() => {});
    recentQuestions().then(setRecents).catch(() => {});
  }, []);

  const openDetailById = (id: string, fallbackTitle: string, fallbackKind: KbKind) => {
    const found = sources.find((s) => s.id === id);
    setDetail(
      found ?? {
        id,
        title: fallbackTitle,
        kind: fallbackKind,
        raw_ref: null,
        department: null,
        created_by: '',
        created_at: '',
        updated_at: '',
        status: 'ready',
        category: null,
        tags: [],
      },
    );
  };

  const runAsk = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || asking) return;
      setQuestion(q);
      setShowSuggest(false);
      setAsking(true);
      setAnswer('');
      setResult(null);
      setAskError('');
      setRelated([]);
      try {
        const res = await askKnowledge(q, (delta) => setAnswer((a) => a + delta));
        setResult(res);
        void logQuestion({ question: q, askedBy: user?.u, department: user?.department, sourceCount: res.hits.length });
        relatedQuestions(q, res.answer)
          .then(setRelated)
          .catch(() => {});
      } catch (e) {
        setAskError(e instanceof Error ? e.message : String(e));
      } finally {
        setAsking(false);
      }
    },
    [asking, user],
  );

  // ── Nạp kiến thức (staged: phân tích → lưu) ──
  const [mode, setMode] = useState<Mode>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<{ text: string; kind: KbKind } | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedUrl, setStagedUrl] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [similar, setSimilar] = useState<SimilarSource[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [ingestMsg, setIngestMsg] = useState('');

  const resetIngest = () => {
    setTitle('');
    setContent('');
    setFile(null);
    setUrl('');
    setStaged(null);
    setStagedFile(null);
    setStagedUrl('');
    setCategory('');
    setTags([]);
    setTagInput('');
    setSimilar([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const switchMode = (m: Mode | null) => {
    if (!m) return;
    setMode(m);
    setStaged(null);
    setSimilar([]);
    setIngestMsg('');
  };

  const analyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setIngestMsg('');
    setSimilar([]);
    setProgress('');
    try {
      let text = '';
      let kind: KbKind = 'chat';
      if (mode === 'text') {
        text = content.trim();
        kind = 'chat';
        if (!text) throw new Error('Nhập nội dung trước.');
      } else if (mode === 'file') {
        if (!file) throw new Error('Chọn file trước.');
        text = (await extractFile(file, setProgress)).trim();
        kind = 'file';
        if (!title.trim()) setTitle(file.name);
        if (!text) throw new Error('Không trích được nội dung từ file.');
      } else {
        if (!url.trim()) throw new Error('Nhập URL trước.');
        setProgress('Đang tải trang…');
        const f = await fetchLink(url.trim());
        text = f.text.trim();
        kind = 'link';
        setStagedUrl(url.trim());
        if (!title.trim()) setTitle(f.title || url.trim());
        if (!text) throw new Error('Trang không có nội dung đọc được.');
      }
      setStaged({ text, kind });
      setStagedFile(mode === 'file' ? file : null);
      setProgress('Đang gợi ý phân loại & kiểm tra trùng…');
      const [meta, sim] = await Promise.all([
        suggestMeta(text).catch(() => ({ category: '', tags: [] as string[] })),
        findSimilarSources(text).catch(() => [] as SimilarSource[]),
      ]);
      setCategory((c) => c || meta.category || '');
      setTags((t) => (t.length ? t : meta.tags));
      setSimilar(sim);
    } catch (e) {
      setIngestMsg('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const save = async () => {
    if (!staged || saving) return;
    setSaving(true);
    setIngestMsg('');
    setProgress('');
    try {
      let rawRef: string | null = null;
      if (staged.kind === 'file' && stagedFile) {
        setProgress('Đang lưu bản gốc…');
        try {
          rawRef = (await uploadFileToWorker(stagedFile)).key;
        } catch {
          rawRef = null;
        }
      } else if (staged.kind === 'link') {
        rawRef = stagedUrl || url.trim() || null;
      }
      setProgress('Đang tạo embedding & lưu kho…');
      await ingestText({
        title: title.trim() || '(không tiêu đề)',
        text: staged.text,
        createdBy: user?.u ?? '',
        kind: staged.kind,
        rawRef,
        department: user?.department ?? null,
        category: category || null,
        tags,
      });
      setIngestMsg('✓ Đã lưu vào thư viện.');
      resetIngest();
      void refreshSources();
    } catch (e) {
      setIngestMsg('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 8 ? prev : [...prev, t]));
    setTagInput('');
  };

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

  const busy = analyzing || saving;
  const qLower = question.trim().toLowerCase();
  const suggestMatches = qLower
    ? recents.filter((r) => r.toLowerCase().includes(qLower) && r.toLowerCase() !== qLower).slice(0, 5)
    : [];
  const filteredSources = sources.filter(
    (s) => (!filterCat || s.category === filterCat) && (!filterKind || s.kind === filterKind),
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
        <Box sx={{ position: 'relative' }}>
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Hỏi thư viện… (vd: Khách Schengen thiếu sao kê thì xử lý sao?)"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void runAsk(question);
                }
              }}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
            />
            <Button
              variant="contained"
              onClick={() => void runAsk(question)}
              disabled={asking || !question.trim()}
              startIcon={asking ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            >
              Hỏi
            </Button>
          </Stack>

          {showSuggest && suggestMatches.length > 0 && (
            <Paper
              elevation={3}
              sx={{ position: 'absolute', top: '100%', left: 0, right: 56, zIndex: 5, mt: 0.5, py: 0.5 }}
            >
              {suggestMatches.map((m) => (
                <Box
                  key={m}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void runAsk(m);
                  }}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <HistoryIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  <Typography variant="body2" noWrap>
                    {m}
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Box>

        {/* FAQ "hay hỏi" — khi chưa hỏi */}
        {!answer && !asking && faqs.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Hay hỏi
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {faqs.map((q) => (
                <Chip key={q} size="small" label={q} onClick={() => void runAsk(q)} variant="outlined" />
              ))}
            </Stack>
          </Box>
        )}

        {askError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {askError}
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
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Nguồn ({result.sources.length}) — bấm để xem
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {result.sources.map((s) => (
                    <Chip
                      key={s.id}
                      size="small"
                      icon={kindIcon(s.kind)}
                      label={fmtMonth(s.updatedAt) ? `${s.title} · ${fmtMonth(s.updatedAt)}` : s.title}
                      variant="outlined"
                      onClick={() => openDetailById(s.id, s.title, s.kind)}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {related.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Câu hỏi liên quan
                </Typography>
                <Stack spacing={0.5}>
                  {related.map((q) => (
                    <Box
                      key={q}
                      onClick={() => void runAsk(q)}
                      sx={{
                        cursor: 'pointer',
                        color: 'primary.main',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      <SearchIcon sx={{ fontSize: 15 }} /> {q}
                    </Box>
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

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, m) => switchMode(m as Mode | null)}
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="text">
            <ChatBubbleOutlineIcon fontSize="small" sx={{ mr: 0.5 }} /> Văn bản
          </ToggleButton>
          <ToggleButton value="file">
            <UploadFileOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Tệp
          </ToggleButton>
          <ToggleButton value="link">
            <LinkOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Liên kết
          </ToggleButton>
        </ToggleButtonGroup>

        <TextField
          fullWidth
          size="small"
          label="Tiêu đề"
          placeholder="vd: SOP xử lý sao kê visa Schengen"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        {mode === 'text' && (
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Nội dung"
            placeholder="Dán hoặc gõ kiến thức/kinh nghiệm vào đây…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}

        {mode === 'file' && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.csv,image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStaged(null);
              }}
            />
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileInputRef.current?.click()}>
              Chọn tệp
            </Button>
            <Typography variant="body2" color="text.secondary" noWrap>
              {file ? file.name : 'PDF, Word, Excel, ảnh, văn bản…'}
            </Typography>
          </Stack>
        )}

        {mode === 'link' && (
          <TextField
            fullWidth
            size="small"
            label="URL"
            placeholder="https://…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setStaged(null);
            }}
          />
        )}

        {/* Sau khi phân tích: phân loại + thẻ + cảnh báo trùng */}
        {staged && (
          <Box sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                select
                size="small"
                label="Chủ đề"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                sx={{ minWidth: 180 }}
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
                sx={{ minWidth: 180 }}
              />
            </Stack>

            {tags.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {tags.map((t) => (
                  <Chip key={t} size="small" label={t} onDelete={() => setTags((prev) => prev.filter((x) => x !== t))} />
                ))}
              </Stack>
            )}

            {similar.length > 0 && (
              <Alert severity="warning" icon={<WarningAmberOutlinedIcon />} sx={{ mb: 1.5 }}>
                Có thể trùng/chồng với nguồn đã có:{' '}
                {similar.map((s, i) => (
                  <Box component="span" key={s.sourceId}>
                    {i > 0 ? ', ' : ''}
                    «{s.title}» ({Math.round(s.similarity * 100)}%)
                  </Box>
                ))}
                . Kiểm tra trước khi lưu để tránh nội dung mâu thuẫn.
              </Alert>
            )}
          </Box>
        )}

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
          {!staged ? (
            <Button
              variant="outlined"
              onClick={() => void analyze()}
              disabled={busy}
              startIcon={analyzing ? <CircularProgress size={16} /> : <AutoFixHighOutlinedIcon />}
            >
              Phân tích
            </Button>
          ) : (
            <>
              <Button
                variant="contained"
                onClick={() => void save()}
                disabled={busy}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
              >
                Lưu vào thư viện
              </Button>
              <Button variant="text" onClick={resetIngest} disabled={busy}>
                Làm lại
              </Button>
            </>
          )}
          {progress && (
            <Typography variant="body2" color="text.secondary">
              {progress}
            </Typography>
          )}
          {ingestMsg && (
            <Typography variant="body2" color={ingestMsg.startsWith('Lỗi') ? 'error' : 'success.main'}>
              {ingestMsg}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* DANH SÁCH NGUỒN */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" fontWeight={600}>
            Nguồn trong kho ({filteredSources.length})
          </Typography>
          <Box sx={{ flex: 1 }} />
          {sources.length > 0 && (
            <>
              <TextField
                select
                size="small"
                label="Chủ đề"
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {KB_CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Loại"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                <MenuItem value="chat">Văn bản</MenuItem>
                <MenuItem value="file">Tệp</MenuItem>
                <MenuItem value="link">Liên kết</MenuItem>
              </TextField>
            </>
          )}
        </Stack>

        {filteredSources.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {sources.length === 0 ? 'Chưa có nguồn nào. Thêm kiến thức đầu tiên ở khung phía trên.' : 'Không có nguồn khớp bộ lọc.'}
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={0}>
            {filteredSources.map((s) => (
              <Stack key={s.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
                {kindIcon(s.kind)}
                <Box
                  sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => setDetail(s)}
                >
                  <Typography variant="body2" noWrap title={s.title}>
                    {s.title}
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">
                      {s.category ? `${s.category} · ` : ''}
                      {s.created_by || '—'}
                      {fmtMonth(s.updated_at) ? ` · ${fmtMonth(s.updated_at)}` : ''}
                      {s.status !== 'ready' ? ` · ${s.status}` : ''}
                    </Typography>
                    {(s.tags ?? []).slice(0, 4).map((t) => (
                      <Chip key={t} size="small" variant="outlined" label={t} sx={{ height: 18, fontSize: 11 }} />
                    ))}
                  </Stack>
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

      <SourceDetailDialog source={detail} onClose={() => setDetail(null)} />
    </Box>
  );
}
