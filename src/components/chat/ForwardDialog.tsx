import { useState } from 'react';
import {
  Avatar, Box, Dialog, DialogContent, DialogTitle, IconButton, InputBase, List, ListItemButton, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { LEGACY } from '@/theme';
import type { Chat } from '@/types';

/** Chọn cuộc trò chuyện để CHUYỂN TIẾP một tin nhắn tới. */
export function ForwardDialog({
  open, onClose, chats, titleOf, onPick,
}: {
  open: boolean;
  onClose: () => void;
  chats: Chat[];
  titleOf: (c: Chat) => string;
  onPick: (chatId: string) => void;
}) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const list = ql ? chats.filter((c) => titleOf(c).toLowerCase().includes(ql)) : chats;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>↗ Chuyển tiếp tới…</Box>
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          <InputBase fullWidth autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện…" sx={{ fontSize: 14 }} />
        </Box>
        {list.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.disabled' }}>Không có cuộc phù hợp.</Box>
        ) : (
          <List disablePadding sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {list.map((c) => (
              <ListItemButton key={c.id} onClick={() => { onPick(c.id); onClose(); }}>
                <Avatar sx={{ width: 32, height: 32, mr: 1.5, fontSize: 14, bgcolor: c.isGroup ? '#7c3aed' : LEGACY.teal }}>
                  {c.isGroup ? '👥' : titleOf(c).slice(0, 1).toUpperCase()}
                </Avatar>
                <Typography fontSize={14} fontWeight={600} noWrap>{titleOf(c)}</Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
