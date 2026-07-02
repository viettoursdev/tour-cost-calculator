import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type UIEvent } from 'react';
import {
  Avatar, Badge, Box, Button, Checkbox, Chip, CircularProgress, Drawer, IconButton, InputBase, LinearProgress, List, ListItemButton,
  Menu, MenuItem, Popover, Stack, TextField, Tooltip, Typography,
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
import EmojiEmotionsOutlinedIcon from '@mui/icons-material/EmojiEmotionsOutlined';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import SearchIcon from '@mui/icons-material/Search';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import ForwardOutlinedIcon from '@mui/icons-material/ForwardOutlined';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useAuthStore } from '@/stores/authStore';
import { canViewStaffRole } from '@/auth/ROLES';
import { useChatStore, chatUnread, firstUnreadIndex } from '@/stores/chatStore';
import { dmChatId, sbEnsureChat, sbSubscribeChat, sbSendChatMessage, sbMarkChatRead, sbEditChatMessage, sbDeleteChatMessage, sbToggleChatReaction, sbSetChatMessagePinned, sbChatTyping, sbSendNotificationMany, type TypingChannel, type ChatSubscription } from '@/lib/supabase';
import { requestBrowserNotifPermission } from '@/lib/notifications';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { chatDayLabel, sameDay, groupWithPrev, mentionQuery, applyMention, mentionSegments, matchMessageIds, searchHighlight } from '@/lib/chatFormat';
import { sbSearchChatMessages, type ChatSearchHit } from '@/lib/chatSearch';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { GroupManageDialog } from '@/components/chat/GroupManageDialog';
import { ForwardDialog } from '@/components/chat/ForwardDialog';
import { toast } from '@/stores/toastStore';
import { FilePreviewDialog, type PreviewFile } from '@/components/common/FilePreviewDialog';
import { LEGACY } from '@/theme';
import type { Chat, ChatMessage } from '@/types';

