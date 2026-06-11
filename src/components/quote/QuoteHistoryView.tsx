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
import { fmtVND } from './calc';
import { workerFileUrl } from '@/lib/aiWorker';
import type { CloudQuoteEntry, Collaborator, Template, User } from '@/types';
import CloudDownload from '@mui/icons-material/CloudDownload';
import Delete from '@mui/icons-material/Delete';
import AttachFile from '@mui/icons-material/AttachFile';

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
        <IconButton size="small" component="a" href={workerFileUrl(files[0].key)} target="_blank" rel="noreferrer">
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
              component="a"
              href={workerFileUrl(f.key)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setAnchorEl(null)}
              sx={{ gap: 1 }}
            >
              <AttachFile fontSize="small" color="action" />
              <Typography variant="body2" noWrap>{f.name}</Typography>
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

  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const deleteCloud = useQuoteStore((s) => s.deleteCloud);
  const updateCloudCollaborators = useQuoteStore((s) => s.updateCloudCollaborators);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
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

  const filtered = useMemo(() => {
    const lc = search.trim().toLowerCase();
    return visible.filter((q) => {
      if (!isDMC && templateFilter !== 'all' && q.template !== templateFilter) return false;
      if (!lc) return true;
      return (
        q.name.toLowerCase().includes(lc) ||
        q.quoteCode.toLowerCase().includes(lc) ||
        q.customerName?.toLowerCase().includes(lc)
      );
    });
  }, [visible, search, templateFilter, isDMC]);

  const handleLoad = async (row: CloudQuoteEntry) => {
    if (currentQuoteId && currentQuoteId !== row.cloudId) {
      if (!window.confirm('Báo giá hiện tại có thể có thay đổi chưa lưu. Tải báo giá khác?')) return;
    } else if (currentQuoteId === row.cloudId) {
      if (!window.confirm('Tải lại báo giá này từ cloud? Thay đổi cục bộ chưa lưu sẽ mất.')) return;
    }
    const result = await loadCloud(row.cloudId);
    if (!result.ok) window.alert('⚠ ' + result.error);
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
      field: 'template',
      headerName: 'Loại',
      width: 110,
      renderCell: (p: GridRenderCellParams<CloudQuoteEntry, Template>) => (
        <Chip size="small" label={TEMPLATE_LABEL[p.value as Template]} />
      ),
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
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <Stack direction="row">
          <Tooltip title="Tải báo giá">
            <IconButton size="small" onClick={() => handleLoad(p.row)}>
              <CloudDownload fontSize="small" />
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
