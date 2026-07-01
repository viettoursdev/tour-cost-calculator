import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canManageArea } from '@/auth/departments';
import { visibleRecords, canShareRecord } from '@/auth/recordAccess';
import { CustomerModal } from './CustomerModal';
import { Customer360 } from './Customer360';
import { ImportListModal } from '@/components/common/ImportListModal';
import { ShareRecordDialog } from '@/components/common/ShareRecordDialog';
import { MergeDialog } from '@/components/common/MergeDialog';
import { customerToNcc } from '@/lib/contactConvert';
import { SORT_OPTIONS, sortList, type SortMode } from '@/lib/listSort';
import type { Customer } from '@/types';
import { filterRank, normalizeVN } from '@/lib/search';
import { toast } from '@/stores/toastStore';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { filterFieldSx, filterSelectSx } from '@/components/common/filterStyles';
import { iconValue } from '@/components/common/iconValue';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';

type FilterType = '' | 'company' | 'individual';
type ModalState = { customer: Customer | null } | null;

const todayStr = () => new Date().toISOString().slice(0, 10);
/** Khách có lịch hẹn liên hệ lại đến hạn (hôm nay hoặc đã quá). */
const followUpDue = (c: Customer) => !!c.nextFollowUp?.date && c.nextFollowUp.date <= todayStr();
const followUpOverdue = (c: Customer) => !!c.nextFollowUp?.date && c.nextFollowUp.date < todayStr();

