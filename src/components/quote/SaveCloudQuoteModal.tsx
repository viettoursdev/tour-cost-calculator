import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import type { Collaborator, Customer, User } from '@/types';

type Props = { open: boolean; onClose: () => void };

export function SaveCloudQuoteModal({ open, onClose }: Props) {
  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser);
  const draftName = useQuoteStore((s) => s.draft.info.name);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const saveCloud = useQuoteStore((s) => s.saveCloud);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const customers = useCustomerStore((s) => s.customers);

  const existingEntry = useMemo(
    () => (currentQuoteId ? quotes.find((q) => q.cloudId === currentQuoteId) : undefined),
    [currentQuoteId, quotes],
  );

  // Pre-load existing customer if the cloud entry has one
  const existingCustomer = useMemo(() => {
    if (!existingEntry?.customerId) return null;
    return customers.find((c) => c.id === existingEntry.customerId) ?? null;
  }, [existingEntry, customers]);

  const [name, setName] = useState(draftName || '');
  const [collabUsers, setCollabUsers] = useState<User[]>(() => {
    if (!existingEntry) return [];
    const set = new Set((existingEntry.collaborators ?? []).map((c) => c.u));
    return users.filter((u) => set.has(u.u));
  });
  const [customer, setCustomer] = useState<Customer | null>(existingCustomer);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherUsers = useMemo(
    () => users.filter((u) => u.u !== currentUser?.u),
    [users, currentUser?.u],
  );

  const confirmSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const collaborators: Collaborator[] = collabUsers.map((u) => ({ u: u.u, name: u.name }));
      await saveCloud(name, collaborators, note, customer ?? undefined);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Lỗi không xác định');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {currentQuoteId ? 'Cập nhật báo giá lên cloud' : 'Lưu báo giá lên cloud'}
        <Typography variant="caption" display="block" color="text.secondary">
          Lưu trữ cloud · đồng bộ toàn bộ tài khoản
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Tên báo giá"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Đà Lạt 3N2Đ – 40pax"
            autoFocus
          />

          {/* Customer link */}
          <Autocomplete
            options={customers}
            value={customer}
            onChange={(_, v) => setCustomer(v)}
            getOptionLabel={(c) => c.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Khách hàng (optional)"
                placeholder="Chọn hoặc bỏ trống"
              />
            )}
            renderOption={(props, c) => (
              <li {...props} key={c.id}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                  {c.contacts?.[0]?.name && (
                    <Typography variant="caption" color="text.secondary">
                      {c.contacts[0].name}{c.contacts[0].phone ? ` · ${c.contacts[0].phone}` : ''}
                    </Typography>
                  )}
                </Stack>
              </li>
            )}
          />

          {/* Collaborators */}
          <Autocomplete
            multiple
            options={otherUsers}
            value={collabUsers}
            onChange={(_, v) => setCollabUsers(v)}
            getOptionLabel={(u) => `${u.name} (${u.role})`}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) =>
              value.map((u, idx) => {
                const { key, ...tagProps } = getTagProps({ index: idx });
                return <Chip key={key} {...tagProps} label={`${u.name} (${u.role})`} />;
              })
            }
            renderInput={(params) => (
              <TextField {...params} label="Cộng tác viên" placeholder="Chọn người được xem báo giá này" />
            )}
          />

          <TextField
            label="Ghi chú phiên bản (optional)"
            multiline
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: Đã cập nhật giá khách sạn 4*"
          />

          {existingEntry && (
            <Alert severity="info">
              Đây là bản cập nhật của <strong>{existingEntry.quoteCode}</strong>; sẽ tạo phiên bản mới.
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || busy}
          onClick={confirmSave}
        >
          {busy ? 'Đang lưu…' : (currentQuoteId ? 'Cập nhật' : 'Lưu mới')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
