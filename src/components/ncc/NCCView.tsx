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
import { useNccStore } from '@/stores/nccStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canManageArea } from '@/auth/departments';
import { visibleRecords, canShareRecord } from '@/auth/recordAccess';
import { NCCModal } from './NCCModal';
import { ImportListModal } from '@/components/common/ImportListModal';
import { ShareRecordDialog } from '@/components/common/ShareRecordDialog';
import { MergeDialog } from '@/components/common/MergeDialog';
import { nccToCustomer } from '@/lib/contactConvert';
import { SORT_OPTIONS, sortList, type SortMode } from '@/lib/listSort';
import { NCC_SECTORS, SECTOR_COLOR, NCC_CONTINENTS, NCC_COUNTRIES, NCC_ALL_COUNTRIES } from './constants';
import type { Ncc } from '@/types';
import { filterRank, normalizeVN } from '@/lib/search';
import { toast } from '@/stores/toastStore';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { filterFieldSx, filterSelectSx } from '@/components/common/filterStyles';
import { iconValue } from '@/components/common/iconValue';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';

type ModalState = { ncc: Ncc | null } | null;

/**
 * Gộp `source` vào `target`, giữ `target` làm bản chính. Các trường gộp được
 * (lĩnh vực, tour, liên hệ, ghi chú, đánh giá, file) được hợp nhất; trường vô hướng
 * (địa chỉ, website, MST, ngân hàng…) chỉ điền khi bản chính còn trống → không
 * ghi đè dữ liệu sẵn có. Dùng chung cho gộp trùng & gộp khi lưu trùng tên.
 */
function mergeNccInto(target: Ncc, source: Ncc): Ncc {
  const contacts = [...target.contacts];
  (source.contacts ?? []).forEach((c) => {
    if (!contacts.some((tc) => tc.name === c.name && tc.phone === c.phone)) contacts.push(c);
  });
  const files = [...(target.files ?? [])];
  (source.files ?? []).forEach((f) => {
    if (!files.some((tf) => tf.key === f.key)) files.push(f);
  });
  return {
    ...target,
    sectors: [...new Set([...(target.sectors ?? []), ...(source.sectors ?? [])])],
    tours: [...new Set([...(target.tours ?? []), ...(source.tours ?? [])])],
    contacts,
    files,
    note: [target.note, source.note].filter((x) => x && x.trim()).join('\n'),
    ratings: [...(target.ratings ?? []), ...(source.ratings ?? [])],
    location: target.location || source.location,
    address: target.address || source.address,
    website: target.website || source.website,
    taxCode: target.taxCode || source.taxCode,
    country: target.country || source.country,
    continent: target.continent || source.continent,
    paymentTerms: target.paymentTerms || source.paymentTerms,
    commission: target.commission || source.commission,
    creditLimit: target.creditLimit || source.creditLimit,
    status: target.status || source.status,
    bank: { ...(source.bank ?? {}), ...(target.bank ?? {}) },
  };
}

