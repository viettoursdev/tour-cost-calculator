import {
  Avatar, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  ListItemButton, ListItemText, Stack, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import type { VisaProcDoc } from '@/types';

type Props = {
  doc: VisaProcDoc;
  onClose: () => void;
  onChange: (collabs: string[]) => void;
};

export function VisaProcCollabModal({ doc, onClose, onChange }: Props) {
  const users = useAuthStore((s) => s.users);
  const collabs = doc.collaborators ?? [];

  const toggle = (uname: string) => {
    const next = collabs.includes(uname)
      ? collabs.filter((x) => x !== uname)
      : [...collabs, uname];
    onChange(next);
  };

  const others = users.filter((u) => u.u !== doc.createdByUsername);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        👥 Mời cộng tác
        <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          Người được mời sẽ thấy &amp; chỉnh sửa hồ sơ này.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {others.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
            Chưa tải được danh sách user.
          </Box>
        )}
        <Stack spacing={0.5}>
          {others.map((u) => {
            const on = collabs.includes(u.u);
            return (
              <ListItemButton key={u.u} onClick={() => toggle(u.u)}
                sx={{ borderRadius: 1.5, bgcolor: on ? 'rgba(20,150,140,0.08)' : 'transparent' }}>
                <Checkbox checked={on} sx={{ p: 0.5, mr: 1 }} color="success" />
                <Avatar sx={{ bgcolor: u.color || '#14a08c', width: 32, height: 32, mr: 1 }}>
                  {u.name[0]}
                </Avatar>
                <ListItemText primary={u.name} secondary={`@${u.u} · ${u.role}`} />
              </ListItemButton>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" fullWidth
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Xong
        </Button>
      </DialogActions>
    </Dialog>
  );
}
