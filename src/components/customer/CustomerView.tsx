import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewAll } from '@/auth/ROLES';
import { CustomerModal } from './CustomerModal';
import { Customer360 } from './Customer360';
import { ImportListModal } from '@/components/common/ImportListModal';
import { customerToNcc } from '@/lib/contactConvert';
import { SORT_OPTIONS, sortList, type SortMode } from '@/lib/listSort';
import type { Customer } from '@/types';
import { filterRank, normalizeVN } from '@/lib/search';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';

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
  // Sales trở lên xem toàn bộ; dưới ngưỡng chỉ thấy khách hàng do mình tạo.
  const viewAll = !!currentUser && canViewAll(currentUser.role, 'customers');

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [view360, setView360] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importMany = useCustomerStore((s) => s.importMany);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  // Chuyển sang NCC: cần quyền quản lý NCC để thêm vào danh sách đích.
  const nccSave = useNccStore((s) => s.save);
  const suppliers = useNccStore((s) => s.suppliers);
  const canConvert = canEdit && !!currentUser && hasPerm(currentUser, 'manageNCC');
  const [convertTarget, setConvertTarget] = useState<Customer | null>(null);

  const owners = useMemo(
    () => [...new Set(customers.map((c) => c.createdBy).filter(Boolean))].sort(),
    [customers],
  );
  const filtered = useMemo(() => {
    const base = customers.filter((c) => {
      if (!viewAll && c.createdBy !== currentUser?.name) return false;
      if (filterType && c.type !== filterType) return false;
      if (owner && c.createdBy !== owner) return false;
      if (!inDateRange(c.updatedAt ?? c.createdAt, dateRange, dateFrom, dateTo)) return false;
      return true;
    });
    const text = (c: Customer) => [
      c.name, c.note, c.address, c.taxCode,
      ...(c.contacts ?? []).map((ct) => `${ct.name ?? ''} ${ct.phone ?? ''} ${ct.email ?? ''} ${ct.position ?? ''}`),
    ].filter(Boolean).join(' ');
    return sortList(filterRank(base, search, text), sort);
  }, [customers, search, filterType, viewAll, currentUser?.name, sort, owner, dateRange, dateFrom, dateTo]);

  const handleSave = async (form: Customer) => {
    const norm = normalizeVN(form.name);
    const dup = customers.find((c) => c.id !== form.id && normalizeVN(c.name) === norm);
    if (dup && !window.confirm(`⚠ Đã có khách hàng trùng tên "${dup.name}". Vẫn lưu?`)) return;
    await save(form);
    setModal(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await del(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    const moved = convertTarget.name;
    await nccSave(customerToNcc(convertTarget));
    await del(convertTarget.id);
    setConvertTarget(null);
    window.alert(`✅ Đã chuyển "${moved}" sang danh sách Nhà cung cấp.`);
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
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<span>📥</span>} onClick={() => setImportOpen(true)}>
              Nhập danh sách
            </Button>
            <Button
              variant="contained"
              startIcon={<span>➕</span>}
              onClick={() => setModal({ customer: null })}
            >
              Thêm khách hàng
            </Button>
          </Stack>
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
        <Select
          size="small"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          sx={{ minWidth: 180 }}
        >
          {SORT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
        <ListFilterBar
          dateRange={dateRange} onDateRange={setDateRange}
          from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo}
          owners={owners} owner={owner} onOwner={setOwner}
        />
        {(search || filterType || owner || dateRange !== 'all') && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => { setSearch(''); setFilterType(''); setOwner(''); setDateRange('all'); }}
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
              canConvert={canConvert}
              onEdit={() => setModal({ customer: c })}
              onDelete={() => setDeleteTarget(c)}
              onConvert={() => setConvertTarget(c)}
              onClick={() => setView360(c)}
            />
          ))}
        </Box>
      )}

      {view360 && <Customer360 customer={view360} onClose={() => setView360(null)} />}

      {/* Modal */}
      {modal !== null && (
        <CustomerModal
          customer={modal.customer}
          canEdit={canEdit}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <ImportListModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="📥 Nhập danh sách khách hàng"
        note="Loại mặc định là Công ty."
        columns={[
          { key: 'name', label: 'Tên NCC / Công ty / Khách hàng', aliases: ['ten', 'ten khach hang', 'ten cong ty', 'ten ncc', 'company', 'cong ty', 'customer', 'khach hang', 'name'] },
          { key: 'taxCode', label: 'Mã số thuế', aliases: ['mst', 'tax', 'taxcode'] },
          { key: 'address', label: 'Địa chỉ', aliases: ['dia chi', 'address'] },
          { key: 'contact', label: 'Người liên hệ', aliases: ['nguoi lien he', 'lien he', 'contact', 'ho ten'] },
          { key: 'phone', label: 'Điện thoại', aliases: ['dien thoai', 'phone', 'sdt', 'tel', 'mobile'] },
          { key: 'email', label: 'Email', aliases: ['e-mail', 'mail'] },
          { key: 'position', label: 'Chức vụ', aliases: ['chuc vu', 'position', 'title'] },
          { key: 'note', label: 'Ghi chú', aliases: ['ghi chu', 'note', 'notes'] },
        ]}
        onImport={(rows) => importMany(rows.map((r): Customer => ({
          id: '', name: r.name, type: 'company',
          address: r.address || '', taxCode: r.taxCode || '',
          contacts: [{ name: r.contact || '', phone: r.phone || '', email: r.email || '', position: r.position || '' }],
          note: r.note || '', createdAt: '', createdBy: '',
        })))}
      />

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

      {/* Convert → NCC confirm dialog */}
      <Dialog open={!!convertTarget} onClose={() => setConvertTarget(null)}>
        <DialogTitle>Chuyển sang Nhà cung cấp?</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            Chuyển <strong>{convertTarget?.name}</strong> từ <strong>Khách hàng</strong> sang
            danh sách <strong>Nhà cung cấp</strong> (giữ contacts &amp; ghi chú). Mục này sẽ bị{' '}
            <strong>xoá khỏi Khách hàng</strong>.
            {convertTarget &&
              suppliers.some(
                (s) => s.name.trim().toLowerCase() === convertTarget.name.trim().toLowerCase(),
              ) && (
                <Box sx={{ mt: 1, fontWeight: 700 }}>
                  ⚠️ Đã có NCC trùng tên — thao tác sẽ tạo thêm một bản mới.
                </Box>
              )}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConvertTarget(null)}>Huỷ</Button>
          <Button variant="contained" onClick={handleConvert} startIcon={<SwapHorizIcon />}>
            Chuyển
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
  canConvert,
  onEdit,
  onDelete,
  onConvert,
  onClick,
}: {
  customer: Customer;
  canEdit: boolean;
  canConvert: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
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
            {canConvert && (
              <Tooltip title="Chuyển sang NCC">
                <IconButton size="small" color="primary" onClick={onConvert}>
                  <SwapHorizIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