const MAX_FILE = 20 * 1024 * 1024;
const CHAT_PAGE_HINT = 12; // chỉ hiện "Đầu cuộc trò chuyện" khi đủ nhiều tin
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
  const muted = useChatStore((s) => s.muted);
  const toggleMute = useChatStore((s) => s.toggleMute);
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
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [mentionSel, setMentionSel] = useState<string[]>([]); // username đã @nhắc trong tin đang soạn
  const [dragOver, setDragOver] = useState(false);
  const [listQ, setListQ] = useState('');            // tìm trong danh sách cuộc
  const [msgResults, setMsgResults] = useState<ChatSearchHit[]>([]); // tìm tin nhắn toàn cục
  const [searchOpen, setSearchOpen] = useState(false); // thanh tìm trong cuộc
  const [searchQ, setSearchQ] = useState('');
  const [matchPos, setMatchPos] = useState(0);
  const [manageOpen, setManageOpen] = useState(false); // dialog quản lý nhóm
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null); // tin đang chuyển tiếp
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<TypingChannel | null>(null);
  const lastPingRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatSubRef = useRef<ChatSubscription | null>(null);
  const skipAutoScrollRef = useRef(false);            // bỏ auto-cuộn-đáy khi tải tin cũ
  const restoreHeightRef = useRef<number | null>(null); // chiều cao trước khi chèn tin cũ (giữ vị trí)

  const previewOf = (m: ChatMessage) => (m.deleted ? 'Tin đã thu hồi' : m.text || (m.file ? `📎 ${m.file.name}` : ''));

  // Cuộc đang mở: subscribe RIÊNG (nạp trang tin mới nhất + cập nhật tăng dần).
  const [active, setActive] = useState<Chat | null>(null);
  useEffect(() => {
    setText(''); setReplyTarget(null); setEditTarget(null); setMentionSel([]); setMentionQ(null);
    setSearchOpen(false); setSearchQ(''); setMatchPos(0); setManageOpen(false);
    setHasMoreOlder(false); setLoadingOlder(false); skipAutoScrollRef.current = false; restoreHeightRef.current = null;
    if (!activeId) { setActive(null); chatSubRef.current = null; return; }
    setActive(null); setAnchor(null);
    const sub = sbSubscribeChat(activeId, (chat, meta) => { setActive(chat); if (meta) setHasMoreOlder(meta.hasMore); });
    chatSubRef.current = sub;
    return () => { sub(); chatSubRef.current = null; };
  }, [activeId]);

  // Giữ vị trí cuộn sau khi chèn trang tin CŨ ở đầu (tránh nhảy màn).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && restoreHeightRef.current != null) {
      el.scrollTop = el.scrollTop + (el.scrollHeight - restoreHeightRef.current);
      restoreHeightRef.current = null;
      setLoadingOlder(false);
    }
  }, [active?.messages.length]);

  // Cuộn lên đầu → tải thêm trang tin cũ.
  const onMessagesScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop <= 64 && hasMoreOlder && !loadingOlder && chatSubRef.current) {
      setLoadingOlder(true);
      skipAutoScrollRef.current = true;
      restoreHeightRef.current = el.scrollHeight;
      void chatSubRef.current.loadOlder().then((n) => {
        if (!n) { setLoadingOlder(false); skipAutoScrollRef.current = false; restoreHeightRef.current = null; }
      });
    }
  };
  const titleOf = (c: Chat) => {
    if (c.isGroup) return c.title || 'Nhóm';
    if (c.id === `saved_${me?.u ?? ''}` || (c.members.length === 1 && c.members[0] === me?.u)) return '📌 Tin đã lưu';
    return nameOf(c.members.find((m) => m !== me?.u) ?? '');
  };

  // Tìm TIN NHẮN toàn cục theo ô tìm ở danh sách (debounce 300ms; RLS lọc theo cuộc của mình).
  useEffect(() => {
    const q = listQ.trim();
    if (q.length < 2) { setMsgResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      sbSearchChatMessages(q).then((r) => { if (alive) setMsgResults(r); }).catch(() => { if (alive) setMsgResults([]); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [listQ]);

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
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; } // đang tải tin cũ → giữ vị trí
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, [active?.messages.length, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tìm trong cuộc: đổi từ khoá → về kết quả đầu & cuộn tới.
  useEffect(() => {
    if (!searchQ || !active) { setMatchPos(0); return; }
    const ids = matchMessageIds(active.messages, searchQ);
    setMatchPos(0);
    if (ids[0]) setTimeout(() => scrollToMsg(ids[0]), 30);
  }, [searchQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gõ phím → báo "đang nhập" (throttle 1.5s).
  const onTypeText = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && typingRef.current && now - lastPingRef.current > 1500) {
      lastPingRef.current = now;
      typingRef.current.ping();
    }
  };
  const handleType = (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const el = e.target as HTMLTextAreaElement;
    onTypeText(el.value);
    setMentionQ(active?.isGroup ? mentionQuery(el.value, el.selectionStart ?? el.value.length) : null);
  };
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const next = text.slice(0, caret) + emoji + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => { if (el) { el.focus(); const p = caret + emoji.length; el.setSelectionRange(p, p); } });
  };
  const pickMention = (u: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const { value, caret: nc } = applyMention(text, caret, nameOf(u));
    setText(value);
    setMentionSel((s) => (s.includes(u) ? s : [...s, u]));
    setMentionQ(null);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(nc, nc); } });
  };
  const mentionCandidates = active?.isGroup && mentionQ !== null
    ? active.members.filter((u) => u !== me?.u).map((u) => ({ u, name: nameOf(u) }))
        .filter(({ name }) => name.toLowerCase().includes((mentionQ ?? '').toLowerCase())).slice(0, 6)
    : [];

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
    // Mentions: chỉ giữ những người mà tên @ còn xuất hiện trong nội dung đã soạn.
    const mentions = active.isGroup && body ? mentionSel.filter((u) => body.includes('@' + nameOf(u))) : [];
    const msg: ChatMessage = {
      id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(),
      ...(body ? { text: body } : {}), ...(file ? { file } : {}),
      ...(replyTarget ? { replyTo: { id: replyTarget.id, byName: replyTarget.byName, text: previewOf(replyTarget) } } : {}),
      ...(mentions.length ? { mentions } : {}),
    };
    setText(''); setReplyTarget(null); setMentionSel([]); setMentionQ(null);
    try {
      await sbSendChatMessage(active.id, msg);
      const notify = mentions.filter((u) => u !== me.u);
      if (notify.length) {
        void sbSendNotificationMany(notify, {
          type: 'announcement',
          title: `💬 ${me.name} nhắc bạn trong "${titleOf(active)}"`,
          message: body.slice(0, 140),
          createdBy: me.name,
        }).catch(() => { /* thông báo phụ — bỏ qua lỗi */ });
      }
    } catch (e) { toast('Gửi lỗi: ' + (e as Error).message, 'error'); }
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
  const savedChatId = me ? `saved_${me.u}` : '';
  const togglePin = (m: ChatMessage) => {
    if (!active) return;
    setMenuFor(null);
    void sbSetChatMessagePinned(active.id, m.id, !m.pinned).catch((e) => toast('Ghim lỗi: ' + (e as Error).message, 'error'));
  };
  const forwardTo = async (targetChatId: string, m: ChatMessage) => {
    if (!me) return;
    const copy: ChatMessage = {
      id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(),
      ...(m.text ? { text: m.text } : {}), ...(m.file ? { file: m.file } : {}),
      forwardedFrom: m.forwardedFrom ?? m.byName,
    };
    try { await sbSendChatMessage(targetChatId, copy); }
    catch (e) { toast('Chuyển tiếp lỗi: ' + (e as Error).message, 'error'); }
  };
  const saveMessage = async (m: ChatMessage) => {
    if (!me) return;
    setMenuFor(null);
    try {
      await sbEnsureChat({ id: savedChatId, members: [me.u], isGroup: false, createdBy: me.u, createdAt: new Date().toISOString(), title: 'Tin đã lưu', messages: [] });
      await forwardTo(savedChatId, m);
      toast('Đã lưu vào "Tin đã lưu".', 'success');
    } catch (e) { toast('Lưu lỗi: ' + (e as Error).message, 'error'); }
  };
  // Tin hệ thống ghi lại sự kiện nhóm (đổi tên/thêm/xoá/rời) — hiển thị giữa khung.
  const sendSystem = (text: string) => {
    if (!me || !active) return;
    const msg: ChatMessage = { id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(), text: `${me.name} ${text}`, system: true };
    void sbSendChatMessage(active.id, msg).catch(() => { /* phụ trợ — bỏ qua lỗi */ });
  };
  const scrollToMsg = (mid: string) => {
    const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(mid)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  // Mở cuộc từ kết quả tìm tin toàn cục + bật tìm-trong-cuộc để tô sáng từ khoá.
  const openMessageHit = (hit: ChatSearchHit) => {
    const q = listQ.trim();
    setActiveId(hit.chatId);
    setListQ('');
    if (q) setTimeout(() => { setSearchOpen(true); setSearchQ(q); }, 80);
  };
  const pushFileMessage = async (file: ChatMessage['file']) => {
    if (!me || !active || !file) return;
    const msg: ChatMessage = { id: uid(), by: me.u, byName: me.name, at: new Date().toISOString(), file };
    try { await sbSendChatMessage(active.id, msg); }
    catch (e) { toast('Gửi lỗi: ' + (e as Error).message, 'error'); }
  };
  // Tải & gửi NHIỀU file lần lượt (mỗi file là một tin). Dùng cho chọn/kéo-thả/dán.
  const uploadAndSend = async (files: File[]) => {
    if (!active) return;
    const list = files.filter((f) => {
      if (f.size > MAX_FILE) { toast(`"${f.name}" vượt quá 20MB.`, 'warning'); return false; }
      return true;
    });
    if (!list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        setUploadPct(0);
        const up = await uploadFileToWorker(f, setUploadPct);
        await pushFileMessage({ key: up.key, name: up.name, size: f.size, mime: f.type });
      }
    } catch (e) { toast('Tải file lỗi: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); setUploadPct(0); }
  };
  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []); e.target.value = '';
    void uploadAndSend(fs);
  };
  const onDropFiles = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const fs = Array.from(e.dataTransfer?.files ?? []);
    if (fs.length) void uploadAndSend(fs);
  };
  const onPasteFiles = (e: ClipboardEvent) => {
    const fs = Array.from(e.clipboardData?.files ?? []);
    if (fs.length) { e.preventDefault(); void uploadAndSend(fs); }
  };

  const others = users.filter((u) => u.u !== me?.u);

  // Tìm trong cuộc đang mở.
  const matchIds = active && searchQ.trim() ? matchMessageIds(active.messages, searchQ) : [];
  const activeMatchId = matchIds[matchPos];
  const gotoMatch = (delta: number) => {
    if (!matchIds.length) return;
    const n = (matchPos + delta + matchIds.length) % matchIds.length;
    setMatchPos(n); scrollToMsg(matchIds[n]);
  };
  // Lọc danh sách cuộc theo tên/preview/thành viên.
  const lq = listQ.trim().toLowerCase();
  const shownChats = lq
    ? chats.filter((c) => `${titleOf(c)} ${c.lastText ?? ''} ${c.members.map(nameOf).join(' ')}`.toLowerCase().includes(lq))
    : chats;
  const isMuted = active ? muted.includes(active.id) : false;
  const pinned = active ? active.messages.filter((m) => m.pinned && !m.deleted) : [];

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
        {active && (
          <>
            <Tooltip title="Tìm trong cuộc"><IconButton size="small" onClick={() => { setSearchOpen((v) => !v); setSearchQ(''); }} sx={{ color: '#fff', opacity: searchOpen ? 1 : 0.85 }}><SearchIcon /></IconButton></Tooltip>
            <Tooltip title={isMuted ? 'Bật lại thông báo' : 'Tắt thông báo'}><IconButton size="small" onClick={() => toggleMute(active.id)} sx={{ color: '#fff' }}>{isMuted ? <NotificationsOffOutlinedIcon /> : <NotificationsActiveOutlinedIcon />}</IconButton></Tooltip>
            {active.isGroup && <Tooltip title="Quản lý nhóm"><IconButton size="small" onClick={() => setManageOpen(true)} sx={{ color: '#fff' }}><GroupAddOutlinedIcon /></IconButton></Tooltip>}
          </>
        )}
        <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </Box>

      {/* DANH SÁCH CUỘC TRÒ CHUYỆN */}
      {!active && !newMode && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {chats.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>Chưa có cuộc trò chuyện. Bấm ✏️ để bắt đầu.</Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                <InputBase fullWidth value={listQ} onChange={(e) => setListQ(e.target.value)} placeholder="Tìm cuộc & tin nhắn…" sx={{ fontSize: 14 }} />
                {listQ && <IconButton size="small" onClick={() => setListQ('')}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>}
              </Box>
              <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {lq && shownChats.length === 0 && msgResults.length === 0 && (
                  <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>Không tìm thấy kết quả cho “{listQ}”.</Box>
                )}
                {lq && shownChats.length > 0 && (
                  <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>CUỘC TRÒ CHUYỆN</Typography>
                )}
                {shownChats.length > 0 && (
                  <List disablePadding>
                    {shownChats.map((c) => {
                      const unread = me ? chatUnread(c, me.u) : false;
                      return (
                        <ListItemButton key={c.id} onClick={() => setActiveId(c.id)} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Badge color="error" variant="dot" invisible={!unread || muted.includes(c.id)} sx={{ mr: 1.5 }}>
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
                          <Stack alignItems="flex-end" sx={{ ml: 1 }}>
                            {c.lastAt && <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>{fmtTime(c.lastAt).split(' ')[0]}</Typography>}
                            {muted.includes(c.id) && <NotificationsOffOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                          </Stack>
                        </ListItemButton>
                      );
                    })}
                  </List>
                )}
                {lq && msgResults.length > 0 && (
                  <>
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>TIN NHẮN ({msgResults.length})</Typography>
                    <List disablePadding>
                      {msgResults.map((hit) => {
                        const c = chats.find((x) => x.id === hit.chatId);
                        return (
                          <ListItemButton key={hit.chatId + hit.msgId} onClick={() => openMessageHit(hit)} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)', alignItems: 'flex-start' }}>
                            <Avatar sx={{ width: 32, height: 32, mr: 1.5, mt: 0.25, fontSize: 13, bgcolor: c?.isGroup ? '#7c3aed' : LEGACY.teal }}>{c?.isGroup ? '👥' : (c ? titleOf(c) : '?').slice(0, 1).toUpperCase()}</Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                <Typography fontSize={13.5} fontWeight={700} noWrap>{c ? titleOf(c) : 'Cuộc trò chuyện'}</Typography>
                                <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap', ml: 1 }}>{fmtTime(hit.at).split(' ')[0]}</Typography>
                              </Stack>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                {hit.byName ? `${hit.byName}: ` : ''}
                                {searchHighlight(hit.text, listQ).map((s, i) => (s.hit ? <Box key={i} component="span" sx={{ bgcolor: 'rgba(245,158,11,0.35)' }}>{s.t}</Box> : <Fragment key={i}>{s.t}</Fragment>))}
                              </Typography>
                            </Box>
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </>
                )}
              </Box>
            </>
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
          {searchOpen && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderBottom: '1px solid rgba(15,58,74,0.1)', bgcolor: 'rgba(20,150,140,0.06)' }}>
              <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
              <InputBase autoFocus fullWidth value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Tìm trong cuộc trò chuyện…" sx={{ fontSize: 14 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { setSearchOpen(false); setSearchQ(''); } }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 48, textAlign: 'center' }}>
                {searchQ.trim() ? (matchIds.length ? `${matchPos + 1}/${matchIds.length}` : '0') : ''}
              </Typography>
              <IconButton size="small" disabled={!matchIds.length} onClick={() => gotoMatch(-1)}><KeyboardArrowUpIcon fontSize="small" /></IconButton>
              <IconButton size="small" disabled={!matchIds.length} onClick={() => gotoMatch(1)}><KeyboardArrowDownIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => { setSearchOpen(false); setSearchQ(''); }}><CloseIcon fontSize="small" /></IconButton>
            </Box>
          )}
          {pinned.length > 0 && (
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid rgba(15,58,74,0.1)', bgcolor: 'rgba(245,158,11,0.08)', maxHeight: 96, overflowY: 'auto' }}>
              {pinned.slice().reverse().map((m) => (
                <Stack key={m.id} direction="row" alignItems="center" spacing={0.75} sx={{ py: 0.25 }}>
                  <PushPinIcon sx={{ fontSize: 14, color: '#d18a13' }} />
                  <Typography fontSize={12.5} noWrap sx={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => scrollToMsg(m.id)}>
                    <b>{m.byName}:</b> {m.text || (m.file ? `📎 ${m.file.name}` : '')}
                  </Typography>
                  <Tooltip title="Bỏ ghim"><IconButton size="small" sx={{ width: 22, height: 22 }} onClick={() => togglePin(m)}><CloseIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>
                </Stack>
              ))}
            </Box>
          )}
          <Box ref={scrollRef} onScroll={onMessagesScroll} sx={{ position: 'relative', flex: 1, overflowY: 'auto', p: 1.5, bgcolor: '#f7faf9', display: 'flex', flexDirection: 'column', gap: 0.75 }}
            onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
            onDrop={onDropFiles}>
            {loadingOlder && (
              <Box sx={{ alignSelf: 'center', py: 0.5 }}><CircularProgress size={18} /></Box>
            )}
            {!hasMoreOlder && !loadingOlder && active.messages.length > CHAT_PAGE_HINT && (
              <Typography sx={{ alignSelf: 'center', fontSize: 11, color: 'text.disabled', py: 0.5 }}>· Đầu cuộc trò chuyện ·</Typography>
            )}
            {dragOver && (
              <Box sx={{ position: 'sticky', top: 0, zIndex: 2, alignSelf: 'stretch', py: 2, mb: 1, textAlign: 'center', borderRadius: 2,
                border: '2px dashed', borderColor: LEGACY.teal, bgcolor: 'rgba(20,150,140,0.08)', color: LEGACY.teal, fontWeight: 700, pointerEvents: 'none' }}>
                📎 Thả file để gửi (≤20MB mỗi file)
              </Box>
            )}
            {active.isGroup && <Chip size="small" label={`👥 ${active.members.map(nameOf).join(', ')}`} sx={{ alignSelf: 'center', mb: 1, height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }} />}
            {active.messages.map((m, idx) => {
              const mine = m.by === me?.u;
              const prev = active.messages[idx - 1];
              const next = active.messages[idx + 1];
              const showDay = !prev || !sameDay(prev.at, m.at);
              const grouped = !showDay && groupWithPrev(prev, m);
              const lastOfGroup = !next || !sameDay(m.at, next.at) || !groupWithPrev(m, next);
              return (
                <Fragment key={m.id}>
                {showDay && (
                  <Box sx={{ alignSelf: 'center', my: 0.5 }}>
                    <Chip size="small" label={chatDayLabel(m.at)} sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,58,74,0.08)', color: 'text.secondary' }} />
                  </Box>
                )}
                {idx === unreadIdx && (
                  <Box sx={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#dc3250', opacity: 0.35 }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#dc3250' }}>Tin chưa đọc</Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: '#dc3250', opacity: 0.35 }} />
                  </Box>
                )}
                {m.system ? (
                  <Box data-mid={m.id} sx={{ alignSelf: 'center', my: 0.25, maxWidth: '92%' }}>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', textAlign: 'center', bgcolor: 'rgba(15,58,74,0.06)', px: 1.5, py: 0.4, borderRadius: 3 }}>{m.text}</Typography>
                  </Box>
                ) : (
                <Box data-mid={m.id} sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', mt: grouped ? -0.5 : 0, borderRadius: 2, outline: m.id === activeMatchId ? '2px solid #d18a13' : 'none', outlineOffset: 2, '&:hover .msg-act': { opacity: 1 } }}>
                  {active.isGroup && !mine && !grouped && <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary', fontWeight: 700 }}>{m.byName}</Typography>}
                  <Stack direction={mine ? 'row-reverse' : 'row'} alignItems="center" spacing={0.25}>
                    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: mine ? LEGACY.teal : '#fff', color: mine ? '#fff' : 'inherit', boxShadow: 1, minWidth: 0 }}>
                      {m.deleted ? (
                        <Typography fontSize={13} sx={{ fontStyle: 'italic', opacity: 0.75 }}>🚫 Tin đã thu hồi</Typography>
                      ) : (
                        <>
                          {m.forwardedFrom && (
                            <Typography fontSize={11} sx={{ fontStyle: 'italic', opacity: 0.75, mb: 0.25 }}>↗ Chuyển tiếp từ {m.forwardedFrom}</Typography>
                          )}
                          {m.replyTo && (
                            <Box sx={{ borderLeft: '3px solid', borderColor: mine ? 'rgba(255,255,255,0.65)' : LEGACY.teal, pl: 1, mb: 0.5, opacity: 0.9 }}>
                              <Typography fontSize={11} fontWeight={700} noWrap>{m.replyTo.byName}</Typography>
                              <Typography fontSize={12} noWrap sx={{ maxWidth: 220 }}>{m.replyTo.text}</Typography>
                            </Box>
                          )}
                          {m.text && (
                            <Typography component="div" fontSize={14} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {searchQ.trim() && matchIds.includes(m.id)
                                ? searchHighlight(m.text, searchQ).map((s, i) => (
                                    s.hit
                                      ? <Box key={i} component="span" sx={{ bgcolor: m.id === activeMatchId ? '#ffd54a' : 'rgba(245,158,11,0.4)', color: '#3a2c00', borderRadius: 0.5 }}>{s.t}</Box>
                                      : <Fragment key={i}>{s.t}</Fragment>
                                  ))
                                : mentionSegments(m.text, (m.mentions ?? []).map(nameOf)).map((s, i) => (
                                    s.mention
                                      ? <Box key={i} component="span" sx={{ fontWeight: 700, color: mine ? '#cffff5' : LEGACY.teal }}>{s.t}</Box>
                                      : <Fragment key={i}>{s.t}</Fragment>
                                  ))}
                            </Typography>
                          )}
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
                  {(lastOfGroup || m.editedAt || m.pinned) && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', textAlign: mine ? 'right' : 'left', mx: 1 }}>
                      {m.pinned ? '📌 ' : ''}{fmtTime(m.at)}{m.editedAt && !m.deleted ? ' · đã sửa' : ''}
                    </Typography>
                  )}
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
                )}
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
          <Box sx={{ position: 'relative' }}>
            {mentionCandidates.length > 0 && (
              <Box sx={{ position: 'absolute', bottom: '100%', left: 8, right: 8, mb: 0.5, bgcolor: 'var(--vte-surface)', borderRadius: 2, boxShadow: 4, border: '1px solid rgba(15,58,74,0.12)', overflow: 'hidden', zIndex: 4 }}>
                {mentionCandidates.map(({ u, name }) => (
                  <Box key={u} onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(20,150,140,0.08)' } }}>
                    <Avatar sx={{ width: 24, height: 24, fontSize: 12, bgcolor: LEGACY.teal }}>{name.slice(0, 1).toUpperCase()}</Avatar>
                    <Typography fontSize={13} fontWeight={600}>{name}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ p: 1, borderTop: '1px solid rgba(15,58,74,0.1)', display: 'flex', alignItems: 'flex-end', gap: 0.25 }}>
              <Tooltip title="Emoji"><IconButton disabled={busy} onClick={(e) => setEmojiAnchor(e.currentTarget)}><EmojiEmotionsOutlinedIcon /></IconButton></Tooltip>
              <Tooltip title="Gửi file (≤20MB, chọn nhiều)"><IconButton component="label" disabled={busy}><AttachFileIcon /><input type="file" hidden multiple onChange={onPickFiles} /></IconButton></Tooltip>
              <InputBase inputRef={inputRef} value={text} onChange={handleType} onPaste={onPasteFiles} multiline maxRows={4}
                placeholder={busy ? 'Đang tải file…' : `Nhập tin nhắn…${active.isGroup ? ' (gõ @ để nhắc)' : ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (mentionCandidates.length > 0) { e.preventDefault(); pickMention(mentionCandidates[0].u); return; }
                    e.preventDefault(); void send();
                  } else if (e.key === 'Escape') { setMentionQ(null); }
                }}
                sx={{ flex: 1, px: 1.5, py: 0.5, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 3, fontSize: 14 }} />
              <IconButton color="primary" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon /></IconButton>
            </Box>
          </Box>
          <Popover open={!!emojiAnchor} anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
            <EmojiPicker onPick={(e) => insertEmoji(e)} />
          </Popover>
        </>
      )}

      <Menu anchorEl={menuFor?.el} open={!!menuFor} onClose={() => { setMenuFor(null); setShowReactPicker(false); }}>
        {showReactPicker && (
          <EmojiPicker onPick={(e) => { if (menuFor) react(menuFor.m, e); setShowReactPicker(false); }} />
        )}
        {!showReactPicker && (
          <Stack direction="row" alignItems="center" sx={{ px: 1, py: 0.25 }}>
            {REACTIONS.map((e) => (
              <IconButton key={e} size="small" onClick={() => menuFor && react(menuFor.m, e)} sx={{ fontSize: 18, width: 34, height: 34 }}>{e}</IconButton>
            ))}
            <Tooltip title="Thêm emoji"><IconButton size="small" onClick={() => setShowReactPicker(true)} sx={{ width: 34, height: 34 }}><AddReactionOutlinedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          </Stack>
        )}
        {!showReactPicker && <MenuItem onClick={() => menuFor && startReply(menuFor.m)}><ReplyIcon fontSize="small" sx={{ mr: 1 }} />Trả lời</MenuItem>}
        {!showReactPicker && <MenuItem onClick={() => menuFor && togglePin(menuFor.m)}>{menuFor?.m.pinned ? <PushPinIcon fontSize="small" sx={{ mr: 1 }} /> : <PushPinOutlinedIcon fontSize="small" sx={{ mr: 1 }} />}{menuFor?.m.pinned ? 'Bỏ ghim' : 'Ghim'}</MenuItem>}
        {!showReactPicker && <MenuItem onClick={() => { if (menuFor) setForwardMsg(menuFor.m); setMenuFor(null); }}><ForwardOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Chuyển tiếp</MenuItem>}
        {!showReactPicker && <MenuItem onClick={() => menuFor && void saveMessage(menuFor.m)}><BookmarkAddOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Lưu</MenuItem>}
        {!showReactPicker && menuFor?.m.by === me?.u && !!menuFor?.m.text && (
          <MenuItem onClick={() => menuFor && startEdit(menuFor.m)}><EditIcon fontSize="small" sx={{ mr: 1 }} />Sửa</MenuItem>
        )}
        {!showReactPicker && menuFor?.m.by === me?.u && (
          <MenuItem onClick={() => menuFor && void doDelete(menuFor.m)} sx={{ color: '#dc3250' }}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Thu hồi</MenuItem>
        )}
      </Menu>

      {active && me && active.isGroup && (
        <GroupManageDialog open={manageOpen} onClose={() => setManageOpen(false)} chat={active} me={me} users={users}
          nameOf={nameOf} onSystem={sendSystem} onLeft={() => { setManageOpen(false); setActiveId(null); }} />
      )}
      <ForwardDialog open={!!forwardMsg} onClose={() => setForwardMsg(null)} chats={chats} titleOf={titleOf}
        onPick={(cid) => { if (forwardMsg) { void forwardTo(cid, forwardMsg); toast('Đã chuyển tiếp.', 'success'); } }} />

      <FilePreviewDialog open={!!preview} onClose={() => setPreview(null)} file={preview} />
    </Drawer>
  );
}
