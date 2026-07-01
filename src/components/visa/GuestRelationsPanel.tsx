import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Select, Stack, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { GuestRelationType, Passenger } from '@/types';
import { MINOR_AGE, RELATION_LABEL, RELATION_TYPES, minorGuardianStatus } from './guestRelations';

/**
 * Quan hệ của một khách với các khách khác trong đoàn + cảnh báo trẻ <14 tuổi
 * (tính theo ngày khởi hành) phải đi cùng cha/mẹ hoặc có giấy uỷ quyền.
 */
export function GuestRelationsPanel({ guest, all, departureDate, onAdd, onRemove, onSetAuth }: {
  guest: Passenger;
  all: Passenger[];
  departureDate?: string | null;
  onAdd: (toId: string, type: GuestRelationType) => void;
  onRemove: (toId: string) => void;
  onSetAuth: (v: boolean) => void;
}) {
  const others = useMemo(() => all.filter((g) => g.id !== guest.id), [all, guest.id]);
  const nameOf = (id: string) => all.find((g) => g.id === id)?.name || '(khách chưa đặt tên)';
  const [toId, setToId] = useState('');
  const [type, setType] = useState<GuestRelationType>('parent');

  const status = minorGuardianStatus(
    { id: guest.id, dob: guest.dob, relations: guest.relations, guardianAuthReady: guest.guardianAuthReady },
    all.map((g) => ({ id: g.id, dob: g.dob, relations: g.relations })),
    departureDate,
  );

  const add = () => { if (toId) { onAdd(toId, type); setToId(''); } };

  return (
    <Box>
      <Typography variant="caption" fontWeight={800} color="text.secondary"
        sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Quan hệ trong đoàn
      </Typography>

      {status.isMinor && (
        status.withParent ? (
          <Alert severity="success" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            👶 Bé {status.age} tuổi (theo ngày khởi hành) — đi cùng cha/mẹ trong đoàn.
          </Alert>
        ) : (
          <Alert severity="error" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
              👶 Bé {status.age} tuổi (dưới {MINOR_AGE}, theo ngày khởi hành) — chưa có cha/mẹ trong đoàn.
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              Bé phải đi cùng cha/mẹ; nếu đi cùng người thân khác, cần <strong>GIẤY UỶ QUYỀN cho người thân đưa trẻ đi du lịch</strong>.
            </Typography>
            <FormControlLabel sx={{ mt: 0.25 }}
              control={<Checkbox size="small" checked={!!guest.guardianAuthReady} onChange={(e) => onSetAuth(e.target.checked)} />}
              label={<Typography variant="caption" fontWeight={700}>Đã chuẩn bị giấy uỷ quyền</Typography>}
            />
          </Alert>
        )
      )}
      {status.isMinor && !status.withParent && guest.guardianAuthReady && (
        <Alert severity="warning" sx={{ mb: 1, py: 0, '& .MuiAlert-message': { py: 0.5 } }}>
          👶 Bé {status.age} tuổi — đã có giấy uỷ quyền cho người thân đưa đi.
        </Alert>
      )}

      {(guest.relations?.length ?? 0) > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          {guest.relations!.map((r) => (
            <Chip key={r.toId} size="small" variant="outlined"
              label={`${RELATION_LABEL[r.type]}: ${nameOf(r.toId)}`}
              onDelete={() => onRemove(r.toId)} deleteIcon={<DeleteOutlineIcon />} />
          ))}
        </Stack>
      )}

      {others.length === 0 ? (
        <Typography variant="caption" color="text.disabled">Cần ≥2 khách trong đoàn để khai báo quan hệ.</Typography>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Select size="small" value={type} onChange={(e) => setType(e.target.value as GuestRelationType)} sx={{ minWidth: 130 }}>
            {RELATION_TYPES.map((rt) => <MenuItem key={rt.key} value={rt.key}>{rt.label}</MenuItem>)}
          </Select>
          <Typography variant="caption" color="text.secondary">là</Typography>
          <Select size="small" displayEmpty value={toId} onChange={(e) => setToId(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="" disabled>— chọn khách —</MenuItem>
            {others.map((g) => <MenuItem key={g.id} value={g.id}>{g.name || '(chưa đặt tên)'}</MenuItem>)}
          </Select>
          <Button size="small" startIcon={<AddIcon />} disabled={!toId} onClick={add} sx={{ color: '#0d7a6a' }}>Thêm</Button>
        </Stack>
      )}
    </Box>
  );
}
