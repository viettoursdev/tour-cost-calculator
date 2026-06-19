import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Badge, Box, Button, Chip, IconButton, MenuItem, Popover, Select,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import GroupIcon from '@mui/icons-material/Group';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useCustomerStore } from '@/stores/customerStore';
import { fmtVND } from './calc';
import { QUOTE_STATUS_META } from './constants';
import { openFilePreview } from '@/stores/filePreviewStore';
import { attMeta } from '@/lib/util';
import type { CloudQuoteEntry, Collaborator, QuoteStatus, Template, User, WorkflowStep } from '@/types';
import CloudDownload from '@mui/icons-material/CloudDownload';
import ContentCopy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import { fbGetQuoteProject, fbGetDMCQuoteProject } from '@/lib/firebase';
import AttachFile from '@mui/icons-material/AttachFile';
import { filterRank } from '@/lib/search';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';

const TEMPLATE_LABEL: Record<Template, string> = {
  domestic: 'Nội địa',
  intl: 'Quốc tế',
  dmc: 'DMC',
  itinerary: 'Chương trình',
  menu: 'Thực đơn',
  visa: 'Visa',
  doctranslate: 'Dịch hồ sơ',
};

type TemplateFilter = 'all' | Template;

/** Cell hiển thị file đính kèm: 0 → trống, 1 → link, nhiều → badge + popover. */
function AttachmentsCell({ row }: { row: CloudQuoteEntry }) {
  const files = row.attachments ?? (row.attachment ? [row.attachment] : []);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  if (files.length === 0) return null;
  if (files.length === 1) {
    return (
      <Tooltip title={`Mở: ${files[0].name}`}>
        <IconButton size="small" onClick={() => openFilePreview({ key: files[0].key, name: files[0].name })}>
          <AttachFile fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <>
      <Tooltip title={`${files.length} file đính kèm`}>
        <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
          <Badge badgeContent={files.length} color="primary">
            <AttachFile fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Stack sx={{ py: 0.5, minWidth: 220, maxWidth: 360 }}>
          {files.map((f) => (
            <MenuItem
              key={f.key}
              onClick={() => { setAnchorEl(null); openFilePreview({ key: f.key, name: f.name }); }}
              sx={{ gap: 1, alignItems: 'flex-start' }}
            >
              <AttachFile fontSize="small" color="action" sx={{ mt: 0.4 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>{f.name}</Typography>
                {attMeta(f) && (
                  <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
                    {attMeta(f)}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))}
        </Stack>
      </Popover>
    </>
  );
}

export function QuoteHistoryView() {
  const template = useQuoteStore((s) => s.draft.template);
  const isDMC = template === 'dmc';

  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const dmcQuotes = useQuoteHistoryStore((s) => s.dmcQuotes);
  const loading = useQuoteHistoryStore((s) => s.loading);
  const error = useQuoteHistoryStore((s) => s.error);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const currentUserU = useAuthStore((s) => s.currentUser?.u);
  const users = useAuthStore((s) => s.users);
  const customers = useCustomerStore((s) => s.customers);
  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const applyImport = useQuoteStore((s) => s.applyImport);
  const deleteCloud = useQuoteStore((s) => s.deleteCloud);
  const updateCloudCollaborators = useQuoteStore((s) => s.updateCloudCollaborators);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [collabAnchor, setCollabAnchor] = useState<{
    el: HTMLElement;
    row: CloudQuoteEntry;
  } | null>(null);

  const allQuotes = isDMC ? dmcQuotes : quotes;

  const visible = useMemo(
    () => visibleQuotes(template ?? undefined),
    // visibleQuotes reads from store; re-run when quotes, dmcQuotes or current user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allQuotes, currentUserU],
  );

  const owners = useMemo(
    () => [...new Set(visible.map((q) => q.createdByName).filter(Boolean))].sort(),
    [visible],
  );
  const filtered = useMemo(() => {
    const base = visible.filter((q) =>
      (isDMC || templateFilter === 'all' || q.template === templateFilter)
      && (!owner || q.createdByName === owner)
      && inDateRange(q.updatedAt ?? q.createdAt, dateRange, dateFrom, dateTo));
    return filterRank(base, search, (q) => [q.name, q.quoteCode, q.customerName].filter(Boolean).join(' '));
  }, [visible, search, templateFilter, isDMC, owner, dateRange, dateFrom, dateTo]);

  const handleLoad = async (row: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== row.cloudId) {
      if (!window.confirm('Báo giá hiện tại có thể có thay đổi chưa lưu. Tải báo giá khác?')) return;
    } else if (currentQuoteId === row.cloudId) {
      if (!window.confirm('Tải lại báo giá này từ cloud? Thay đổi cục bộ chưa lưu sẽ mất.')) return;
    }
    const result = await loadCloud(row.cloudId);
    if (!result.ok) window.alert('⚠ ' + result.error);
  };

  const handleOpenLinked = async (row: CloudQuoteEntry) => {
    if (!row.linkedQuoteId) return;
    if (!window.confirm(`Mở bản liên kết "${row.linkedQuoteName ?? ''}"? Thay đổi cục bộ chưa lưu có thể mất.`)) return;
    const r = await loadCloud(row.linkedQuoteId, { dmc: row.linkedQuoteTemplate === 'dmc' });
    if (!r.ok) window.alert('⚠ ' + r.error);
  };

  const handleDuplicate = async (row: CloudQuoteEntry) => {
    if (!window.confirm(`Tạo báo giá MỚI từ "${row.name}"? Sao chép hạng mục & cấu hình; quy trình về "Chưa làm", chưa lưu.`)) return;
    try {
      const proj = row.template === 'dmc' ? await fbGetDMCQuoteProject(row.cloudId) : await fbGetQuoteProject(row.cloudId);
      const st = proj?.currentState;
      if (!st) { window.alert('Không tải được dữ liệu báo giá nguồn.'); return; }
      const workflow = (st.workflow ?? []).map((s): WorkflowStep => ({ ...s, status: 'todo', doneDate: null, dueDate: null, log: undefined }));
      applyImport({
        ...st,
        info: { ...st.info, name: `${st.info.name} (Bản sao)`, startDate: null },
        status: 'in_progress',
        ...(workflow.length ? { workflow } : {}),
      });
    } catch (e) {
      window.alert('❌ Lỗi nhân bản: ' + (e as Error).message);
    }
  };

  const handleDelete = async (row: CloudQuoteEntry) => {
    if (!window.confirm(`Xoá báo giá "${row.name}" (${row.quoteCode})? Không thể hoàn tác.`)) return;
    try {
      await deleteCloud(row.id, row.cloudId);
    } catch (e) {
      window.alert('❌ Lỗi xoá: ' + (e as Error).message);
    }
  };

  const columns: GridColDef<CloudQuoteEntry>[] = [
    { field: 'quoteCode', headerName: 'Mã', width: 140 },
    { field: 'name', headerName: 'Tên báo giá', flex: 1, minWidth: 180 },
    {
      field: 'customerName',
      headerName: 'Khách hàng',
      width: 200,
      renderCell: (p: GridRenderCellParams<CloudQuoteEntry, string>) => {
        const name = p.row.customerName;
        if (!name) return <Typography variant="caption" color="text.disabled">—</Typography>;
        const cust = p.row.customerId ? custById.get(p.row.customerId) : undefined;
        const contact = cust?.contacts?.find((c) => c.phone || c.email || c.name);
        const sub = [contact?.phone, contact?.email].filter(Boolean).join(' · ');
        return (
          <Stack sx={{ minWidth: 0, justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
            {(sub || cust?.taxCode) && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {sub}{cust?.taxCode ? `${sub ? ' · ' : ''}MST ${cust.taxCode}` : ''}
              </Typography>
            )}
          </Stack>
        );
      },
    },
    {
      field: 'template',
      headerName: 'Loại',
      width: 110,
      renderCell: (p: GridRenderCellParams<CloudQuoteEntry, Template>) => (
        <Chip size="small" label={TEMPLATE_LABEL[p.value as Template]} />
      ),
    },
    {
      field: 'status',
      headerName: 'Trạng thái',
      width: 150,
      renderCell: (p: GridRenderCellParams<CloudQuoteEntry, QuoteStatus>) => {
        const meta = QUOTE_STATUS_META[(p.value ?? 'in_progress') as QuoteStatus];
        return <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />;
      },
    },
    { field: 'pax', headerName: 'Khách', width: 80, align: 'right', headerAlign: 'right' },
    {
      field: 'totalCost',
      headerName: 'Tổng',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v: number) => fmtVND(v),
    },
    {
      field: 'updatedAt',
      headerName: 'Cập nhật',
      width: 200,
      renderCell: (p) => (
        <Stack>
          <Typography variant="body2">
            {new Date(p.row.updatedAt).toLocaleString('vi-VN')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.row.updatedBy}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'collaborators',
      headerName: 'Cộng tác',
      width: 110,
      renderCell: (p) => (
        <Tooltip title="Click để sửa cộng tác viên">
          <Chip
            size="small"
            icon={<GroupIcon />}
            label={(p.row.collaborators ?? []).length}
            onClick={(e) => setCollabAnchor({ el: e.currentTarget, row: p.row })}
            clickable
          />
        </Tooltip>
      ),
    },
    {
      field: 'linkedQuoteId',
      headerName: 'Liên kết',
      width: 140,
      sortable: false,
      renderCell: (p) => (p.row.linkedQuoteId ? (
        <Tooltip title={`Mở bản liên kết: ${p.row.linkedQuoteName ?? ''}`}>
          <Chip
            size="small" color="primary" variant="outlined" clickable
            label={p.row.linkedQuoteTemplate === 'dmc' ? '🔗 DMC' : '🔗 Nước ngoài'}
            onClick={() => void handleOpenLinked(p.row)}
          />
        </Tooltip>
      ) : null),
    },
    {
      field: 'attachment',
      headerName: 'File',
      width: 64,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (p) => <AttachmentsCell row={p.row} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <Stack direction="row">
          <Tooltip title="Tải báo giá">
            <IconButton size="small" onClick={() => handleLoad(p.row)}>
              <CloudDownload fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Nhân bản thành báo giá mới">
            <IconButton size="small" onClick={() => void handleDuplicate(p.row)}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Xoá">
            <IconButton size="small" color="error" onClick={() => handleDelete(p.row)}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {isDMC ? '🕐 Lịch sử breakdown DMC' : 'Lịch sử báo giá'}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Tìm kiếm"
          placeholder="Mã / tên / khách hàng"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        {!isDMC && (
          <Select
            size="small"
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value as TemplateFilter)}
          >
            <MenuItem value="all">Tất cả loại</MenuItem>
            <MenuItem value="domestic">Nội địa</MenuItem>
            <MenuItem value="intl">Quốc tế</MenuItem>
          </Select>
        )}
        <ListFilterBar
          dateRange={dateRange} onDateRange={setDateRange}
          from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo}
          owners={owners} owner={owner} onOwner={setOwner}
        />
        <Typography variant="body2" color="text.secondary">
          Hiển thị <strong>{filtered.length}</strong> / {allQuotes.length}
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={loading}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          initialState={{
            sorting: { sortModel: [{ field: 'updatedAt', sort: 'desc' }] },
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          slotProps={{
            noRowsOverlay: {
              sx: {},
            },
          }}
          localeText={{
            noRowsLabel: isDMC ? 'Chưa có breakdown DMC nào' : 'Chưa có báo giá nào',
          }}
        />
      </Box>

      {collabAnchor && (
        <CollaboratorPopover
          anchor={collabAnchor.el}
          row={collabAnchor.row}
          users={users}
          onClose={() => setCollabAnchor(null)}
          onSave={async (collaborators) => {
            try {
              await updateCloudCollaborators(collabAnchor.row.id, collabAnchor.row.cloudId, collaborators);
              setCollabAnchor(null);
            } catch (e) {
              window.alert('❌ Lỗi cập nhật: ' + (e as Error).message);
            }
          }}
        />
      )}
    </Box>
  );
}

// ─────────── Inline collaborator-edit popover ───────────

function CollaboratorPopover({
  anchor, row, users, onClose, onSave,
}: {
  anchor: HTMLElement;
  row: CloudQuoteEntry;
  users: User[];
  onClose: () => void;
  onSave: (collabs: Collaborator[]) => Promise<void>;
}) {
  const currentUserU = useAuthStore((s) => s.currentUser?.u);
  const initial = useMemo(() => {
    const set = new Set((row.collaborators ?? []).map((c) => c.u));
    return users.filter((u) => set.has(u.u));
  }, [row.collaborators, users]);
  const [picked, setPicked] = useState<User[]>(initial);
  const [busy, setBusy] = useState(false);

  const otherUsers = useMemo(
    () => users.filter((u) => u.u !== currentUserU && u.u !== row.createdByUsername),
    [users, currentUserU, row.createdByUsername],
  );

  const handleSave = async () => {
    setBusy(true);
    await onSave(picked.map((u) => ({ u: u.u, name: u.name })));
    setBusy(false);
  };

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={busy ? undefined : onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ p: 2, width: 360 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Cộng tác viên — {row.quoteCode}
        </Typography>
        <Autocomplete
          multiple
          size="small"
          options={otherUsers}
          value={picked}
          onChange={(_, v) => setPicked(v)}
          getOptionLabel={(u) => `${u.name} (${u.role})`}
          isOptionEqualToValue={(a, b) => a.u === b.u}
          renderInput={(params) => <TextField {...params} placeholder="Thêm cộng tác viên" />}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
          <Button size="small" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button size="small" variant="contained" onClick={handleSave} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </Stack>
      </Box>
    </Popover>
  );
}
