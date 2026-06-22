import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Box, Button, Chip, Drawer, IconButton, Link, Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import PublicIcon from '@mui/icons-material/Public';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { runAssistant, type AssistantProposal } from '@/lib/assistant/agent';
import { applyItineraryDraft, applyQuoteDraft, applySupplierDraft } from '@/lib/assistant/draftBuilders';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { ChatMessage, ContentBlock, Citation } from '@/lib/aiWorker';

type Attach = { name: string; mime: string; b64: string; kind: 'image' | 'pdf' };
type UiMsg = { role: 'user' | 'assistant'; text: string; pending?: boolean; citations?: Citation[]; proposals?: AssistantProposal[]; files?: Attach[] };

const MAX_ATTACH = 5 * 1024 * 1024; // 5MB / tệp (giới hạn ảnh Claude)

function fileToB64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = () => rej(new Error('Đọc tệp lỗi'));
    fr.readAsDataURL(file);
  });
}

const SUGGESTIONS = [
  'Tìm báo giá đi Nhật Bản',
  'Khách hàng ABC đã đi tour nào?',
  'Margin trung bình các báo giá nước ngoài?',
  'Gợi ý lịch trình 4N3Đ Đà Nẵng cho đoàn 20 khách',
];

function dedupeCitations(cs: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of cs) {
    const key = c.url ?? c.title ?? '';
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [history, setHistory] = useState<ChatMessage[]>([]); // định dạng agent (gồm tool blocks)
  const [ui, setUi] = useState<UiMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [web, setWeb] = useState(true);
  const [activity, setActivity] = useState('');
  const [stream, setStream] = useState(''); // text trợ lý đang trả về (hiện dần)
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [ui, activity, stream]);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    for (const f of files) {
      const isImg = f.type.startsWith('image/');
      const isPdf = f.type === 'application/pdf';
      if (!isImg && !isPdf) { toast(`"${f.name}" không phải ảnh/PDF.`, 'warning'); continue; }
      if (f.size > MAX_ATTACH) { toast(`"${f.name}" vượt 5MB.`, 'warning'); continue; }
      try {
        const b64 = await fileToB64(f);
        setAttachments((p) => [...p, { name: f.name, mime: f.type, b64, kind: isImg ? 'image' : 'pdf' }]);
      } catch { toast(`Đọc "${f.name}" lỗi.`, 'error'); }
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    const atts = attachments;
    if ((!q && atts.length === 0) || busy) return;
    setInput(''); setAttachments([]);
    // Vision: nếu có đính kèm, gửi message dạng content blocks (ảnh/PDF + text).
    const userContent: string | ContentBlock[] = atts.length
      ? [
          ...atts.map((a): ContentBlock => a.kind === 'image'
            ? { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.b64 } }
            : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.b64 } }),
          ...(q ? [{ type: 'text', text: q } as ContentBlock] : []),
        ]
      : q;
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: userContent }];
    setUi((p) => [...p, { role: 'user', text: q, files: atts.length ? atts : undefined }, { role: 'assistant', text: '', pending: true }]);
    setBusy(true); setActivity(''); setStream('');
    try {
      const r = await runAssistant(nextHistory, {
        web,
        onActivity: (l) => { setActivity(l); setStream(''); },
        onToken: (d) => { setStream((t) => t + d); setActivity(''); },
      });
      setHistory(r.messages);
      setUi((p) => {
        const copy = [...p];
        copy[copy.length - 1] = { role: 'assistant', text: r.text || '(không có nội dung)', citations: dedupeCitations(r.citations), proposals: r.proposals };
        return copy;
      });
    } catch (e) {
      setUi((p) => {
        const copy = [...p];
        copy[copy.length - 1] = { role: 'assistant', text: '❌ ' + (e as Error).message };
        return copy;
      });
    } finally {
      setBusy(false); setActivity(''); setStream('');
    }
  };

  const openDraft = async (p: AssistantProposal) => {
    try {
      if (p.kind === 'supplier') {
        const name = await applySupplierDraft(p.payload);
        toast(`✅ Đã lưu "${name}" vào NCC — kiểm tra lại ở tab Nhà Cung Cấp.`);
        return; // giữ panel để tiếp tục hỏi
      }
      if (p.kind === 'itinerary') await applyItineraryDraft(p.payload);
      else applyQuoteDraft(p.payload);
      onClose();
    } catch (e) {
      window.alert('Không xử lý được: ' + (e as Error).message);
    }
  };
  const proposalLabel = (kind: AssistantProposal['kind']) =>
    kind === 'itinerary' ? '📋 Mở nháp lịch trình' : kind === 'quote' ? '📋 Mở nháp báo giá' : '💾 Lưu vào NCC';

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, display: 'flex', flexDirection: 'column' } } }}>
      <Box sx={{ px: 2, py: 1.5, background: LEGACY.headerGradient, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
        <SupportAgentIcon sx={{ fontSize: 24 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={900}>Trợ lý ảo Viettours</Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>Tra cứu · phân tích · tư vấn (theo quyền của bạn)</Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </Box>

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#f7faf9' }}>
        {ui.length === 0 ? (
          <Box sx={{ color: 'text.secondary' }}>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Hỏi tôi về dữ liệu nội bộ (báo giá, lịch trình, khách hàng, NCC…) hoặc nhờ tư vấn nghiệp vụ.
            </Typography>
            <Stack spacing={1}>
              {SUGGESTIONS.map((s) => (
                <Box key={s} onClick={() => void send(s)}
                  sx={{ cursor: 'pointer', border: '1px solid rgba(20,150,140,0.3)', borderRadius: 2, px: 1.5, py: 1,
                    bgcolor: '#fff', fontSize: 13, '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' } }}>
                  💬 {s}
                </Box>
              ))}
            </Stack>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {ui.map((m, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Box sx={{
                  maxWidth: '88%', px: 1.75, py: 1.25, borderRadius: 2.5, fontSize: 14, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  bgcolor: m.role === 'user' ? '#0d7a6a' : '#fff',
                  color: m.role === 'user' ? '#fff' : 'text.primary',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(15,58,74,0.12)',
                }}>
                  {m.files && m.files.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: m.text ? 0.75 : 0 }}>
                      {m.files.map((f, k) => (
                        <Chip key={k} size="small" icon={<InsertDriveFileOutlinedIcon />} label={f.name}
                          sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', maxWidth: 200 }} />
                      ))}
                    </Stack>
                  )}
                  {m.pending
                    ? (stream
                        ? stream
                        : <Typography variant="body2" color="text.secondary">{activity || 'Đang suy nghĩ…'}</Typography>)
                    : m.text}
                  {m.citations && m.citations.length > 0 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(15,58,74,0.2)' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Nguồn:</Typography>
                      <Stack spacing={0.25}>
                        {m.citations.map((c, k) => (
                          <Link key={k} href={c.url} target="_blank" rel="noreferrer" variant="caption" sx={{ wordBreak: 'break-all' }}>
                            {c.title || c.url}
                          </Link>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {m.proposals && m.proposals.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                      {m.proposals.map((p, k) => (
                        <Button key={k} size="small" variant="contained" onClick={() => void openDraft(p)}
                          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', fontWeight: 700 }}>
                          {proposalLabel(p.kind)}
                        </Button>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box sx={{ px: 1.5, pt: 1 }}>
        <Chip
          size="small" icon={<PublicIcon />} label={web ? 'Tra web: Bật' : 'Tra web: Tắt'}
          color={web ? 'primary' : 'default'} variant={web ? 'filled' : 'outlined'}
          onClick={() => setWeb((v) => !v)} sx={{ fontWeight: 700 }}
        />
      </Box>
      {attachments.length > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ px: 1.5, pt: 1 }}>
          {attachments.map((a, k) => (
            <Chip key={k} size="small" icon={<InsertDriveFileOutlinedIcon />} label={a.name}
              onDelete={() => setAttachments((p) => p.filter((_, i) => i !== k))}
              sx={{ maxWidth: 220 }} />
          ))}
        </Stack>
      )}
      <Box sx={{ p: 1.5, pt: 1, borderTop: '1px solid rgba(15,58,74,0.1)', display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
        <IconButton component="label" disabled={busy} title="Đính kèm ảnh/PDF (≤5MB)">
          <AttachFileIcon />
          <input type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => void onPickFiles(e)} />
        </IconButton>
        <TextField
          fullWidth multiline maxRows={4} size="small" value={input} disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          placeholder="Nhập câu hỏi… (Enter để gửi)"
        />
        <IconButton color="primary" disabled={busy || (!input.trim() && attachments.length === 0)} onClick={() => void send(input)}
          sx={{ bgcolor: '#0d7a6a', color: '#fff', '&:hover': { bgcolor: '#0a5c50' }, '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.12)' } }}>
          <SendIcon />
        </IconButton>
      </Box>
    </Drawer>
  );
}
