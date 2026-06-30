import { Fragment, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Avatar, Badge, Box, Button, Checkbox, Chip, Drawer, IconButton, InputBase, LinearProgress, List, ListItemButton,
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
import { canViewStaffRole } from '@/auth/ROLES';
import { useChatStore, chatUnread, firstUnreadIndex } from '@/stores/chatStore';
import { dmChatId, sbEnsureChat, sbSubscribeChat, sbSendChatMessage, sbMarkChatRead, sbEditChatMessage, sbDeleteChatMessage, sbToggleChatReaction, sbChatTyping, type TypingChannel } from '@/lib/supabase';
import { requestBrowserNotifPermission } from '@/lib/notifications';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { toast } from '@/stores/toastStore';
import { FilePreviewDialog, type PreviewFile } from '@/components/common/FilePreviewDialog';
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
  const online = useChatStore((s) => s.online);
  const setPanelOpen = useChatStore((s) => s.setPanelOpen);
  const setActiveChatId = useChatStore((s) => s.setActiveChatId);
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;
  const isOnline = (u?: string) => !!u && u !== me?.u && online.includes(u);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<{ m: ChatMessage; el: HTMLElement } | null>(null);
  const [typers, setTypers] = useState<{ u: string; name: string }[]>([]);
  // Mốc đọc CHỐT khi mở cuộc — để dải "Tin chưa đọc" không biến mất ngay khi tự đánh dấu đã đọc.
  const [anchor, setAnchor] = useState<{ id: string; read?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<TypingChannel | null>(null);
  const lastPingRef = useRef(0);

  const previewOf = (m: ChatMessage) => (m.deleted ? 'Tin đã thu hồi' : m.text || (m.file ? `📎 ${m.file.name}` : ''));

  // Cuộc đang mở: subscribe RIÊNG (kèm toàn bộ tin nhắn) — danh sách `chats` không tải messages.
  const [active, setActive] = useState<Chat | null>(null);
  useEffect(() => {
    if (!activeId) { setActive(null); return; }
    setActive(null); setAnchor(null);
    return sbSubscribeChat(activeId, setActive);
  }, [activeId]);
  const titleOf = (c: Chat) => (c.isGroup ? (c.title || 'Nhóm') : nameOf(c.members.find((m) => m !== me?.u) ?? ''));

  // Báo cho store biết panel đang mở (để khỏi báo trùng tin của cuộc đang xem) + xin quyền OS notif.
  useEffect(() => { setPanelOpen(open); if (open) void requestBrowserNotifPermission(); }, [open, setPanelOpen]);
  useEffect(() => { setActiveChatId(activeId); }, [activeId, setActiveChatId]);

  // Kênh "đang nhập…" cho cuộc đang mở (Realtime broadcast).
  useEffect(() => {
    setTypers([]);
    if (!activeId || !me) { typingRef.current = null; return; }
    const ch = sbChatTyping(activeId, me.u, me.name, setTypers);
    typingRef.current = ch;
    return () => { ch.close(); typingRef.current = null; };
  }, [activeId, me]);

  // Đánh dấu đã đọc + chốt mốc unread + cuộn xuống khi mở/đổi cuộc / có tin mới.
  useEffect(() => {
    if (!active || !me || active.id !== activeId) return;
    setAnchor((a) => a ?? { id: active.id, read: active.reads?.[me.u] });
    if (chatUnread(active, me.u)) void sbMarkChatRead(active.id, me.u);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, [active?.messages.length, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gõ phím → báo "đang nhập" (throttle 1.5s).
  const onTypeText = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && typingRef.current && now - lastPingRef.current > 1500) {
      lastPingRef.current = now;
      typingRef.current.ping();
    }
  };

  const unreadIdx = active && anchor?.id === active.id && me
    ? firstUnreadIndex(active.messages, anchor.read, me.u)
    : -1;

  const openDM = async (otherU: string) => {
    if (!me) return;
    const id = dmChatId(me.u, otherU);
    await sbEnsureChat({ id, members: [me.u, otherU], isGroup: false, createdBy: me.u, createdAt: new Date().toISOString(), messages: [] });
    setNewMode(false); setActiveId(id);
  };
  const createGroup = async () => {
    if (!me || groupSel.length < 1) return;
    const id = 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await sbEnsureChat({ id, members: [me.u, ...groupSel], isGroup: true, title: groupTitle.trim() || `Nhóm ${groupSel.length + 1} người`, createdBy: me.u, createdAt: new Date().toISOString(), messages: [] });
    setNewMode(false); setGroupSel([]); setGroupTitle(''); setActiveId(id);
  };

  const send = async (file?: ChatMessage['file']) => {
    if (!me || !active) return;
    const body = text.trim();
    // Đang sửa tin (chỉ với text, không kèm file).
    if (editTarget && !file) {
      if (!body) return;
      const t = editTarget; setText(''); setEditTarget(null);
      try { await sbEditChatMessage(active.id, t.id, body); }
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
    try { await sbSendChatMessage(active.id, msg); }
    catch (e) { toast('Gửi lỗi: ' + (e as Error).message, 'error'); }
  };

  const startReply = (m: ChatMessage) => { setReplyTarget(m); setEditTarget(null); setMenuFor(null); };
  const startEdit = (m: ChatMessage) => { setEditTarget(m); setReplyTarget(null); setText(m.text ?? ''); setMenuFor(null); };
  const doDelete = async (m: ChatMessage) => {
    setMenuFor(null);
    if (!active || !window.confirm('Thu hồi tin nhắn này?')) return;
    try { await sbDeleteChatMessage(active.id, m.id); }
    catch (e) { toast('Thu hồi lỗi: ' + (e as Error).message, 'error'); }
  };
  const react = (m: ChatMessage, emoji: string) => {
    if (!active || !me) return;
    setMenuFor(null);
    void sbToggleChatReaction(active.id, m.id, emoji, me.u).catch((e) => toast('Lỗi: ' + (e as Error).message, 'error'));
  };
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !active) return;
    if (f.size > MAX_FILE) { toast('File vượt quá 20MB.', 'warning'); return; }
    setBusy(true); setUploadPct(0);
    try {
      const up = await uploadFileToWorker(f, setUploadPct);
      await send({ key: up.key, name: up.name, size: f.size, mime: f.type });
    } catch (e2) { toast('Tải file lỗi: ' + (e2 as Error).message, 'error'); }
    finally { setBusy(false); setUploadPct(0); }
  };

  const others = users.filter((u) => u.u !== me?.u);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, display: 'flex', flexDirection: 'column' } } }}>
      <Box sx={{ px: 2, py: 1.5, background: LEGACY.headerGradient, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
        {(active || newMode) && <IconButton size="small" onClick={() => { setActiveId(null); setNewMode(false); }} sx={{ color: '#fff' }}><ArrowBackIcon /></IconButton>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={800} noWrap>{active ? titleOf(active) : newMode ? 'Cuộc trò chuyện mới' : '💬 Tin nhắn nội bộ'}</Typography>
          {active && !active.isGroup && isOnline(active.members.find((m) => m !== me?.u)) && (
            <Typography sx={{ fontSize: 11, lineHeight: 1.2, opacity: 0.95 }}>● Đang hoạt động</Typography>
          )}
        </Box>
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
                      <Badge overlap="circular" variant="dot" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        invisible={c.isGroup || !isOnline(c.members.find((m) => m !== me?.u))}
                        sx={{ '& .MuiBadge-dot': { bgcolor: '#22c55e', border: '2px solid #fff', width: 11, height: 11, borderRadius: '50%' } }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: c.isGroup ? '#7c3aed' : LEGACY.teal, fontSize: 15 }}>{c.isGroup ? '👥' : titleOf(c).slice(0, 1).toUpperCase()}</Avatar>
                      </Badge>
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
                <Badge overlap="circular" variant="dot" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} invisible={!isOnline(u.u)}
                  sx={{ '& .MuiBadge-dot': { bgcolor: '#22c55e', border: '2px solid #fff', width: 10, height: 10, borderRadius: '50%' } }}>
                  <Avatar sx={{ width: 32, height: 32, bgcolor: u.color || LEGACY.teal, fontSize: 14 }}>{u.name.slice(0, 1).toUpperCase()}</Avatar>
                </Badge>
                <Box sx={{ flex: 1 }}>
                  <Typography fontSize={14} fontWeight={700}>{u.name}{isOnline(u.u) ? ' · đang hoạt động' : ''}</Typography>
                  {canViewStaffRole(me) && <Typography variant="caption" color="text.secondary">{u.role}</Typography>}
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
            {active.messages.map((m, idx) => {
              const mine = m.by === me?.u;
              return (
                <Fragment key={m.id}>
                {idx === unreadIdx && (
                  <Box sx={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#dc3250', opacity: 0.35 }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#dc3250' }}>Tin chưa đọc</Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#dc3250', opacity: 0.35 }} />
                  </Box>
                )}
                <Box sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', '&:hover .msg-act': { opacity: 1 } }}>
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
                          {m.file && (() => {
                            const mf = m.file;
                            const openPreview = () => setPreview({ key: mf.key, name: mf.name, mime: mf.mime });
                            return isImage(mf) ? (
                              <Box onClick={openPreview} sx={{ display: 'block', mt: m.text ? 0.5 : 0, cursor: 'pointer' }}>
                                <Box component="img" src={workerFileUrl(mf.key)} alt={mf.name} loading="lazy"
                                  sx={{ display: 'block', maxWidth: 230, maxHeight: 240, width: 'auto', borderRadius: 1.5, objectFit: 'cover' }} />
                                <Typography sx={{ fontSize: 10.5, opacity: 0.75, mt: 0.25 }}>{mf.name} · {fmtSize(mf.size)}</Typography>
                              </Box>
                            ) : (
                              <Box onClick={openPreview}
                                sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: m.text ? 0.5 : 0, p: 0.75, borderRadius: 1.5, cursor: 'pointer',
                                  bgcolor: mine ? 'rgba(255,255,255,0.15)' : 'rgba(20,150,140,0.08)', color: mine ? '#fff' : LEGACY.navy, minWidth: 180 }}>
                                <Box sx={{ flexShrink: 0, width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  bgcolor: mine ? 'rgba(255,255,255,0.2)' : 'rgba(20,150,140,0.15)' }}>
                                  <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: mine ? '#fff' : LEGACY.teal }} />
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mf.name}</Typography>
                                  <Typography sx={{ fontSize: 10.5, opacity: 0.7 }}>{fmtSize(mf.size)} · Xem trước</Typography>
                                </Box>
                              </Box>
                            );
                          })()}
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
                  {mine && m.id === active.messages[active.messages.length - 1]?.id && (() => {
                    const seers = active.members.filter((u) => u !== me?.u && (active.reads?.[u] ?? '') >= m.at);
                    if (!seers.length) return null;
                    return (
                      <Typography variant="caption" sx={{ color: LEGACY.teal, fontWeight: 600, display: 'block', textAlign: 'right', mx: 1 }}>
                        ✓✓ {active.isGroup ? `Đã xem ${seers.length}/${active.members.length - 1}` : `Đã xem · ${fmtTime(active.reads![seers[0]])}`}
                      </Typography>
                    );
                  })()}
                </Box>
                </Fragment>
              );
            })}
          </Box>
          {active && typers.length > 0 && (
            <Box sx={{ px: 2, pb: 0.5, mt: -0.25 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                {active.isGroup
                  ? `${typers.map((t) => t.name).join(', ')} đang nhập…`
                  : 'Đang nhập…'}
              </Typography>
            </Box>
          )}
          {busy && (
            <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid rgba(15,58,74,0.08)' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Đang tải… {uploadPct}%</Typography>
                <LinearProgress variant={uploadPct > 0 && uploadPct < 100 ? 'determinate' : 'indeterminate'} value={uploadPct} sx={{ flex: 1, borderRadius: 2 }} />
              </Stack>
            </Box>
          )}
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
            <InputBase value={text} onChange={(e) => onTypeText(e.target.value)} placeholder={busy ? 'Đang tải file…' : 'Nhập tin nhắn…'} multiline maxRows={4}
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

      <FilePreviewDialog open={!!preview} onClose={() => setPreview(null)} file={preview} />
    </Drawer>
  );
}
