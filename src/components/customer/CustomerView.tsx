import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { CustomerModal } from './CustomerModal';
import type { Customer } from '@/types';

type FilterType = '' | 'company' | 'individual';
type ModalState = { customer: Customer | null } | null;

export function CustomerView() {
  const customers = useCustomerStore((s) => s.customers);
  const loading = useCustomerStore((s) => s.loading);
  const syncing = useCustomerStore((s) => s.syncing);
  const save = useCustomerStore((s) => s.save);
  const del = useCustomerStore((s) => s.delete);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageCustomers');

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('');
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filterType && c.type !== filterType) return false;
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.note?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.taxCode?.toLowerCase().includes(q) ||
        (c.contacts ?? []).some(
          (ct) =>
            ct.name?.toLowerCase().includes(q) ||
            ct.phone?.includes(q) ||
            ct.email?.toLowerCase().includes(q) ||
            ct.position?.toLowerCase().includes(q),
        )
      );
    });
  }, [customers, search, filterType]);

  const handleSave = async (form: Customer) => {
    await save(form);
    setModal(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await del(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>👥 Danh sách Khách hàng</Typography>
          <Typography variant="caption" color="text.secondary">
            {loading
              ? 'Đang tải...'
              : `${customers.length} khách hàng · Đồng bộ real-time Cloud`}
            {syncing && (
              <Chip label="☁️ Đang đồng bộ..." size="small" sx={{ ml: 1 }} />
            )}
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<span>➕</span>}
            onClick={() => setModal({ customer: null })}
          >
            Thêm khách hàng
          </Button>
        )}
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Search & filter */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Tìm tên, contact, email, SĐT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Select
          size="small"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Tất cả</MenuItem>
          <MenuItem value="company">🏢 Công ty</MenuItem>
          <MenuItem value="individual">👤 Cá nhân</MenuItem>
        </Select>
        {(search || filterType) && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => { setSearch(''); setFilterType(''); }}
          >
            ✕ Xoá lọc
          </Button>
        )}
      </Stack>

      {/* Empty states */}
      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography variant="h2">👥</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mt: 1 }}>
            {customers.length === 0 ? 'Chưa có khách hàng nào' : 'Không tìm thấy kết quả'}
          </Typography>
          {customers.length === 0 && canEdit && (
            <Typography variant="caption">
              Bấm "Thêm khách hàng" để bắt đầu
            </Typography>
          )}
        </Box>
      )}

      {/* Card grid */}
      {!loading && filtered.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 2,
          }}
        >
          {filtered.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              canEdit={canEdit}
              onEdit={() => setModal({ customer: c })}
              onDelete={() => setDeleteTarget(c)}
              onClick={() => setModal({ customer: c })}
            />
          ))}
        </Box>
      )}

      {/* Modal */}
      {modal !== null && (
        <CustomerModal
          customer={modal.customer}
          canEdit={canEdit}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Xoá khách hàng?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Xoá <strong>{deleteTarget?.name}</strong>? Không thể hoàn tác.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Huỷ</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ────────── Inline card component ──────────

function CustomerCard({
  customer: c,
  canEdit,
  onEdit,
  onDelete,
  onClick,
}: {
  customer: Customer;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const isCompany = c.type === 'company';
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        cursor: 'pointer',
        transition: 'box-shadow .2s, border-color .2s',
        '&:hover': { boxShadow: 4, borderColor: 'primary.light' },
      }}
    >
      {/* Name row */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, mr: 1 }}>
          <Typography fontSize={20}>{isCompany ? '🏢' : '👤'}</Typography>
          <Typography fontWeight={800} variant="body1" sx={{ lineHeight: 1.3 }}>
            {c.name}
          </Typography>
        </Stack>
        {canEdit && (
          <Stack direction="row" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Sửa">
              <IconButton size="small" onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Xoá">
              <IconButton size="small" color="error" onClick={onDelete}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      {/* Type badge */}
      <Chip
        size="small"
        label={isCompany ? '🏢 Công ty' : '👤 Cá nhân'}
        color={isCompany ? 'primary' : 'success'}
        variant="outlined"
        sx={{ mb: 1.5, fontSize: 11 }}
      />

      {/* Address + tax code */}
      {(c.address || c.taxCode) && (
        <Stack sx={{ mb: 1 }} spacing={0.25}>
          {c.address && (
            <Typography variant="caption" color="text.secondary">📍 {c.address}</Typography>
          )}
          {c.taxCode && (
            <Typography variant="caption" color="text.secondary">🧾 MST: {c.taxCode}</Typography>
          )}
        </Stack>
      )}

      {/* Contacts preview */}
      {(c.contacts ?? [])
        .filter((ct) => ct.name || ct.phone || ct.email)
        .slice(0, 2)
        .map((ct, i) => (
          <Stack
            key={i}
            direction="row"
            flexWrap="wrap"
            spacing={1}
            useFlexGap
            alignItems="center"
            sx={{
              fontSize: 12,
              color: 'text.secondary',
              borderTop: i === 0 ? '1px dashed' : 'none',
              borderColor: 'divider',
              pt: i === 0 ? 1 : 0.5,
              mt: i === 0 ? 0.5 : 0,
            }}
          >
            {ct.name && (
              <Typography variant="caption" fontWeight={700}>
                {ct.name}{ct.position ? ` · ${ct.position}` : ''}
              </Typography>
            )}
            {ct.phone && (
              <Typography
                variant="caption"
                component="a"
                href={`tel:${ct.phone}`}
                onClick={(e) => e.stopPropagation()}
                sx={{ color: 'primary.main', textDecoration: 'none' }}
              >
                📞 {ct.phone}
              </Typography>
            )}
            {ct.email && (
              <Typography
                variant="caption"
                component="a"
                href={`mailto:${ct.email}`}
                onClick={(e) => e.stopPropagation()}
                sx={{ color: 'primary.main', textDecoration: 'none' }}
              >
                ✉️ {ct.email}
              </Typography>
            )}
          </Stack>
        ))}
      {(c.contacts ?? []).length > 2 && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          +{c.contacts.length - 2} contact khác...
        </Typography>
      )}

      {/* Note */}
      {c.note && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mt: 1,
            borderTop: '1px dashed',
            borderColor: 'divider',
            pt: 0.75,
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          📝 {c.note}
        </Typography>
      )}
    </Box>
  );
}
