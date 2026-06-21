import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, Chip, Dialog, Divider, IconButton,
  LinearProgress, List, ListItemButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CampaignIcon from '@mui/icons-material/Campaign';
import SendIcon from '@mui/icons-material/Send';
import AddCommentIcon from '@mui/icons-material/AddComment';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { userLabel } from '@/auth/ROLES';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import {
  fbSubscribeNotifThread, fbAddThreadComment, fbEnsureNotifThread, fbSendNotificationMany,
} from '@/lib/dataBackend';
import { LEGACY } from '@/theme';
import type { FileAttachment, NotifComment, NotifLink, NotifThread, Notification, NotificationType, User } from '@/types';
import { NOTIF_TEMPLATES } from './notifCompose';
import { REMINDER_OPTIONS } from '@/lib/notifReminders';
import { NOTIF_PRIORITY } from '@/types';

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  announcement:     { label: 'Thông báo',     color: '#0d7a6a', icon: '📢' },
  task:             { label: 'Yêu cầu',       color: '#8e44ad', icon: '✅' },
  collab_comment:   { label: 'Cộng tác',      color: '#2980b9', icon: '💬' },
  collab_invite:    { label: 'Mời cộng tác',  color: '#2980b9', icon: '🤝' },
  payment_due:      { label: 'Thanh toán',    color: '#f39c12', icon: '💰' },
  payment_approval: { label: 'Duyệt chi',     color: '#14a08c', icon: '🧾' },
};
const meta = (t: string) => TYPE_META[t] ?? { label: 'Khác', color: '#95a5a6', icon: '🔔' };

/** Live status badge for shared activity threads (requests/approvals). */
const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:        { label: '⏳ Chờ duyệt',        color: '#f39c12' },
  pending_stage2: { label: '⏳ Chờ duyệt bước 2',  color: '#e67e22' },
  approved:       { label: '✅ Đã duyệt',          color: '#27ae60' },
  rejected:       { label: '❌ Từ chối',           color: '#dc3250' },
  paid:           { label: '💸 Đã thanh toán',     color: '#16a085' },
};

const LINK_LABEL: Record<string, string> = {
  quote: 'Mở báo giá', dmc: 'Mở DMC', payment: 'Mở phiếu thanh toán',
  contract: 'Mở hợp đồng', itinerary: 'Mở chương trình', menu: 'Mở thực đơn', collab: 'Mở',
};

type FilterKey = 'all' | 'mine' | 'unread' | NotificationType;

