import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, Typography,
} from '@mui/material';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import type { Collaborator, User } from '@/types';

/** Hộp thoại chia sẻ một bản ghi (KH/NCC) cho người khác cùng xem — quản lý danh
 *  sách collaborator (username + tên). Dùng chung cho CustomerView & NCCView. */
export function ShareRecordDialog({
  open, onClose, title, subtitle, ownerName, ownerU, collaborators, users, onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  ownerName?: string;
  ownerU?: string;
  collaborators: Collaborator[];
  users: User[];
  onSave: (collabs: Collaborator[]) => void;
}) {
  const [list, setList] = useState<Collaborator[]>(collaborators);
  const [pick, setPick] = useState<User | null>(null);
  useEffect(() => { setList(collaborators); setPick(null); }, [collaborators, open]);

  // Loại người tạo + người đã được chia sẻ khỏi danh sách chọn.
  const options = users.filter((u) => u.u !== ownerU && !list.some((c) => c.u === u.u));

  const add = (u: User | null) => {
    if (!u) return;
    setList((prev) => (prev.some((c) => c.u === u.u) ? prev : [...prev, { u: u.u, name: u.name }]));
    setPick(null);
  };
  const remove = (u: string) => setList((prev) => prev.filter((c) => c.u !== u));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center"><PersonAddAlt1Icon fontSize="small" /> {title}</Stack>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </DialogTitle>
      <DialogContent>
        {ownerName && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Người tạo: <strong>{ownerName}</strong> (luôn xem được)
          </Typography>
        )}
        <Autocomplete
          size="small"
          options={options}
          value={pick}
          onChange={(_, v) => add(v)}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.u === b.u}
          renderInput={(p) => <TextField {...p} autoFocus label="Thêm người cùng xem" placeholder="Chọn nhân viên…" />}
          sx={{ mt: 0.5 }}
        />
        <Box sx={{ mt: 1.5 }}>
          {list.length === 0 ? (
            <Typography variant="caption" color="text.secondary">Chưa chia sẻ với ai.</Typography>
          ) : (
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {list.map((c) => (
                <Chip key={c.u} size="small" label={c.name || c.u} onDelete={() => remove(c.u)} />
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => { onSave(list); onClose(); }}>Lưu chia sẻ</Button>
      </DialogActions>
    </Dialog>
  );
}
