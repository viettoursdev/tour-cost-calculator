import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useNccStore } from '@/stores/nccStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewAll } from '@/auth/ROLES';
import { NCCModal } from './NCCModal';
import { ImportListModal } from '@/components/common/ImportListModal';
import { nccToCustomer } from '@/lib/contactConvert';
import { SORT_OPTIONS, sortList, type SortMode } from '@/lib/listSort';
import { NCC_SECTORS, SECTOR_COLOR } from './constants';
import type { Ncc } from '@/types';
import { filterRank, normalizeVN } from '@/lib/search';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';

type ModalState = { ncc: Ncc | null } | null;

export function NCCView() {
  const suppliers = useNccStore((s) => s.suppliers);
  const loading = useNccStore((s) => s.loading);
  const syncing = useNccStore((s) => s.syncing);
  const save = useNccStore((s) => s.save);
  const del = useNccStore((s) => s.delete);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageNCC');
  // Operations trở lên xem toàn bộ; dưới ngưỡng chỉ thấy NCC do mình tạo.
  const viewAll = !!currentUser && canViewAll(currentUser.role, 'ncc');

  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ncc | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importMany = useNccStore((s) => s.importMany);
  // Chuyển sang Khách hàng: cần quyền quản lý Khách hàng để thêm vào danh sách đích.
  const custSave = useCustomerStore((s) => s.save);
  const customers = useCustomerStore((s) => s.customers);
  const canConvert = canEdit && !!currentUser && hasPerm(currentUser, 'manageCustomers');
  const [convertTarget, setConvertTarget] = useState<Ncc | null>(null);

  const owners = useMemo(
    () => [...new Set(suppliers.map((s) => s.createdBy).filter(Boolean))].sort(),
    [suppliers],
  );
  const filtered = useMemo(() => {
    const base = suppliers.filter((s) => {
      if (!viewAll && s.createdBy !== currentUser?.name) return false;
      if (filterSector && !s.sectors.includes(filterSector)) return false;
      if (owner && s.createdBy !== owner) return false;
      if (!inDateRange(s.updatedAt ?? s.createdAt, dateRange, dateFrom, dateTo)) return false;
      return true;
    });
    const text = (s: Ncc) => [
      s.name, s.location, s.note, (s.sectors ?? []).join(' '),
      ...(s.contacts ?? []).map((ct) => `${ct.name ?? ''} ${ct.phone ?? ''} ${ct.email ?? ''} ${ct.position ?? ''}`),
    ].filter(Boolean).join(' ');
    return sortList(filterRank(base, search, text), sort);
  }, [suppliers, search, filterSector, viewAll, currentUser?.name, sort, owner, dateRange, dateFrom, dateTo]);

  const handleSave = async (form: Ncc) => {
    const norm = normalizeVN(form.name);
    const dup = suppliers.find((s) => s.id !== form.id && normalizeVN(s.name) === norm);
    if (dup && !window.confirm(`⚠ Đã có nhà cung cấp trùng tên "${dup.name}". Vẫn lưu?`)) return;
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
    await custSave(nccToCustomer(convertTarget));
    await del(convertTarget.id);
    setConvertTarget(null);
    window.alert(`✅ Đã chuyển "${moved}" sang danh sách Khách hàng.`);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>🏢 Danh sách NCC</Typography>
          <Typography variant="caption" color="text.secondary">
            {loading
              ? 'Đang tải...'
              : `${suppliers.length} nhà cung cấp · Đồng bộ real-time Cloud`}
            {syncing && <Chip label="☁️ Đang đồng bộ..." size="small" sx={{ ml: 1 }} />}
          </Typography>
        </Box>
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => setImportOpen(true)}>📥 Nhập danh sách</Button>
            <Button variant="contained" onClick={() => setModal({ ncc: null })}>➕ Thêm NCC</Button>
          </Stack>
        )}
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Search & sector filter */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Tìm tên, địa điểm, contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Select
          size="small"
          value={filterSector}
          onChange={(e) => setFilterSector(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Tất cả lĩnh vực</MenuItem>
          {NCC_SECTORS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
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
        {(search || filterSector || owner || dateRange !== 'all') && (
          <Button size="small" color="error" variant="outlined"
            onClick={() => { setSearch(''); setFilterSector(''); setOwner(''); setDateRange('all'); }}>
            ✕ Xoá lọc
          </Button>
        )}
      </Stack>

      {/* Empty states */}
      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography variant="h2">🏢</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mt: 1 }}>
            {suppliers.length === 0 ? 'Chưa có NCC nào' : 'Không tìm thấy kết quả'}
          </Typography>
          {suppliers.length === 0 && canEdit && (
            <Typography variant="caption">Bấm "Thêm NCC" để bắt đầu</Typography>
          )}
        </Box>
      )}

      {/* Card grid */}
      {!loading && filtered.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
          {filtered.map((s) => (
            <NccCard
              key={s.id}
              ncc={s}
              canEdit={canEdit}
              canConvert={canConvert}
              onEdit={() => setModal({ ncc: s })}
              onDelete={() => setDeleteTarget(s)}
              onConvert={() => setConvertTarget(s)}
              onClick={() => setModal({ ncc: s })}
            />
          ))}
        </Box>
      )}

      {/* Modal */}
      {modal !== null && (
        <NCCModal
          ncc={modal.ncc}
          canEdit={canEdit}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <ImportListModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="📥 Nhập danh sách Nhà cung cấp"
        note={`Lĩnh vực gợi ý: ${NCC_SECTORS.join(', ')}.`}
        columns={[
          { key: 'name', label: 'Tên NCC / Công ty / Khách hàng', aliases: ['ten', 'ten ncc', 'ten cong ty', 'name', 'supplier', 'nha cung cap', 'company', 'cong ty', 'khach hang'] },
          { key: 'sector', label: 'Lĩnh vực', aliases: ['linh vuc', 'sector', 'nganh', 'loai'] },
          { key: 'location', label: 'Khu vực', aliases: ['khu vuc', 'location', 'dia diem', 'city'] },
          { key: 'contact', label: 'Người liên hệ', aliases: ['nguoi lien he', 'lien he', 'contact', 'ho ten'] },
          { key: 'phone', label: 'Điện thoại', aliases: ['dien thoai', 'phone', 'sdt', 'tel', 'mobile'] },
          { key: 'email', label: 'Email', aliases: ['e-mail', 'mail'] },
          { key: 'position', label: 'Chức vụ', aliases: ['chuc vu', 'position', 'title'] },
          { key: 'note', label: 'Ghi chú', aliases: ['ghi chu', 'note', 'notes'] },
        ]}
        onImport={(rows) => importMany(rows.map((r): Ncc => ({
          id: '', name: r.name,
          sectors: r.sector ? r.sector.split(/[;,/]/).map((s) => s.trim()).filter(Boolean) : [],
          location: r.location || '',
          contacts: [{ name: r.contact || '', phone: r.phone || '', email: r.email || '', position: r.position || '' }],
          note: r.note || '', createdAt: '', createdBy: '',
        })))}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Xoá NCC?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Xoá <strong>{deleteTarget?.name}</strong>? Không thể hoàn tác.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Huỷ</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Xoá</Button>
        </DialogActions>
      </Dialog>

      {/* Convert → Customer confirm */}
      <Dialog open={!!convertTarget} onClose={() => setConvertTarget(null)}>
        <DialogTitle>Chuyển sang Khách hàng?</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            Chuyển <strong>{convertTarget?.name}</strong> từ <strong>Nhà cung cấp</strong> sang
            danh sách <strong>Khách hàng</strong> (giữ contacts &amp; ghi chú). Mục này sẽ bị{' '}
            <strong>xoá khỏi Nhà cung cấp</strong>.
            {convertTarget &&
              customers.some(
                (c) => c.name.trim().toLowerCase() === convertTarget.name.trim().toLowerCase(),
              ) && (
                <Box sx={{ mt: 1, fontWeight: 700 }}>
                  ⚠️ Đã có Khách hàng trùng tên — thao tác sẽ tạo thêm một bản mới.
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

// ── Inline card ──

function NccCard({
  ncc: s,
  canEdit,
  canConvert,
  onEdit,
  onDelete,
  onConvert,
  onClick,
}: {
  ncc: Ncc;
  canEdit: boolean;
  canConvert: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onClick: () => void;
}) {
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
        <Typography fontWeight={800} variant="body1" sx={{ flex: 1, mr: 1, lineHeight: 1.3 }}>
          🏢 {s.name}
        </Typography>
        {canEdit && (
          <Stack direction="row" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Sửa">
              <IconButton size="small" onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {canConvert && (
              <Tooltip title="Chuyển sang Khách hàng">
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

      {/* Sectors */}
      <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
        {(s.sectors ?? []).slice(0, 3).map((sec) => (
          <Chip
            key={sec}
            label={sec}
            size="small"
            sx={{
              fontSize: 10,
              bgcolor: `${SECTOR_COLOR[sec] ?? '#7f8c8d'}20`,
              color: SECTOR_COLOR[sec] ?? '#7f8c8d',
              border: `1px solid ${SECTOR_COLOR[sec] ?? '#7f8c8d'}60`,
            }}
          />
        ))}
        {(s.sectors ?? []).length > 3 && (
          <Typography variant="caption" color="text.disabled">
            +{s.sectors.length - 3} khác
          </Typography>
        )}
      </Stack>

      {/* Location */}
      {s.location && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          📍 {s.location}
        </Typography>
      )}

      {/* Contacts preview */}
      {(s.contacts ?? [])
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
      {(s.contacts ?? []).length > 2 && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          +{s.contacts.length - 2} contact khác...
        </Typography>
      )}

      {/* Note */}
      {s.note && (
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
          📝 {s.note}
        </Typography>
      )}
    </Box>
  );
}