export function CustomerView() {
  const customers = useCustomerStore((s) => s.customers);
  const loading = useCustomerStore((s) => s.loading);
  const syncing = useCustomerStore((s) => s.syncing);
  const save = useCustomerStore((s) => s.save);
  const del = useCustomerStore((s) => s.delete);
  const merge = useCustomerStore((s) => s.merge);
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageCustomers') && canManageArea(currentUser, 'customers');
  // Quyền xem theo nguyên tắc vận hành: người tạo + collab + Trưởng phòng (cùng
  // phòng) + Ban Giám Đốc/CEO (toàn bộ). Xem src/auth/recordAccess.ts.
  const visible = useMemo(() => visibleRecords(currentUser, customers, users), [customers, currentUser, users]);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [view360, setView360] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importMany = useCustomerStore((s) => s.importMany);
  // Chuyển sang NCC: cần quyền quản lý NCC để thêm vào danh sách đích.
  const nccSave = useNccStore((s) => s.save);
  const suppliers = useNccStore((s) => s.suppliers);
  const canConvert = canEdit && !!currentUser && hasPerm(currentUser, 'manageNCC');
  const [convertTarget, setConvertTarget] = useState<Customer | null>(null);
  const [shareTarget, setShareTarget] = useState<Customer | null>(null);
  const saveShare = (collabs: Customer['collaborators']) => {
    if (!shareTarget) return;
    void save({ ...shareTarget, collaborators: collabs });
    toast('✅ Đã cập nhật chia sẻ khách hàng.');
  };
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('vte_cust_compact') === '1'; } catch { return false; } });
  const toggleCompact = () => setCompact((v) => { const nv = !v; try { localStorage.setItem('vte_cust_compact', nv ? '1' : '0'); } catch { /* quota */ } return nv; });
  // Gộp khách trùng: bật chế độ chọn → tích ≥2 bản → Gộp.
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const selectedCustomers = useMemo(() => customers.filter((c) => selected.has(c.id)), [customers, selected]);
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelMode = () => { setSelMode(false); setSelected(new Set()); };
  const handleMerge = async (primaryId: string) => {
    const n = selected.size;
    await merge([...selected], primaryId);
    setMergeOpen(false);
    exitSelMode();
    toast(`✅ Đã gộp ${n} khách hàng thành 1.`);
  };

  const owners = useMemo(
    () => [...new Set(visible.map((c) => c.createdBy).filter(Boolean))].sort(),
    [visible],
  );
  const filtered = useMemo(() => {
    const base = visible.filter((c) => {
      if (filterType && c.type !== filterType) return false;
      if (owner && c.createdBy !== owner) return false;
      if (dueOnly && !followUpDue(c)) return false;
      if (!inDateRange(c.updatedAt ?? c.createdAt, dateRange, dateFrom, dateTo)) return false;
      return true;
    });
    const text = (c: Customer) => [
      c.name, c.note, c.address, c.taxCode, c.source, ...(c.tags ?? []),
      ...(c.contacts ?? []).map((ct) => `${ct.name ?? ''} ${ct.phone ?? ''} ${ct.email ?? ''} ${ct.position ?? ''}`),
    ].filter(Boolean).join(' ');
    // Khớp CHÍNH XÁC theo ký tự tên/contact (không fuzzy) — gõ một phần tên
    // công ty vẫn ra, nhưng các ký tự phải liền mạch, tránh kết quả lệch.
    return sortList(filterRank(base, search, text, { fuzzy: false }), sort);
  }, [visible, search, filterType, sort, owner, dueOnly, dateRange, dateFrom, dateTo]);

  const dueCount = useMemo(() => visible.filter(followUpDue).length, [visible]);

  const handleExport = async () => {
    if (!filtered.length) { toast('Không có khách hàng để xuất.', 'warning'); return; }
    setExporting(true);
    try {
      const m = await import('@/lib/exports/exportCustomersExcel');
      await m.exportCustomersExcel(filtered);
      toast(`✅ Đã xuất ${filtered.length} khách hàng ra Excel.`);
    } catch (e) {
      window.alert('❌ Lỗi xuất Excel: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async (form: Customer) => {
    const norm = normalizeVN(form.name);
    const dup = customers.find((c) => c.id !== form.id && normalizeVN(c.name) === norm);
    if (dup && !window.confirm(`⚠ Đã có khách hàng trùng tên "${dup.name}". Vẫn lưu?`)) return;
    const isNew = !form.id;
    const ok = await save(form);
    if (!ok) return;   // push lỗi → store đã rollback + báo lỗi; giữ modal để thử lại
    setModal(null);
    toast(isNew ? `✅ Đã lưu khách hàng mới "${form.name}".` : `✅ Đã cập nhật khách hàng "${form.name}".`);
  };

  // Xoá ngay + toast Hoàn tác (thay hộp thoại xác nhận).
  const handleDeleteNow = (c: Customer) => {
    void del(c);
    toast(`Đã xoá khách "${c.name}".`, 'info', { label: 'Hoàn tác', onClick: () => void save(c) });
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    const moved = convertTarget.name;
    await nccSave(customerToNcc(convertTarget));
    await del(convertTarget);
    setConvertTarget(null);
    toast(`✅ Đã chuyển "${moved}" sang danh sách Nhà cung cấp.`);
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
            <Button
              variant={selMode ? 'contained' : 'outlined'}
              color="secondary"
              startIcon={<MergeTypeIcon />}
              onClick={() => (selMode ? exitSelMode() : setSelMode(true))}
            >
              {selMode ? 'Thoát gộp' : 'Gộp trùng'}
            </Button>
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
          sx={{ flex: 1, minWidth: 220, maxWidth: 360, ...filterFieldSx }}
        />
        <Select
          size="small"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          sx={{ minWidth: 140, ...filterSelectSx }}
        >
          <MenuItem value="">Tất cả</MenuItem>
          <MenuItem value="company">🏢 Công ty</MenuItem>
          <MenuItem value="individual">👤 Cá nhân</MenuItem>
        </Select>
        <Select
          size="small"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          sx={{ minWidth: 180, ...filterSelectSx }}
          renderValue={(v) => iconValue(<SwapVertOutlinedIcon />, SORT_OPTIONS.find((o) => o.value === v)?.label ?? '')}
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
        <Tooltip title="Chỉ hiện khách có lịch hẹn liên hệ lại đến hạn (hôm nay hoặc đã quá)">
          <Button size="small" variant={dueOnly ? 'contained' : 'outlined'} color={dueOnly ? 'warning' : 'primary'}
            onClick={() => setDueOnly((v) => !v)}>
            ⏰ Đến hạn liên hệ{dueCount ? ` (${dueCount})` : ''}
          </Button>
        </Tooltip>
        <Button size="small" variant="outlined" disabled={exporting || filtered.length === 0} onClick={() => void handleExport()}>
          {exporting ? 'Đang xuất…' : '⬇️ Xuất Excel'}
        </Button>
        <Button size="small" variant={compact ? 'contained' : 'outlined'} onClick={toggleCompact}
          title={compact ? 'Hiện đầy đủ (kèm contact)' : 'Thu gọn (ẩn contact)'}>
          {compact ? '▦ Đầy đủ' : '▤ Thu gọn'}
        </Button>
        {(search || filterType || owner || dueOnly || dateRange !== 'all') && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => { setSearch(''); setFilterType(''); setOwner(''); setDueOnly(false); setDateRange('all'); }}
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

      {/* Thanh gộp trùng */}
      {selMode && (
        <Stack
          direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap
          sx={{ mb: 2, p: 1.25, borderRadius: 2, bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider' }}
        >
          <Typography variant="body2" fontWeight={700}>🔗 Đã chọn {selected.size} khách hàng</Typography>
          <Typography variant="caption" color="text.secondary">Tích chọn ≥2 bản trùng rồi bấm Gộp.</Typography>
          <Box sx={{ flex: 1 }} />
          {selected.size > 0 && <Button size="small" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>}
          <Button
            size="small" variant="contained" startIcon={<MergeTypeIcon />}
            disabled={selected.size < 2} onClick={() => setMergeOpen(true)}
          >
            Gộp ({selected.size})
          </Button>
        </Stack>
      )}

      {/* Card grid (Thu gọn = ẩn preview contact) */}
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
              compact={compact}
              selectable={selMode}
              selected={selected.has(c.id)}
              onToggleSelect={() => toggleSel(c.id)}
              onEdit={() => setModal({ customer: c })}
              onDelete={() => handleDeleteNow(c)}
              onConvert={() => setConvertTarget(c)}
              onShare={() => setShareTarget(c)}
              canShare={canShareRecord(currentUser, c, users)}
              onClick={() => setView360(c)}
            />
          ))}
        </Box>
      )}

      {view360 && <Customer360 customer={view360} onClose={() => setView360(null)} />}

      {mergeOpen && selectedCustomers.length >= 2 && (
        <MergeDialog
          open
          title="🔗 Gộp khách hàng trùng"
          kindLabel="khách hàng"
          items={selectedCustomers.map((c) => ({
            id: c.id,
            name: c.name,
            detail: `${(c.contacts ?? []).filter((ct) => ct.name || ct.phone || ct.email).length} liên hệ · ${(c.interactions ?? []).length} lần chăm sóc${c.taxCode ? ` · MST ${c.taxCode}` : ''}`,
            meta: `Tạo bởi ${c.createdBy || '—'}`,
          }))}
          onClose={() => setMergeOpen(false)}
          onConfirm={(pid) => void handleMerge(pid)}
        />
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

      <ShareRecordDialog
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="Chia sẻ khách hàng"
        subtitle={shareTarget?.name}
        ownerName={shareTarget?.createdBy}
        ownerU={shareTarget?.createdByU}
        collaborators={shareTarget?.collaborators ?? []}
        users={users}
        onSave={saveShare}
      />

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
  compact,
  selectable,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onConvert,
  onShare,
  canShare,
  onClick,
}: {
  customer: Customer;
  canEdit: boolean;
  canConvert: boolean;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onShare: () => void;
  canShare: boolean;
  onClick: () => void;
}) {
  const isCompany = c.type === 'company';
  return (
    <Box
      onClick={selectable ? onToggleSelect : onClick}
      sx={{
        bgcolor: selected ? 'action.selected' : 'background.paper',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
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
          {selectable && (
            <Checkbox size="small" checked={!!selected} tabIndex={-1} disableRipple sx={{ p: 0, pointerEvents: 'none' }} />
          )}
          <Typography fontSize={20}>{isCompany ? '🏢' : '👤'}</Typography>
          <Typography fontWeight={800} variant="body1" sx={{ lineHeight: 1.3 }}>
            {c.name}
          </Typography>
        </Stack>
        {canEdit && !selectable && (
          <Stack direction="row" onClick={(e) => e.stopPropagation()}>
            {canShare && (
              <Tooltip title="Chia sẻ cho người khác cùng xem">
                <IconButton size="small" color="primary" onClick={onShare}>
                  <PersonAddAlt1Icon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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

      {/* Type badge + nguồn + tags */}
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Chip size="small" label={isCompany ? '🏢 Công ty' : '👤 Cá nhân'} color={isCompany ? 'primary' : 'success'} variant="outlined" sx={{ fontSize: 11 }} />
        {c.nextFollowUp?.date && (
          <Chip size="small" color={followUpOverdue(c) ? 'error' : 'warning'} variant={followUpOverdue(c) ? 'filled' : 'outlined'}
            label={`📅 ${new Date(c.nextFollowUp.date).toLocaleDateString('vi-VN')}${followUpOverdue(c) ? ' · quá hạn' : ''}`}
            sx={{ fontSize: 11, fontWeight: 700 }} />
        )}
        {c.source && <Chip size="small" label={`📥 ${c.source}`} variant="outlined" sx={{ fontSize: 11, color: 'text.secondary' }} />}
        {!!c.collaborators?.length && <Chip size="small" label={`👥 Chia sẻ ${c.collaborators.length}`} variant="outlined" sx={{ fontSize: 11, color: 'primary.main' }} />}
        {(c.tags ?? []).map((t) => <Chip key={t} size="small" label={t} sx={{ fontSize: 11, bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a', fontWeight: 700 }} />)}
      </Stack>

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

      {/* Contacts preview (ẩn khi Thu gọn) */}
      {!compact && (c.contacts ?? [])
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
      {!compact && (c.contacts ?? []).length > 2 && (
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
