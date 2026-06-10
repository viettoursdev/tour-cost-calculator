import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, Chip, Dialog, Divider, IconButton,
  List, ListItemButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CampaignIcon from '@mui/icons-material/Campaign';
import SendIcon from '@mui/icons-material/Send';
import AddCommentIcon from '@mui/icons-material/AddComment';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import {
  fbSubscribeNotifThread, fbAddThreadComment, fbEnsureNotifThread, fbSendNotificationMany,
} from '@/lib/firebase';
import { LEGACY } from '@/theme';
import type { NotifComment, NotifLink, NotifThread, Notification, NotificationType, User } from '@/types';

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  announcement:     { label: 'Thông báo',     color: '#0d7a6a', icon: '📢' },
  task:             { label: 'Yêu cầu',       color: '#8e44ad', icon: '✅' },
  collab_comment:   { label: 'Cộng tác',      color: '#2980b9', icon: '💬' },
  collab_invite:    { label: 'Mời cộng tác',  color: '#2980b9', icon: '🤝' },
  payment_due:      { label: 'Thanh toán',    color: '#f39c12', icon: '💰' },
  payment_approval: { label: 'Duyệt chi',     color: '#14a08c', icon: '🧾' },
};
const meta = (t: string) => TYPE_META[t] ?? { label: 'Khác', color: '#95a5a6', icon: '🔔' };

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const currentUser = useAuthStore((s) => s.currentUser);
  const loadCloud = useQuoteStore((s) => s.loadCloud);

  const [selId, setSelId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const selected = useMemo(() => notifications.find((n) => n.id === selId) ?? null, [notifications, selId]);

  useEffect(() => {
    if (open && notifications.length && !selId) setSelId(notifications[0].id);
  }, [open, notifications, selId]);

  if (!currentUser) return null;

  const handleSelect = (n: Notification) => {
    setSelId(n.id);
    if (!n.read) void markRead(currentUser.u, n.id);
  };

  const openLink = async (link: NotifLink) => {
    if (link.kind === 'quote') {
      const r = await loadCloud(link.id);
      if (r.ok) onClose();
      else window.alert('⚠ ' + r.error);
    } else {
      window.alert(`Mở "${link.label}" từ mục tương ứng (${link.kind}).`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.25, background: LEGACY.headerGradient, color: '#fff' }}>
        <CampaignIcon sx={{ mr: 1 }} />
        <Typography variant="h6" fontWeight={800} sx={{ flex: 1 }}>Trung tâm thông báo</Typography>
        <Button startIcon={<SendIcon />} onClick={() => setComposing(true)} sx={{ color: '#fff', fontWeight: 700, border: '1px solid rgba(255,255,255,0.4)', mr: 1 }}>
          Soạn thông báo
        </Button>
        <Button onClick={() => void markAllRead(currentUser.u)} sx={{ color: '#fff', mr: 1 }}>Đọc hết</Button>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </Stack>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, height: 'calc(100vh - 56px)' }}>
        {/* List */}
        <Box sx={{ width: 360, borderRight: '1px solid rgba(15,58,74,0.1)', overflowY: 'auto', bgcolor: '#fafcfc' }}>
          {notifications.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
              <Typography variant="body2">Chưa có thông báo nào</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((n) => {
                const m = meta(n.type);
                const active = n.id === selId;
                return (
                  <ListItemButton
                    key={n.id} selected={active} onClick={() => handleSelect(n)}
                    sx={{ alignItems: 'flex-start', borderLeft: `3px solid ${active ? m.color : 'transparent'}`, py: 1.25 }}
                  >
                    <Box sx={{ fontSize: 20, mr: 1.25, mt: 0.25 }}>{m.icon}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        {!n.read && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#dc3250' }} />}
                        <Typography fontWeight={n.read ? 600 : 800} fontSize={13.5} noWrap sx={{ flex: 1 }}>
                          {n.title}
                        </Typography>
                      </Stack>
                      <Typography fontSize={12} color="text.secondary" noWrap>{n.message}</Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                        <Chip size="small" label={m.label} sx={{ height: 17, fontSize: 10, bgcolor: m.color + '22', color: m.color, fontWeight: 700 }} />
                        {n.link && <LinkIcon sx={{ fontSize: 13, color: 'rgba(15,58,74,0.4)' }} />}
                        {n.threadId && <AddCommentIcon sx={{ fontSize: 13, color: 'rgba(15,58,74,0.4)' }} />}
                        <Box sx={{ flex: 1 }} />
                        <Typography fontSize={10.5} color="text.disabled">{timeAgo(n.createdAt)}</Typography>
                      </Stack>
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>

        {/* Detail */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: 3 }}>
          {selected ? (
            <DetailPane notif={selected} user={currentUser} onOpenLink={openLink} />
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
              <Typography>Chọn một thông báo để xem chi tiết</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {composing && <ComposeDialog onClose={() => setComposing(false)} />}
    </Dialog>
  );
}

// ── Detail + shared comment thread ──

function DetailPane({ notif, user, onOpenLink }: { notif: Notification; user: User; onOpenLink: (l: NotifLink) => void }) {
  const [thread, setThread] = useState<NotifThread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const m = meta(notif.type);

  useEffect(() => {
    setThread(null);
    if (!notif.threadId) return;
    const unsub = fbSubscribeNotifThread(notif.threadId, setThread);
    return unsub;
  }, [notif.threadId]);

  const isMember = !!thread && thread.members.includes(user.u);

  const addComment = async () => {
    if (!notif.threadId || !text.trim()) return;
    setBusy(true);
    const c: NotifComment = { id: genId(), by: user.u, byName: user.name, text: text.trim(), at: new Date().toISOString() };
    try {
      await fbAddThreadComment(notif.threadId, c);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ fontSize: 24 }}>{m.icon}</Box>
        <Chip size="small" label={m.label} sx={{ bgcolor: m.color + '22', color: m.color, fontWeight: 700 }} />
        <Typography fontSize={12} color="text.secondary">· {new Date(notif.createdAt).toLocaleString('vi-VN')}</Typography>
      </Stack>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>{notif.title}</Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', color: 'rgba(15,58,74,0.85)', mb: 2 }}>{notif.message}</Typography>
      {notif.createdBy && (
        <Typography fontSize={12} color="text.secondary" sx={{ mb: 2 }}>Từ: {notif.createdBy}</Typography>
      )}

      {notif.link && (
        <Button variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => onOpenLink(notif.link!)} sx={{ mb: 3, color: LEGACY.teal, borderColor: 'rgba(20,150,140,0.4)' }}>
          {notif.link.kind === 'quote' ? 'Mở báo giá' : 'Mở'}: {notif.link.label}
        </Button>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Comment thread */}
      {!notif.threadId ? (
        <Typography fontSize={13} color="text.disabled">Thông báo này không có thảo luận.</Typography>
      ) : !thread ? (
        <Typography fontSize={13} color="text.disabled">Đang tải thảo luận…</Typography>
      ) : !isMember ? (
        <Alert severity="info">Chỉ thành viên nhóm cộng tác của dự án này mới xem được thảo luận.</Alert>
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Typography fontWeight={800} fontSize={14}>💬 Thảo luận</Typography>
            <Chip size="small" label={`${thread.comments.length} bình luận`} />
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" spacing={-0.5}>
              {thread.members.slice(0, 6).map((u) => (
                <Tooltip key={u} title={u}>
                  <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: LEGACY.tealLight, border: '2px solid #fff' }}>
                    {u.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
              ))}
            </Stack>
          </Stack>

          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {thread.comments.length === 0 && (
              <Typography fontSize={13} color="text.disabled">Chưa có bình luận. Hãy bắt đầu thảo luận.</Typography>
            )}
            {thread.comments.map((c) => (
              <Stack key={c.id} direction="row" spacing={1.25} alignItems="flex-start">
                <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: c.by === user.u ? LEGACY.teal : '#95a5a6' }}>
                  {c.byName.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, bgcolor: 'rgba(20,150,140,0.06)', borderRadius: 2, px: 1.5, py: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography fontWeight={700} fontSize={13}>{c.byName}</Typography>
                    <Typography fontSize={11} color="text.disabled">{timeAgo(c.at)}</Typography>
                  </Stack>
                  <Typography fontSize={13.5} sx={{ whiteSpace: 'pre-wrap' }}>{c.text}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              fullWidth size="small" multiline maxRows={4} placeholder="Viết bình luận…"
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void addComment(); }}
            />
            <Button variant="contained" onClick={() => void addComment()} disabled={busy || !text.trim()} sx={{ background: LEGACY.headerGradient }}>
              Gửi
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}

// ── Compose a new notification ──

function ComposeDialog({ onClose }: { onClose: () => void }) {
  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const draft = useQuoteStore((s) => s.draft);
  const quotes = useQuoteHistoryStore((s) => s.quotes);

  const currentQuote = useMemo(
    () => quotes.find((q) => q.cloudId === draft.currentQuoteId) ?? null,
    [quotes, draft.currentQuoteId],
  );
  const collabUsers = useMemo(() => {
    if (!currentQuote) return [];
    const set = new Set((currentQuote.collaborators ?? []).map((c) => c.u));
    return users.filter((u) => set.has(u.u));
  }, [currentQuote, users]);

  const [recipients, setRecipients] = useState<User[]>(collabUsers);
  const [type, setType] = useState<NotificationType>('announcement');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachQuote, setAttachQuote] = useState(!!currentQuote);
  const [busy, setBusy] = useState(false);

  const otherUsers = users.filter((u) => u.u !== currentUser.u);

  const send = async () => {
    if (!title.trim()) { window.alert('Nhập tiêu đề'); return; }
    if (recipients.length === 0) { window.alert('Chọn ít nhất 1 người nhận'); return; }
    setBusy(true);
    try {
      const link: NotifLink | undefined = attachQuote && currentQuote
        ? { kind: 'quote', id: currentQuote.cloudId, label: currentQuote.name }
        : undefined;
      const members = Array.from(new Set([currentUser.u, ...recipients.map((u) => u.u)]));
      const threadId = link ? `q_${link.id}` : `t_${genId()}`;
      await fbEnsureNotifThread({
        id: threadId, title: title.trim(), members, link,
        comments: [], createdAt: new Date().toISOString(), createdBy: currentUser.name,
      });
      await fbSendNotificationMany(members, {
        type, title: title.trim(), message: message.trim(), createdBy: currentUser.name,
        ...(link ? { link } : {}), threadId,
      });
      onClose();
    } catch (e) {
      window.alert('❌ Lỗi gửi: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <Box sx={{ px: 3, py: 2, background: LEGACY.headerGradient, color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>📢 Soạn thông báo</Typography>
      </Box>
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Autocomplete
            multiple size="small" options={otherUsers} value={recipients}
            onChange={(_, v) => setRecipients(v)}
            getOptionLabel={(u) => `${u.name} (${u.role})`}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderInput={(params) => <TextField {...params} label="Người nhận / nhóm cộng tác" placeholder="Chọn người…" />}
          />
          <TextField select size="small" label="Loại" value={type} onChange={(e) => setType(e.target.value as NotificationType)}>
            <MenuItem value="announcement">📢 Thông báo</MenuItem>
            <MenuItem value="task">✅ Yêu cầu / nhiệm vụ</MenuItem>
            <MenuItem value="collab_comment">💬 Mời cộng tác / thảo luận</MenuItem>
          </TextField>
          <TextField size="small" label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField size="small" label="Nội dung" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={3} />
          {currentQuote && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                icon={<LinkIcon />} label={`Đính kèm: ${currentQuote.name}`}
                color={attachQuote ? 'primary' : 'default'} variant={attachQuote ? 'filled' : 'outlined'}
                onClick={() => setAttachQuote((v) => !v)} clickable
              />
              <Typography fontSize={11} color="text.secondary">Báo giá đang mở</Typography>
            </Stack>
          )}
        </Stack>
        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 3 }}>
          <Button onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => void send()} disabled={busy} sx={{ background: LEGACY.headerGradient }}>
            {busy ? 'Đang gửi…' : 'Gửi thông báo'}
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}
