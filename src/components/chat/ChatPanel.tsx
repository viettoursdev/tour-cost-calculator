import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Avatar, Badge, Box, Button, Checkbox, Chip, Drawer, IconButton, InputBase, List, ListItemButton,
  Menu, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddCommentIcon from '@mui/icons-material/AddComment';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ReplyIcon from '@mui/icons-material/Reply';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, chatUnread } from '@/stores/chatStore';
import { dmChatId, fbEnsureChat, fbSendChatMessage, fbMarkChatRead, fbEditChatMessage, fbDeleteChatMessage, fbToggleChatReaction } from '@/lib/firebase';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { Chat, ChatMessage } from '@/types';

const MAX_FILE = 20 * 1024 * 1024;
const REACTIONS = ['👍', '❤️', '😄', '🎉', '✅', '😮'];
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const fmtTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const isImage = (f: { name: string; mime?: string }) =>
  (f.mime?.startsWith('image/') ?? false) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name);

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
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<{ m: ChatMessage; el: HTMLElement } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const previewOf = (m: ChatMessage) => (m.deleted ? 'Tin đã thu hồi' : m.text || (m.file ? `📎 ${m.file.name}` : ''));

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
    // Đang sửa tin (chỉ với text, không kèm file).
    if (editTarget && !file) {
      if (!body) return;
      const t = editTarget; setText(''); setEditTarget(null);
      try { await fbEditChatMessage(active.id, t.id, body); }
      catch (e) { toast('Sửa lỗi: ' + (e as Error).message, 'error'); }
      return;
    }
    if (!body && !file) return;
    const msg: ChatMessage = {
      id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(),
      ...(body ? { text: body } : {}), ...(file ? { file } : {}),
      ...(replyTarget ? { replyTo: { id: replyTarget.id, byName: replyTarget.byName, text: previewOf(replyTarget) } } : {}),
    };
    setText(''); setReplyTarget(null);
    try { await fbSendChatMessage(active.id, msg); }
    catch (e) { toast('Gửi lỗi: ' + (e as Error).message, 'error'); }
  };

  const startReply = (m: ChatMessage) => { setReplyTarget(m); setEditTarget(null); setMenuFor(null); };
  const startEdit = (m: ChatMessage) => { setEditTarget(m); setReplyTarget(null); setText(m.text ?? ''); setMenuFor(null); };
  const doDelete = async (m: ChatMessage) => {
    setMenuFor(null);
    if (!active || !window.confirm('Thu hồi tin nhắn này?')) return;
    try { await fbDeleteChatMessage(active.id, m.id); }
    catch (e) { toast('Thu hồi lỗi: ' + (e as Error).message, 'error'); }
  };
  const react = (m: ChatMessage, emoji: string) => {
    if (!active || !me) return;
    setMenuFor(null);
    void fbToggleChatReaction(active.id, m.id, emoji, me.u).catch((e) => toast('Lỗi: ' + (e as Error).message, 'error'));
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
                <Box key={m.id} sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', '&:hover .msg-act': { opacity: 1 } }}>
                  {active.isGroup && !mine && <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary', fontWeight: 700 }}>{m.byName}</Typography>}
                  <Stack direction={mine ? 'row-reverse' : 'row'} alignItems="center" spacing={0.25}>
                    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: mine ? LEGACY.teal : '#fff', color: mine ? '#fff' : 'inherit', boxShadow: 1, minWidth: 0 }}>
                      {m.deleted ? (
                        <Typography fontSize={13} sx={{ fontStyle: 'italic', opacity: 0.75 }}>🚫 Tin đã thu hồi</Typography>
                      ) : (
                        <>
                          {m.replyTo && (
                            <Box sx={{ borderLeft: '3px solid', borderColor: mine ? 'rgba(255,255,255,0.65)' : LEGACY.teal, pl: 1, mb: 0.5, opacity: 0.9 }}>
                              <Typography fontSize={11} fontWeight={700} noWrap>{m.replyTo.byName}</Typography>
                              <Typography fontSize={12} noWrap sx={{ maxWidth: 220 }}>{m.replyTo.text}</Typography>
                            </Box>
                          )}
                          {m.text && <Typography fontSize={14} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</Typography>}
                          {m.file && (isImage(m.file) ? (
                            <Box component="a" href={workerFileUrl(m.file.key)} target="_blank" rel="noreferrer" sx={{ display: 'block', mt: m.text ? 0.5 : 0 }}>
                              <Box component="img" src={workerFileUrl(m.file.key)} alt={m.file.name} loading="lazy"
                                sx={{ display: 'block', maxWidth: 230, maxHeight: 240, width: 'auto', borderRadius: 1.5, objectFit: 'cover' }} />
                              <Typography sx={{ fontSize: 10.5, opacity: 0.75, mt: 0.25 }}>{m.file.name} · {fmtSize(m.file.size)}</Typography>
                            </Box>
                          ) : (
                            <Box component="a" href={workerFileUrl(m.file.key)} target="_blank" rel="noreferrer" download
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: m.text ? 0.5 : 0, p: 0.75, borderRadius: 1.5,
                                bgcolor: mine ? 'rgba(255,255,255,0.15)' : 'rgba(20,150,140,0.08)', color: mine ? '#fff' : LEGACY.navy,
                                textDecoration: 'none', minWidth: 180 }}>
                              <Box sx={{ flexShrink: 0, width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: mine ? 'rgba(255,255,255,0.2)' : 'rgba(20,150,140,0.15)' }}>
                                <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: mine ? '#fff' : LEGACY.teal }} />
                              </Box>
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file.name}</Typography>
                                <Typography sx={{ fontSize: 10.5, opacity: 0.7 }}>{fmtSize(m.file.size)} · Tải về</Typography>
                              </Box>
                            </Box>
                          ))}
                        </>
                      )}
                    </Box>
                    {!m.deleted && (
                      <IconButton className="msg-act" size="small" onClick={(e) => setMenuFor({ m, el: e.currentTarget })}
                        sx={{ opacity: 0, transition: 'opacity .15s', color: 'text.disabled', width: 26, height: 26 }}>
                        <MoreVertIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Stack>
                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.4, flexWrap: 'wrap', justifyContent: mine ? 'flex-end' : 'flex-start' }} useFlexGap>
                      {Object.entries(m.reactions).map(([emo, us]) => {
                        const reacted = us.includes(me?.u ?? '');
                        return (
                          <Box key={emo} onClick={() => react(m, emo)} title={us.map(nameOf).join(', ')}
                            sx={{ cursor: 'pointer', fontSize: 11, lineHeight: 1.6, px: 0.7, borderRadius: 3, border: '1px solid',
                              borderColor: reacted ? LEGACY.teal : 'rgba(15,58,74,0.15)', bgcolor: reacted ? 'rgba(20,150,140,0.12)' : '#fff' }}>
                            {emo} {us.length}
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', textAlign: mine ? 'right' : 'left', mx: 1 }}>
                    {fmtTime(m.at)}{m.editedAt && !m.deleted ? ' · đã sửa' : ''}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          {(replyTarget || editTarget) && (
            <Box sx={{ px: 1.5, py: 0.75, borderTop: '1px solid rgba(15,58,74,0.08)', bgcolor: 'rgba(20,150,140,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 2, bgcolor: LEGACY.teal }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize={11} fontWeight={800} color={LEGACY.teal}>
                  {editTarget ? 'Đang sửa tin nhắn' : `Trả lời ${replyTarget?.byName}`}
                </Typography>
                <Typography fontSize={12} noWrap color="text.secondary">
                  {editTarget ? (editTarget.text ?? '') : previewOf(replyTarget!)}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => { setReplyTarget(null); setEditTarget(null); if (editTarget) setText(''); }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
            </Box>
          )}
          <Box sx={{ p: 1, borderTop: '1px solid rgba(15,58,74,0.1)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Gửi file (≤20MB)"><IconButton component="label" disabled={busy}><AttachFileIcon /><input type="file" hidden onChange={onPickFile} /></IconButton></Tooltip>
            <InputBase value={text} onChange={(e) => setText(e.target.value)} placeholder={busy ? 'Đang tải file…' : 'Nhập tin nhắn…'} multiline maxRows={4}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              sx={{ flex: 1, px: 1.5, py: 0.5, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 3, fontSize: 14 }} />
            <IconButton color="primary" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon /></IconButton>
          </Box>
        </>
      )}

      <Menu anchorEl={menuFor?.el} open={!!menuFor} onClose={() => setMenuFor(null)}>
        <Stack direction="row" sx={{ px: 1, py: 0.25 }}>
          {REACTIONS.map((e) => (
            <IconButton key={e} size="small" onClick={() => menuFor && react(menuFor.m, e)} sx={{ fontSize: 18, width: 34, height: 34 }}>{e}</IconButton>
          ))}
        </Stack>
        <MenuItem onClick={() => menuFor && startReply(menuFor.m)}><ReplyIcon fontSize="small" sx={{ mr: 1 }} />Trả lời</MenuItem>
        {menuFor?.m.by === me?.u && !!menuFor?.m.text && (
          <MenuItem onClick={() => menuFor && startEdit(menuFor.m)}><EditIcon fontSize="small" sx={{ mr: 1 }} />Sửa</MenuItem>
        )}
        {menuFor?.m.by === me?.u && (
          <MenuItem onClick={() => menuFor && void doDelete(menuFor.m)} sx={{ color: '#dc3250' }}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Thu hồi</MenuItem>
        )}
      </Menu>
    </Drawer>
  );
}
