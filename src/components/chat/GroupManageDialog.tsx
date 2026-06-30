import { useState } from 'react';
import {
  Avatar, Box, Button, Checkbox, Dialog, DialogContent, DialogTitle, Divider, IconButton,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { sbRenameChat, sbAddChatMembers, sbRemoveChatMember } from '@/lib/supabase';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { Chat, User } from '@/types';

/** Quản lý nhóm: đổi tên · thêm/xoá thành viên · rời nhóm. */
export function GroupManageDialog({
  open, onClose, chat, me, users, nameOf, onSystem, onLeft,
}: {
  open: boolean;
  onClose: () => void;
  chat: Chat;
  me: User;
  users: User[];
  nameOf: (u: string) => string;
  onSystem: (text: string) => void;       // đăng tin hệ thống ghi lại thay đổi
  onLeft: () => void;                      // điều hướng rời khỏi cuộc sau khi rời nhóm
}) {
  const [title, setTitle] = useState(chat.title ?? '');
  const [addSel, setAddSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const candidates = users.filter((u) => !chat.members.includes(u.u));

  const rename = async () => {
    const t = title.trim();
    if (!t || t === (chat.title ?? '')) return;
    setBusy(true);
    try { await sbRenameChat(chat.id, t); onSystem(`đổi tên nhóm thành "${t}"`); }
    catch (e) { toast('Đổi tên lỗi: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const addMembers = async () => {
    if (!addSel.length) return;
    setBusy(true);
    try {
      await sbAddChatMembers(chat.id, addSel);
      onSystem(`thêm ${addSel.map(nameOf).join(', ')} vào nhóm`);
      setAddSel([]);
    } catch (e) { toast('Thêm lỗi: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const removeMember = async (u: string) => {
    if (!window.confirm(`Xoá ${nameOf(u)} khỏi nhóm?`)) return;
    setBusy(true);
    try { await sbRemoveChatMember(chat.id, u); onSystem(`xoá ${nameOf(u)} khỏi nhóm`); }
    catch (e) { toast('Xoá lỗi: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const leave = async () => {
    if (!window.confirm('Rời khỏi nhóm này?')) return;
    setBusy(true);
    try { onSystem('đã rời nhóm'); await sbRemoveChatMember(chat.id, me.u); onClose(); onLeft(); }
    catch (e) { toast('Rời nhóm lỗi: ' + (e as Error).message, 'error'); setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>👥 Quản lý nhóm</Box>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" fontWeight={800} color="text.secondary">TÊN NHÓM</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 2 }}>
          <TextField size="small" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên nhóm" />
          <Button variant="outlined" disabled={busy || !title.trim() || title.trim() === (chat.title ?? '')} onClick={() => void rename()}>Lưu</Button>
        </Stack>

        <Typography variant="caption" fontWeight={800} color="text.secondary">THÀNH VIÊN ({chat.members.length})</Typography>
        <Stack sx={{ mt: 0.5, mb: 2 }}>
          {chat.members.map((u) => (
            <Stack key={u} direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.5 }}>
              <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: LEGACY.teal }}>{nameOf(u).slice(0, 1).toUpperCase()}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize={14} fontWeight={600} noWrap>{nameOf(u)}{u === me.u ? ' (bạn)' : ''}{nameOf(u) === chat.createdBy ? ' · người tạo' : ''}</Typography>
              </Box>
              {u !== me.u && (
                <Tooltip title="Xoá khỏi nhóm"><IconButton size="small" disabled={busy} onClick={() => void removeMember(u)} sx={{ color: '#dc3250' }}><PersonRemoveOutlinedIcon fontSize="small" /></IconButton></Tooltip>
              )}
            </Stack>
          ))}
        </Stack>

        {candidates.length > 0 && (
          <>
            <Typography variant="caption" fontWeight={800} color="text.secondary">THÊM THÀNH VIÊN</Typography>
            <Stack sx={{ mt: 0.5, mb: 1, maxHeight: 180, overflowY: 'auto' }}>
              {candidates.map((u) => (
                <Stack key={u.u} direction="row" alignItems="center" spacing={1} sx={{ py: 0.25, cursor: 'pointer' }}
                  onClick={() => setAddSel((s) => s.includes(u.u) ? s.filter((x) => x !== u.u) : [...s, u.u])}>
                  <Checkbox size="small" checked={addSel.includes(u.u)} />
                  <Typography fontSize={14}>{u.name}</Typography>
                </Stack>
              ))}
            </Stack>
            <Button variant="contained" fullWidth disabled={busy || !addSel.length} onClick={() => void addMembers()} sx={{ background: LEGACY.headerGradient, mb: 1 }}>
              Thêm {addSel.length || ''} người
            </Button>
          </>
        )}

        <Divider sx={{ my: 1 }} />
        <Button startIcon={<LogoutIcon />} color="error" disabled={busy} onClick={() => void leave()}>Rời nhóm</Button>
      </DialogContent>
    </Dialog>
  );
}
