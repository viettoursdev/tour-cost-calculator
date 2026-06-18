import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Avatar, Badge, Box, Button, Checkbox, Chip, Drawer, IconButton, InputBase, List, ListItemButton,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddCommentIcon from '@mui/icons-material/AddComment';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, chatUnread } from '@/stores/chatStore';
import { dmChatId, fbEnsureChat, fbSendChatMessage, fbMarkChatRead } from '@/lib/firebase';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { Chat, ChatMessage } from '@/types';

const MAX_FILE = 20 * 1024 * 1024;
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const fmtTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const chats = useChatStore((s) => s.chats);
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const titleOf = (c: Chat) => (c.isGroup ? (c.title || 'Nhóm') : nameOf(c.members.find((m) => m !== me?.u) ?? ''));

  // Đánh dấu đã đọc + cuộn xuống khi mở/đổi cuộc / có tin mới.
  useEffect(() => {
    if (!active || !me) return;
    if (chatUnread(active, me.u)) void fbMarkChatRead(active.id, me.u);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, [active?.messages.length, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDM = async (otherU: string) => {
    if (!me) return;
    const id = dmChatId(me.u, otherU);
    await fbEnsureChat({ id, members: [me.u, otherU], isGroup: false, createdBy: me.u, createdAt: new Date().toISOString(), messages: [] });
    setNewMode(false); setActiveId(id);
  };
  const createGroup = async () => {
    if (!me || groupSel.length < 1) return;
    const id = 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await fbEnsureChat({ id, members: [me.u, ...groupSel], isGroup: true, title: groupTitle.trim() || `Nhóm ${groupSel.length + 1} người`, createdBy: me.u, createdAt: new Date().toISOString(), messages: [] });
    setNewMode(false); setGroupSel([]); setGroupTitle(''); setActiveId(id);
  };

  const send = async (file?: ChatMessage['file']) => {
    if (!me || !active) return;
    const body = text.trim();
    if (!body && !file) return;
    const msg: ChatMessage = { id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(), ...(body ? { text: body } : {}), ...(file ? { file } : {}) };
    setText('');
    try { await fbSendChatMessage(active.id, msg); }
    catch (e) { toast('Gửi lỗi: ' + (e as Error).message, 'error'); }
  };
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !active) return;
    if (f.size > MAX_FILE) { toast('File vượt quá 20MB.', 'warning'); return; }
    setBusy(true);
    try {
      const up = await uploadFileToWorker(f);
      await send({ key: up.key, name: up.name, size: f.size, mime: f.type });
    } catch (e2) { toast('Tải file lỗi: ' + (e2 as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const others = users.filter((u) => u.u !== me?.u);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, display: 'flex', flexDirection: 'column' } } }}>
      <Box sx={{ px: 2, py: 1.5, background: LEGACY.headerGradient, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
        {(active || newMode) && <IconButton size="small" onClick={() => { setActiveId(null); setNewMode(false); }} sx={{ color: '#fff' }}><ArrowBackIcon /></IconButton>}
        <Typography fontWeight={800} sx={{ flex: 1 }}>{active ? titleOf(active) : newMode ? 'Cuộc trò chuyện mới' : '💬 Tin nhắn nội bộ'}</Typography>
        {!active && !newMode && <Tooltip title="Trò chuyện mới"><IconButton size="small" onClick={() => setNewMode(true)} sx={{ color: '#fff' }}><AddCommentIcon /></IconButton></Tooltip>}
        <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </Box>

      {/* DANH SÁCH CUỘC TRÒ CHUYỆN */}
      {!active && !newMode && (
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {chats.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>Chưa có cuộc trò chuyện. Bấm ✏️ để bắt đầu.</Box>
          ) : (
            <List disablePadding>
              {chats.map((c) => {
                const unread = me ? chatUnread(c, me.u) : false;
                return (
                  <ListItemButton key={c.id} onClick={() => setActiveId(c.id)} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <Badge color="error" variant="dot" invisible={!unread} sx={{ mr: 1.5 }}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: c.isGroup ? '#7c3aed' : LEGACY.teal, fontSize: 15 }}>{c.isGroup ? '👥' : titleOf(c).slice(0, 1).toUpperCase()}</Avatar>
                    </Badge>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={14} fontWeight={unread ? 800 : 700} noWrap>{titleOf(c)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {c.lastByName ? `${c.lastByName}: ` : ''}{c.lastText || 'Bắt đầu trò chuyện…'}
                      </Typography>
                    </Box>
                    {c.lastAt && <Typography variant="caption" color="text.disabled" sx={{ ml: 1, whiteSpace: 'nowrap' }}>{fmtTime(c.lastAt).split(' ')[0]}</Typography>}
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      )}

      {/* TRÒ CHUYỆN MỚI */}
      {newMode && (
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          <Typography variant="caption" fontWeight={800} color="text.secondary">NHẮN 1-1 — chọn 1 người</Typography>
          <Stack sx={{ mt: 1, mb: 2 }}>
            {others.map((u) => (
              <Stack key={u.u} direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }, px: 1, borderRadius: 1 }} onClick={() => void openDM(u.u)}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: u.color || LEGACY.teal, fontSize: 14 }}>{u.name.slice(0, 1).toUpperCase()}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography fontSize={14} fontWeight={700}>{u.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{u.role}</Typography>
                </Box>
                <Checkbox checked={groupSel.includes(u.u)} onClick={(e) => { e.stopPropagation(); setGroupSel((s) => s.includes(u.u) ? s.filter((x) => x !== u.u) : [...s, u.u]); }} />
              </Stack>
            ))}
          </Stack>
          {groupSel.length >= 2 && (
            <Stack spacing={1}>
              <TextField size="small" label="Tên nhóm (tuỳ chọn)" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} fullWidth />
              <Button variant="contained" onClick={() => void createGroup()} sx={{ background: LEGACY.headerGradient }}>Tạo nhóm {groupSel.length + 1} người</Button>
            </Stack>
          )}
          {groupSel.length === 1 && <Typography variant="caption" color="text.secondary">Tích thêm người để tạo nhóm, hoặc bấm vào tên để nhắn 1-1.</Typography>}
        </Box>
      )}

      {/* KHUNG TIN NHẮN */}
      {active && (
        <>
          <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: '#f7faf9', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {active.isGroup && <Chip size="small" label={`👥 ${active.members.map(nameOf).join(', ')}`} sx={{ alignSelf: 'center', mb: 1, height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }} />}
            {active.messages.map((m) => {
              const mine = m.by === me?.u;
              return (
                <Box key={m.id} sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  {active.isGroup && !mine && <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary', fontWeight: 700 }}>{m.byName}</Typography>}
                  <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: mine ? LEGACY.teal : '#fff', color: mine ? '#fff' : 'inherit', boxShadow: 1 }}>
                    {m.text && <Typography fontSize={14} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</Typography>}
                    {m.file && (
                      <Box component="a" href={workerFileUrl(m.file.key)} target="_blank" rel="noreferrer"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: m.text ? 0.5 : 0, color: mine ? '#fff' : LEGACY.teal, textDecoration: 'none', fontSize: 13 }}>
                        <InsertDriveFileOutlinedIcon fontSize="small" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file.name}</span>
                        <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>· {fmtSize(m.file.size)}</span>
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', textAlign: mine ? 'right' : 'left', mx: 1 }}>{fmtTime(m.at)}</Typography>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ p: 1, borderTop: '1px solid rgba(15,58,74,0.1)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Gửi file (≤20MB)"><IconButton component="label" disabled={busy}><AttachFileIcon /><input type="file" hidden onChange={onPickFile} /></IconButton></Tooltip>
            <InputBase value={text} onChange={(e) => setText(e.target.value)} placeholder={busy ? 'Đang tải file…' : 'Nhập tin nhắn…'} multiline maxRows={4}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              sx={{ flex: 1, px: 1.5, py: 0.5, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 3, fontSize: 14 }} />
            <IconButton color="primary" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon /></IconButton>
          </Box>
        </>
      )}
    </Drawer>
  );
}