export function NCCView() {
  const suppliers = useNccStore((s) => s.suppliers);
  const loading = useNccStore((s) => s.loading);
  const syncing = useNccStore((s) => s.syncing);
  const save = useNccStore((s) => s.save);
  const del = useNccStore((s) => s.delete);
  const merge = useNccStore((s) => s.merge);
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageNCC') && canManageArea(currentUser, 'ncc');
  // Quyền xem theo nguyên tắc vận hành: người tạo + collab + Trưởng phòng (cùng
  // phòng) + Ban Giám Đốc/CEO (toàn bộ). Xem src/auth/recordAccess.ts.
  const visible = useMemo(() => visibleRecords(currentUser, suppliers, users), [suppliers, currentUser, users]);

  const [search, setSearch] = useState('');
  const [tourSearch, setTourSearch] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterContinent, setFilterContinent] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  // Khi lưu mà phát hiện trùng tên: hỏi 3 lựa chọn (gộp / tạo mới / huỷ).
  const [dupPrompt, setDupPrompt] = useState<{ form: Ncc; dup: Ncc } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importMany = useNccStore((s) => s.importMany);
  // Chuyển sang Khách hàng: cần quyền quản lý Khách hàng để thêm vào danh sách đích.
  const custSave = useCustomerStore((s) => s.save);
  const customers = useCustomerStore((s) => s.customers);
  const canConvert = canEdit && !!currentUser && hasPerm(currentUser, 'manageCustomers');
  const [convertTarget, setConvertTarget] = useState<Ncc | null>(null);
  const [shareTarget, setShareTarget] = useState<Ncc | null>(null);
  const saveShare = (collabs: Ncc['collaborators']) => {
    if (!shareTarget) return;
    void save({ ...shareTarget, collaborators: collabs });
    toast('✅ Đã cập nhật chia sẻ nhà cung cấp.');
  };
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('vte_ncc_compact') === '1'; } catch { return false; } });
  const toggleCompact = () => setCompact((v) => { const nv = !v; try { localStorage.setItem('vte_ncc_compact', nv ? '1' : '0'); } catch { /* quota */ } return nv; });
  // Gộp NCC trùng: bật chế độ chọn → tích ≥2 bản → Gộp.
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const selectedNccs = useMemo(() => suppliers.filter((s) => selected.has(s.id)), [suppliers, selected]);
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelMode = () => { setSelMode(false); setSelected(new Set()); };
  const handleMultiMerge = async (primaryId: string) => {
    const n = selected.size;
    await merge([...selected], primaryId);
    setMergeOpen(false);
    exitSelMode();
    toast(`✅ Đã gộp ${n} nhà cung cấp thành 1.`);
  };

  const owners = useMemo(
    () => [...new Set(visible.map((s) => s.createdBy).filter(Boolean))].sort(),
    [visible],
  );
  const filtered = useMemo(() => {
    const tq = normalizeVN(tourSearch.trim());
    const base = visible.filter((s) => {
      if (filterSector && !s.sectors.includes(filterSector)) return false;
      if (filterContinent && s.continent !== filterContinent) return false;
      if (filterCountry && s.country !== filterCountry) return false;
      if (owner && s.createdBy !== owner) return false;
      if (tq && !(s.tours ?? []).some((t) => normalizeVN(t).includes(tq))) return false;
      if (!inDateRange(s.updatedAt ?? s.createdAt, dateRange, dateFrom, dateTo)) return false;
      return true;
    });
    // Tìm CHỈ theo tên NCC + tên người liên hệ (không quét note/lĩnh vực/SĐT… cho gọn).
    const text = (s: Ncc) => [
      s.name,
      ...(s.contacts ?? []).map((ct) => ct.name ?? ''),
    ].filter(Boolean).join(' ');
    return sortList(filterRank(base, search, text), sort);
  }, [visible, search, tourSearch, filterSector, filterContinent, filterCountry, sort, owner, dateRange, dateFrom, dateTo]);

  const handleSave = async (form: Ncc) => {
    const norm = normalizeVN(form.name);
    const dup = suppliers.find((s) => s.id !== form.id && normalizeVN(s.name) === norm);
    // Trùng tên → hỏi: gộp vào bản đã có / vẫn tạo NCC mới / huỷ.
    if (dup) {
      setDupPrompt({ form, dup });
      return;
    }
    await save(form);
    setModal(null);
  };

  // Người dùng chọn "Vẫn tạo NCC mới" trong hộp thoại trùng tên.
  const handleDupCreate = async () => {
    if (!dupPrompt) return;
    await save(dupPrompt.form);
    setDupPrompt(null);
    setModal(null);
  };

  // Người dùng chọn "Gộp vào bản đã có": dồn thông tin vừa nhập vào NCC trùng tên.
  // Nếu đang sửa một bản đã lưu (form.id != dup.id) thì xoá bản đó sau khi gộp.
  const handleDupMerge = async () => {
    if (!dupPrompt) return;
    const { form, dup } = dupPrompt;
    await save(mergeNccInto(dup, form));
    if (form.id && form.id !== dup.id) await del(form.id);
    setDupPrompt(null);
    setModal(null);
    toast(`✅ Đã gộp thông tin vào "${dup.name}".`);
  };

  const handleDeleteNow = (s: Ncc) => {
    void del(s.id);
    toast(`Đã xoá NCC "${s.name}".`, 'info', { label: 'Hoàn tác', onClick: () => void save(s) });
  };

  // Gộp NCC `source` vào `targetId`: dồn dữ liệu về target rồi xoá source.
  const handleMerge = async (source: Ncc, targetId: string) => {
    const target = suppliers.find((s) => s.id === targetId);
    if (!target || target.id === source.id) return;
    await save(mergeNccInto(target, source));
    await del(source.id);
    setModal(null);
    toast(`✅ Đã gộp "${source.name}" vào "${target.name}".`);
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    const moved = convertTarget.name;
    await custSave(nccToCustomer(convertTarget));
    await del(convertTarget.id);
    setConvertTarget(null);
    toast(`✅ Đã chuyển "${moved}" sang danh sách Khách hàng.`);
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
            <Button
              variant={selMode ? 'contained' : 'outlined'}
              color="secondary"
              startIcon={<MergeTypeIcon />}
              onClick={() => (selMode ? exitSelMode() : setSelMode(true))}
            >
              {selMode ? 'Thoát gộp' : 'Gộp trùng'}
            </Button>
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
          label="Tìm theo tên NCC / tên người liên hệ"
          placeholder="VD: Champa Island, anh Tuấn…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1, minWidth: 240, maxWidth: 320, ...filterFieldSx }}
        />
        <TextField
          size="small"
          label="Tìm theo tour"
          placeholder="Tên tour NCC từng phục vụ…"
          value={tourSearch}
          onChange={(e) => setTourSearch(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 200, ...filterFieldSx }}
        />
        <Select
          size="small"
          value={filterSector}
          onChange={(e) => setFilterSector(e.target.value)}
          sx={{ minWidth: 160, ...filterSelectSx }}
        >
          <MenuItem value="">Tất cả lĩnh vực</MenuItem>
          {NCC_SECTORS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </Select>
        <Select size="small" value={filterContinent}
          onChange={(e) => { setFilterContinent(e.target.value); setFilterCountry(''); }}
          sx={{ minWidth: 150, ...filterSelectSx }}>
          <MenuItem value="">Tất cả châu lục</MenuItem>
          {NCC_CONTINENTS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </Select>
        <Select size="small" value={filterCountry} displayEmpty
          onChange={(e) => setFilterCountry(e.target.value)}
          sx={{ minWidth: 150, ...filterSelectSx }}>
          <MenuItem value="">Tất cả quốc gia</MenuItem>
          {(filterContinent ? (NCC_COUNTRIES[filterContinent] ?? []) : NCC_ALL_COUNTRIES).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
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
        <Button size="small" variant={compact ? 'contained' : 'outlined'} onClick={toggleCompact}
          title={compact ? 'Hiện đầy đủ (kèm contact)' : 'Thu gọn (ẩn contact)'}>
          {compact ? '▦ Đầy đủ' : '▤ Thu gọn'}
        </Button>
        {(search || filterSector || filterContinent || filterCountry || owner || dateRange !== 'all') && (
          <Button size="small" color="error" variant="outlined"
            onClick={() => { setSearch(''); setFilterSector(''); setFilterContinent(''); setFilterCountry(''); setOwner(''); setDateRange('all'); }}>
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

      {/* Thanh gộp trùng */}
      {selMode && (
        <Stack
          direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap
          sx={{ mb: 2, p: 1.25, borderRadius: 2, bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider' }}
        >
          <Typography variant="body2" fontWeight={700}>🔗 Đã chọn {selected.size} nhà cung cấp</Typography>
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
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
          {filtered.map((s) => (
            <NccCard
              key={s.id}
              ncc={s}
              canEdit={canEdit}
              canConvert={canConvert}
              compact={compact}
              selectable={selMode}
              selected={selected.has(s.id)}
              onToggleSelect={() => toggleSel(s.id)}
              onEdit={() => setModal({ ncc: s })}
              onDelete={() => handleDeleteNow(s)}
              onConvert={() => setConvertTarget(s)}
              onShare={() => setShareTarget(s)}
              canShare={canShareRecord(currentUser, s, users)}
              onClick={() => setModal({ ncc: s })}
            />
          ))}
        </Box>
      )}

      {mergeOpen && selectedNccs.length >= 2 && (
        <MergeDialog
          open
          title="🔗 Gộp nhà cung cấp trùng"
          kindLabel="nhà cung cấp"
          items={selectedNccs.map((s) => ({
            id: s.id,
            name: s.name,
            detail: `${(s.contacts ?? []).filter((ct) => ct.name || ct.phone || ct.email).length} liên hệ · ${(s.sectors ?? []).length} lĩnh vực${s.location ? ` · ${s.location}` : ''}`,
            meta: `Tạo bởi ${s.createdBy || '—'}`,
          }))}
          onClose={() => setMergeOpen(false)}
          onConfirm={(pid) => void handleMultiMerge(pid)}
        />
      )}

      {/* Modal */}
      {modal !== null && (
        <NCCModal
          ncc={modal.ncc}
          canEdit={canEdit}
          onSave={handleSave}
          onClose={() => setModal(null)}
          allNccs={suppliers}
          onMerge={(source, targetId) => void handleMerge(source, targetId)}
        />
      )}

      <ShareRecordDialog
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="Chia sẻ nhà cung cấp"
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

      {/* Trùng tên khi lưu → 3 lựa chọn: gộp / tạo mới / huỷ */}
      <Dialog open={!!dupPrompt} onClose={() => setDupPrompt(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Nhà cung cấp trùng tên</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            Đã có nhà cung cấp tên <strong>"{dupPrompt?.dup.name}"</strong>. Bạn muốn xử lý thế nào?
          </Alert>
          <Typography variant="body2" color="text.secondary">
            <strong>Gộp vào bản đã có</strong>: dồn thông tin vừa nhập (liên hệ, lĩnh vực, tour,
            ghi chú, file…) vào NCC sẵn có — các ô đang trống của bản cũ sẽ được điền thêm, không
            ghi đè dữ liệu cũ.<br />
            <strong>Vẫn tạo NCC mới</strong>: lưu thành một nhà cung cấp riêng (chấp nhận trùng tên).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setDupPrompt(null)}>Huỷ</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => void handleDupCreate()} startIcon={<PersonAddAlt1Icon />}>
            Vẫn tạo NCC mới
          </Button>
          <Button variant="contained" onClick={() => void handleDupMerge()} startIcon={<MergeTypeIcon />}>
            Gộp vào bản đã có
          </Button>
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
  ncc: Ncc;
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
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, mr: 1 }}>
          {selectable && (
            <Checkbox size="small" checked={!!selected} tabIndex={-1} disableRipple sx={{ p: 0, pointerEvents: 'none' }} />
          )}
          <Typography fontWeight={800} variant="body1" sx={{ lineHeight: 1.3 }}>
            🏢 {s.name}
          </Typography>
          {s.status && s.status !== 'active' && (
            <Chip size="small" label={s.status === 'paused' ? 'Ngừng' : 'Hạn chế'}
              sx={{ height: 18, fontWeight: 700, bgcolor: s.status === 'paused' ? 'rgba(100,116,139,0.18)' : 'rgba(220,50,80,0.15)', color: s.status === 'paused' ? '#475569' : '#dc3250' }} />
          )}
          {(s.files ?? []).length > 0 && <Chip size="small" variant="outlined" label={`📎 ${(s.files ?? []).length}`} sx={{ height: 18 }} />}
          {!!s.collaborators?.length && <Chip size="small" variant="outlined" label={`👥 Chia sẻ ${s.collaborators.length}`} sx={{ height: 18, color: 'primary.main' }} />}
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

      {/* Contacts preview (ẩn khi Thu gọn) */}
      {!compact && (s.contacts ?? [])
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
      {!compact && (s.contacts ?? []).length > 2 && (
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