/** "Việc của tôi": items in my feed that are awaiting my action. */
const needsMyAction = (n: Notification): boolean =>
  (n.type === 'payment_approval'
    && (n.data as { approvalStage?: number } | undefined)?.approvalStage != null)
  || n.type === 'task';

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'mine', label: '🎯 Việc của tôi' },
  { key: 'unread', label: '● Chưa đọc' },
  { key: 'payment_approval', label: '🧾 Duyệt chi' },
  { key: 'announcement', label: '📢 Thông báo' },
  { key: 'collab_comment', label: '💬 Cộng tác' },
  { key: 'task', label: '✅ Yêu cầu' },
];

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
  const setView = useQuoteStore((s) => s.setView);

  const [selId, setSelId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const mineCount = useMemo(() => notifications.filter(needsMyAction).length, [notifications]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (filter === 'mine' && !needsMyAction(n)) return false;
      if (filter === 'unread' && n.read) return false;
      if (filter !== 'all' && filter !== 'mine' && filter !== 'unread' && n.type !== filter) return false;
      if (q && !`${n.title} ${n.message} ${n.createdBy}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, filter, search]);

  const searchOptions = useMemo(
    () => Array.from(new Set(notifications.map((n) => n.title).filter(Boolean))),
    [notifications],
  );

  const selected = useMemo(() => notifications.find((n) => n.id === selId) ?? null, [notifications, selId]);

  useEffect(() => {
    // Keep a valid selection within the filtered list.
    if (!open || filtered.length === 0) return;
    if (!selId || !filtered.some((n) => n.id === selId)) setSelId(filtered[0].id);
  }, [open, filtered, selId]);

  if (!currentUser) return null;

  const handleSelect = (n: Notification) => {
    setSelId(n.id);
    if (!n.read) void markRead(currentUser.u, n.id);
  };

  const openLink = async (link: NotifLink) => {
    switch (link.kind) {
      case 'quote':
      case 'dmc': {
        const r = await loadCloud(link.id, { dmc: link.kind === 'dmc' });
        if (r.ok) { setView('cost'); onClose(); } else window.alert('⚠ ' + r.error);
        break;
      }
      case 'payment': {
        // link.id = quote cloudId → load it, then jump to the Payment tab.
        const r = await loadCloud(link.id, { dmc: false });
        if (r.ok) { setView('payment'); onClose(); } else window.alert('⚠ ' + r.error);
        break;
      }
      case 'contract': {
        setView('contract');
        onClose();
        break;
      }
      default:
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
        {/* List + filters */}
        <Box sx={{ width: '38%', minWidth: 340, maxWidth: 600, borderRight: '1px solid rgba(15,58,74,0.1)', bgcolor: '#fafcfc', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ p: 1, borderBottom: '1px solid rgba(15,58,74,0.08)' }}>
            <Autocomplete
              freeSolo
              size="small"
              options={searchOptions}
              inputValue={search}
              onInputChange={(_, v) => setSearch(v)}
              clearOnEscape
              sx={{ mb: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="🔍 Tìm thông báo…"
                  sx={{ '& .MuiInputBase-input': { fontSize: 13.5 } }}
                />
              )}
            />
            <TextField
              select size="small" fullWidth
              label="Bộ lọc"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
              sx={{ '& .MuiInputBase-input': { fontSize: 13.5, fontWeight: 700 } }}
            >
              {FILTER_CHIPS.map((f) => {
                const count = f.key === 'mine' ? mineCount : f.key === 'unread' ? unreadCount : 0;
                return (
                  <MenuItem key={f.key} value={f.key} sx={{ fontWeight: 600 }}>
                    {count ? `${f.label} (${count})` : f.label}
                  </MenuItem>
                );
              })}
            </TextField>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
              <Typography variant="body2">{notifications.length === 0 ? 'Chưa có thông báo nào' : 'Không có thông báo khớp bộ lọc'}</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {filtered.map((n) => {
                const m = meta(n.type);
                const active = n.id === selId;
                return (
                  <ListItemButton
                    key={n.id} selected={active} onClick={() => handleSelect(n)}
                    sx={{ alignItems: 'flex-start', borderLeft: `3px solid ${active ? m.color : 'transparent'}`, py: 1.25 }}
                  >
                    <Box sx={{ fontSize: 23, mr: 1.25, mt: 0.25 }}>{m.icon}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        {!n.read && <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#dc3250' }} />}
                        {(n.priority === 'high' || n.priority === 'urgent') && (
                          <Chip size="small" label={NOTIF_PRIORITY[n.priority].label}
                            sx={{ height: 17, fontSize: 9.5, fontWeight: 800, bgcolor: NOTIF_PRIORITY[n.priority].color, color: '#fff' }} />
                        )}
                        <Typography fontWeight={n.read ? 600 : 800} fontSize={15.5} noWrap sx={{ flex: 1 }}>
                          {n.title}
                        </Typography>
                      </Stack>
                      <Typography fontSize={13.5} color="text.secondary" noWrap sx={{ mt: 0.25 }}>{n.message}</Typography>
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
    if (!notif.threadId || !text.trim() || !thread) return;
    setBusy(true);
    const body = text.trim();
    const c: NotifComment = { id: genId(), by: user.u, byName: user.name, text: body, at: new Date().toISOString() };
    try {
      await fbAddThreadComment(notif.threadId, c);
      // Notify only the collaboration group (other thread members).
      const others = thread.members.filter((u) => u !== user.u);
      if (others.length) {
        await fbSendNotificationMany(others, {
          type: 'collab_comment',
          title: `💬 Bình luận mới: ${thread.title}`,
          message: `${user.name}: ${body.slice(0, 140)}`,
          createdBy: user.name,
          ...(thread.link ? { link: thread.link } : {}),
          threadId: notif.threadId,
        });
      }
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ fontSize: 24 }}>{m.icon}</Box>
        <Chip size="small" label={m.label} sx={{ bgcolor: m.color + '22', color: m.color, fontWeight: 700 }} />
        {thread?.status && STATUS_META[thread.status] && (
          <Chip
            size="small"
            label={STATUS_META[thread.status].label}
            sx={{ bgcolor: STATUS_META[thread.status].color + '22', color: STATUS_META[thread.status].color, fontWeight: 800 }}
          />
        )}
        <Typography fontSize={12} color="text.secondary">· {new Date(notif.createdAt).toLocaleString('vi-VN')}</Typography>
        {thread?.updatedAt && thread.updatedByName && (
          <Typography fontSize={11} color="text.disabled">· cập nhật bởi {thread.updatedByName} {timeAgo(thread.updatedAt)}</Typography>
        )}
      </Stack>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>{notif.title}</Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', color: 'rgba(15,58,74,0.85)', mb: 2 }}>{notif.message}</Typography>
      {notif.createdBy && (
        <Typography fontSize={12} color="text.secondary" sx={{ mb: 2 }}>Từ: {notif.createdBy}</Typography>
      )}

      {(notif.attachments?.length ?? 0) > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {notif.attachments!.map((a) => (
            <Chip key={a.key} size="small" icon={<AttachFileIcon />} label={a.name} onClick={() => openFilePreview({ key: a.key, name: a.name })} />
          ))}
        </Stack>
      )}

      {notif.link && (
        <Button variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => onOpenLink(notif.link!)} sx={{ mb: 3, color: LEGACY.teal, borderColor: 'rgba(20,150,140,0.4)' }}>
          {LINK_LABEL[notif.link.kind] ?? 'Mở'}: {notif.link.label}
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
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [attachQuote, setAttachQuote] = useState(!!currentQuote);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [remindEvery, setRemindEvery] = useState<'off' | '4h' | '8h' | '12h' | 'daily'>('off');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { window.alert('File vượt quá 20MB.'); return; }
    setUploading(true); setUploadPct(0);
    try {
      const up = await uploadFileToWorker(f, setUploadPct);
      setAttachments((p) => [...p, { key: up.key, name: up.name, uploadedBy: currentUser.name, uploadedAt: new Date().toISOString() }]);
    } catch (e2) { window.alert('Tải file lỗi: ' + (e2 as Error).message); }
    finally { setUploading(false); setUploadPct(0); }
  };

  const otherUsers = users.filter((u) => u.u !== currentUser.u);
  // Nhóm chọn nhanh người nhận theo vai trò (chỉ các vai trò có người).
  const rolesPresent = useMemo(() => Array.from(new Set(otherUsers.map((u) => u.role))).sort(), [otherUsers]);
  const addRecipients = (list: User[]) => setRecipients((prev) => {
    const seen = new Set(prev.map((u) => u.u));
    return [...prev, ...list.filter((u) => !seen.has(u.u))];
  });
  const applyTemplate = (key: string) => {
    const t = NOTIF_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setType(t.type); setTitle(t.title); setMessage(t.message);
  };

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
      // Best-effort: thread powers the discussion, but don't block the
      // notification itself if notification_threads is locked down.
      try {
        await fbEnsureNotifThread({
          id: threadId, title: title.trim(), members, link,
          comments: [], createdAt: new Date().toISOString(), createdBy: currentUser.name,
        });
      } catch (err) {
        console.warn('Tạo thread thảo luận thất bại (rules?):', (err as Error).message);
      }
      await fbSendNotificationMany(members, {
        type, title: title.trim(), message: message.trim(), createdBy: currentUser.name,
        ...(link ? { link } : {}), threadId, ...(priority !== 'normal' ? { priority } : {}),
        ...(attachments.length ? { attachments } : {}),
        ...(remindEvery !== 'off' ? { reminder: { every: remindEvery, ...(deadline ? { deadline } : {}) } } : {}),
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
          <TextField select size="small" label="Mẫu tin (tuỳ chọn)" value="" onChange={(e) => applyTemplate(e.target.value)}>
            <MenuItem value=""><em>— Soạn mới —</em></MenuItem>
            {NOTIF_TEMPLATES.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple size="small" options={otherUsers} value={recipients}
            onChange={(_, v) => setRecipients(v)}
            getOptionLabel={(u) => userLabel(u, currentUser)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderInput={(params) => <TextField {...params} label="Người nhận / nhóm cộng tác" placeholder="Chọn người…" />}
          />
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: -1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>Chọn nhanh:</Typography>
            <Chip size="small" label="Toàn công ty" onClick={() => addRecipients(otherUsers)} variant="outlined" />
            {collabUsers.length > 0 && <Chip size="small" label={`Nhóm cộng tác (${collabUsers.length})`} onClick={() => addRecipients(collabUsers)} variant="outlined" color="primary" />}
            {rolesPresent.map((r) => (
              <Chip key={r} size="small" label={r} variant="outlined" onClick={() => addRecipients(otherUsers.filter((u) => u.role === r))} />
            ))}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Loại" value={type} onChange={(e) => setType(e.target.value as NotificationType)} sx={{ flex: 1 }}>
              <MenuItem value="announcement">📢 Thông báo</MenuItem>
              <MenuItem value="task">✅ Yêu cầu / nhiệm vụ</MenuItem>
              <MenuItem value="collab_comment">💬 Mời cộng tác / thảo luận</MenuItem>
            </TextField>
            <TextField select size="small" label="Ưu tiên" value={priority} onChange={(e) => setPriority(e.target.value as 'normal' | 'high' | 'urgent')} sx={{ width: 150 }}>
              <MenuItem value="normal">Thường</MenuItem>
              <MenuItem value="high">🟠 Quan trọng</MenuItem>
              <MenuItem value="urgent">🔴 KHẨN</MenuItem>
            </TextField>
          </Stack>
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

          {/* Nhắc lại lặp lại tới hạn chót */}
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Nhắc lại" value={remindEvery} onChange={(e) => setRemindEvery(e.target.value as typeof remindEvery)} sx={{ flex: 1 }}>
              {REMINDER_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            {remindEvery !== 'off' && (
              <TextField type="date" size="small" label="Hạn chót" InputLabelProps={{ shrink: true }} value={deadline} onChange={(e) => setDeadline(e.target.value)} sx={{ width: 170 }} />
            )}
          </Stack>
          {remindEvery !== 'off' && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              ⏰ Sẽ nhắc lại {REMINDER_OPTIONS.find((o) => o.value === remindEvery)?.label.toLowerCase()} {deadline ? `tới ${deadline}` : '(tối đa 3 ngày)'} — khi người nhận mở app.
            </Typography>
          )}

          {/* Đính kèm file */}
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon />} disabled={uploading}>
                Đính kèm file<input type="file" hidden onChange={onPickFile} />
              </Button>
              {uploading && <Typography variant="caption" color="text.secondary">Đang tải… {uploadPct}%</Typography>}
            </Stack>
            {uploading && <LinearProgress variant={uploadPct > 0 && uploadPct < 100 ? 'determinate' : 'indeterminate'} value={uploadPct} sx={{ mt: 0.5, borderRadius: 2 }} />}
            <Stack spacing={0.5} sx={{ mt: attachments.length ? 0.75 : 0 }}>
              {attachments.map((a, i) => (
                <Stack key={a.key} direction="row" alignItems="center" spacing={1}>
                  <Chip size="small" icon={<AttachFileIcon />} label={a.name} onClick={() => openFilePreview({ key: a.key, name: a.name })} sx={{ maxWidth: 280 }} />
                  <Button size="small" color="error" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} sx={{ minWidth: 0, fontSize: 11 }}>Gỡ</Button>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Xem trước */}
          <Box>
            <Button size="small" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Ẩn xem trước' : '👁 Xem trước tin'}</Button>
            {showPreview && (
              <Box sx={{ mt: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f7faf9' }}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                  {priority !== 'normal' && <Chip size="small" label={NOTIF_PRIORITY[priority].label} sx={{ height: 18, fontSize: 9.5, fontWeight: 800, bgcolor: NOTIF_PRIORITY[priority].color, color: '#fff' }} />}
                  <Typography fontWeight={800} fontSize={14}>{title || '(chưa có tiêu đề)'}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{message || '(chưa có nội dung)'}</Typography>
                {(attachQuote && currentQuote) && <Chip size="small" icon={<LinkIcon />} label={currentQuote.name} sx={{ mt: 1, mr: 0.5 }} />}
                {attachments.map((a) => <Chip key={a.key} size="small" icon={<AttachFileIcon />} label={a.name} sx={{ mt: 1, mr: 0.5 }} />)}
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>Gửi tới {recipients.length} người</Typography>
              </Box>
            )}
          </Box>
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
