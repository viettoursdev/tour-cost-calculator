import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress,
  Menu, MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
// Trình xuất nạp động khi bấm (giảm bundle khởi động).
import { useContractStore } from '@/stores/contractStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { canMakeContract } from '@/components/quote/dealStage';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canManageArea } from '@/auth/departments';
import { canViewAll } from '@/auth/ROLES';
import { CONTRACT_STATUS, emptyContract, contractFromQuote, ContractStatusKey } from './constants';
import { ContractModal } from './ContractModal';
import { PaymentPanel } from './PaymentPanel';
import { AcceptanceCertModal } from './AcceptanceCertModal';
import { QuotePickerDialog } from './QuotePickerDialog';
import { fmtVND } from '@/components/quote/calc';
import type { Contract, CloudQuoteEntry } from '@/types';
import { filterRank } from '@/lib/search';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { filterFieldSx, filterSelectSx } from '@/components/common/filterStyles';
import { FilePreviewDialog } from '@/components/common/FilePreviewDialog';
import { contractIssues } from './contractValidation';
import { ContractReviewDialog } from './ContractReviewDialog';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

export function ContractView() {
  const contracts = useContractStore((s) => s.contracts);
  const loading = useContractStore((s) => s.loading);
  const syncing = useContractStore((s) => s.syncing);
  const save = useContractStore((s) => s.save);
  const del = useContractStore((s) => s.delete);
  const updatePayments = useContractStore((s) => s.updatePayments);
  const markAcceptance = useContractStore((s) => s.markAcceptance);
  const updateStatus = useContractStore((s) => s.updateStatus);

  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageContracts') && canManageArea(currentUser, 'contracts');
  // Ban Giám Đốc trở lên xem toàn bộ; dưới ngưỡng chỉ thấy HĐ do mình tạo.
  const viewAll = !!currentUser && canViewAll(currentUser.role, 'contracts');
  const ownContracts = useMemo(
    () => (viewAll ? contracts : contracts.filter((c) => c.createdBy === currentUser?.name)),
    [contracts, viewAll, currentUser?.name],
  );

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quotePicker, setQuotePicker] = useState(false);
  const [modal, setModal] = useState<Contract | null>(null);
  const [acceptanceTarget, setAcceptanceTarget] = useState<Contract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [exportAnchor, setExportAnchor] = useState<{ el: HTMLElement; c: Contract } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Contract | null>(null);

  const closeExport = () => setExportAnchor(null);
  // Bản chính thức (PDF/Word) → cảnh báo nếu hồ sơ còn thiếu; Xem trước thì bỏ qua.
  const confirmIssues = (c: Contract): boolean => {
    const issues = contractIssues(c);
    if (!issues.length) return true;
    return window.confirm(`⚠ Hợp đồng còn ${issues.length} điểm cần xem lại:\n\n${issues.map((i) => '• ' + i).join('\n')}\n\nVẫn xuất bản này?`);
  };
  const doExportPDF = (c: Contract) => { closeExport(); if (!confirmIssues(c)) return; void import('@/lib/exports/exportContractPDF').then((m) => m.exportContractPDF(c)); };
  const doExportWord = (c: Contract) => { closeExport(); if (!confirmIssues(c)) return; void import('@/lib/exports/exportContractDocx').then((m) => m.exportContractDocx(c)); };
  const doPreview = (c: Contract) => {
    closeExport();
    void import('@/lib/exports/exportContractPDF').then((m) => {
      const { url, filename } = m.contractPDFObjectURL(c);
      setPreview({ url, name: filename });
    });
  };
  const closePreview = () => setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; });

  const owners = useMemo(
    () => [...new Set(ownContracts.map((c) => c.createdBy).filter(Boolean))].sort(),
    [ownContracts],
  );
  const filtered = useMemo(() => {
    const base = ownContracts.filter((c) =>
      (!filterStatus || (c.contractStatus || 'draft') === filterStatus)
      && (!owner || c.createdBy === owner)
      && inDateRange(c.updatedAt ?? c.createdAt, dateRange, dateFrom, dateTo));
    return filterRank(base, search, (c) => [c.contractNo, c.tourName, c.partyB?.name, c.tourDest].filter(Boolean).join(' '));
  }, [ownContracts, search, filterStatus, owner, dateRange, dateFrom, dateTo]);

  const totalValue = ownContracts.reduce((s, c) => s + Math.round((+c.pricePerPax || 0) * (+c.contractPax || 0)), 0);
  const totalPaid = ownContracts.reduce(
    (s, c) => s + (c.payments ?? []).filter((p) => p.status === 'paid').reduce((ss, p) => ss + ((p.receivedAmount ?? +p.amount) || 0), 0),
    0,
  );

  const handlePickQuote = (quote: CloudQuoteEntry | null) => {
    setQuotePicker(false);
    const u = currentUser!;
    if (!quote) {
      setModal(emptyContract(u.name));
      return;
    }
    // Cổng chặn mềm: báo giá nên đã CHỐT (won) trước khi lập hợp đồng.
    const gate = canMakeContract({ status: quote.status });
    if (!gate.ok && !window.confirm(`⚠️ ${gate.reason}\n\nVẫn lập hợp đồng từ báo giá này?`)) return;
    const customer = quote.customerId
      ? useCustomerStore.getState().customers.find((c) => c.id === quote.customerId) ?? null
      : null;
    setModal(contractFromQuote(quote, u.name, customer));
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>📄 Danh sách Hợp đồng</Typography>
          <Typography variant="caption" color="text.secondary">
            {loading ? 'Đang tải...' : `${ownContracts.length} hợp đồng · Tổng: ${fmtVND(totalValue)} · Đã TT: ${fmtVND(totalPaid)}`}
            {syncing && <Chip label="☁️ Đang đồng bộ..." size="small" sx={{ ml: 1 }} />}
          </Typography>
        </Box>
        {canEdit && (
          <Button variant="contained" onClick={() => setQuotePicker(true)}>
            ➕ Thêm hợp đồng
          </Button>
        )}
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Stats chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {Object.entries(CONTRACT_STATUS).map(([k, s]) => {
          const cnt = ownContracts.filter((c) => (c.contractStatus || 'draft') === k).length;
          if (cnt === 0) return null;
          return (
            <Chip
              key={k}
              label={`${s.icon} ${s.label}: ${cnt}`}
              size="small"
              onClick={() => setFilterStatus(filterStatus === k ? '' : k)}
              variant={filterStatus === k ? 'filled' : 'outlined'}
              sx={{ borderColor: s.color, color: filterStatus === k ? '#fff' : s.color,
                    bgcolor: filterStatus === k ? s.color : s.bg }}
            />
          );
        })}
      </Stack>

      {/* Search & filter */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Tìm số HĐ, tên tour, khách hàng..."
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 220, maxWidth: 360, ...filterFieldSx }} />
        <Select size="small" value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 180, ...filterSelectSx }}>
          <MenuItem value="">Tất cả trạng thái</MenuItem>
          {Object.entries(CONTRACT_STATUS).map(([k, s]) => (
            <MenuItem key={k} value={k}>{s.icon} {s.label}</MenuItem>
          ))}
        </Select>
        <ListFilterBar
          dateRange={dateRange} onDateRange={setDateRange}
          from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo}
          owners={owners} owner={owner} onOwner={setOwner}
        />
        {(search || filterStatus || owner || dateRange !== 'all') && (
          <Button size="small" color="error" variant="outlined"
            onClick={() => { setSearch(''); setFilterStatus(''); setOwner(''); setDateRange('all'); }}>
            ✕ Xoá lọc
          </Button>
        )}
      </Stack>

      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography variant="h2">📄</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mt: 1 }}>
            {ownContracts.length === 0 ? 'Chưa có hợp đồng nào' : 'Không tìm thấy kết quả'}
          </Typography>
        </Box>
      )}

      {/* Contract list */}
      {filtered.map((c) => {
        const status = CONTRACT_STATUS[(c.contractStatus || 'draft') as ContractStatusKey];
        const totalAmt = Math.round((+c.pricePerPax || 0) * (+c.contractPax || 0));
        const paidAmt = (c.payments ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + ((p.receivedAmount ?? +p.amount) || 0), 0);
        return (
          <Accordion key={c.id} expanded={expanded === c.id}
            onChange={(_, open) => setExpanded(open ? c.id : null)}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, flexWrap: 'wrap', gap: 1 }}>
                <Chip label={`${status.icon} ${status.label}`} size="small"
                  sx={{ bgcolor: status.bg, color: status.color, border: `1px solid ${status.color}40` }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>
                    {c.contractNo ? `#${c.contractNo}` : '(chưa có số)'} — {c.tourName || '(chưa có tên)'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.partyB?.name || '(chưa có khách)'} · {c.contractPax} khách · {fmtVND(totalAmt)}
                    {totalAmt > 0 && ` · Đã TT: ${fmtVND(paidAmt)} (${Math.round(paidAmt / totalAmt * 100)}%)`}
                  </Typography>
                </Box>
                {canEdit && (
                  <Stack direction="row" onClick={(e) => e.stopPropagation()}>
                    <Select size="small" value={c.contractStatus || 'draft'}
                      onChange={(e) => updateStatus(c.id, e.target.value as Contract['contractStatus'])}
                      sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0.5, pr: 3 } }}>
                      {Object.entries(CONTRACT_STATUS).map(([k, s]) => (
                        <MenuItem key={k} value={k} sx={{ fontSize: 12 }}>{s.icon} {s.label}</MenuItem>
                      ))}
                    </Select>
                    <Tooltip title="Sửa">
                      <IconButton size="small" onClick={() => setModal({ ...c })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Xoá">
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(c)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <PaymentPanel
                contract={c}
                canEdit={canEdit}
                onUpdate={(payments) => updatePayments(c.id, payments)}
                currentUser={currentUser}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  startIcon={<FileDownloadIcon />}
                  endIcon={<ExpandMoreIcon />}
                  variant="contained"
                  onClick={(e) => setExportAnchor({ el: e.currentTarget, c })}
                  sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}
                >
                  Xuất hợp đồng
                </Button>
                {(c.hasAcceptance || (c.contractStatus === 'completed' && canEdit)) && (
                  <Button size="small" variant="outlined"
                    onClick={() => setAcceptanceTarget(c)}>
                    📋 {c.hasAcceptance ? 'Xem biên bản nghiệm thu' : 'Phát hành biên bản nghiệm thu'}
                  </Button>
                )}
                {c.hasAcceptance && c.acceptanceDate && (
                  <Typography variant="caption" color="text.secondary" alignSelf="center">
                    BBNT: {c.acceptanceDate}
                  </Typography>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Modals */}
      {quotePicker && (
        <QuotePickerDialog open onPick={handlePickQuote} onClose={() => setQuotePicker(false)} />
      )}
      {modal !== null && (
        <ContractModal
          initial={modal}
          onSave={async (form) => { await save(form); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {acceptanceTarget && (
        <AcceptanceCertModal
          contract={acceptanceTarget}
          onSave={(date, note) => { markAcceptance(acceptanceTarget.id, date, note); setAcceptanceTarget(null); }}
          onClose={() => setAcceptanceTarget(null)}
        />
      )}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Xoá hợp đồng?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Xoá hợp đồng <strong>{deleteTarget?.contractNo || deleteTarget?.id}</strong>? Không thể hoàn tác.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Huỷ</Button>
          <Button variant="contained" color="error"
            onClick={() => { del(deleteTarget!.id); setDeleteTarget(null); }}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={exportAnchor?.el} open={!!exportAnchor} onClose={closeExport}>
        {exportAnchor && contractIssues(exportAnchor.c).length > 0 && (
          <Box sx={{ px: 2, py: 1, maxWidth: 280, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#b9770f', display: 'block' }}>
              ⚠ Còn {contractIssues(exportAnchor.c).length} điểm cần xem lại:
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal' }}>
              {contractIssues(exportAnchor.c).join(' · ')}
            </Typography>
          </Box>
        )}
        <MenuItem onClick={() => { const c = exportAnchor?.c; closeExport(); if (c) setReviewTarget(c); }}><AutoAwesomeIcon fontSize="small" sx={{ mr: 1, color: '#7c3aed' }} />AI rà soát hợp đồng</MenuItem>
        <MenuItem onClick={() => exportAnchor && doPreview(exportAnchor.c)}><VisibilityIcon fontSize="small" sx={{ mr: 1 }} />Xem trước (PDF)</MenuItem>
        <MenuItem onClick={() => exportAnchor && doExportPDF(exportAnchor.c)}><PictureAsPdfIcon fontSize="small" sx={{ mr: 1 }} />Tải PDF</MenuItem>
        <MenuItem onClick={() => exportAnchor && doExportWord(exportAnchor.c)}><ArticleIcon fontSize="small" sx={{ mr: 1 }} />Tải Word (.docx)</MenuItem>
      </Menu>

      <ContractReviewDialog contract={reviewTarget} onClose={() => setReviewTarget(null)} />

      <FilePreviewDialog open={!!preview} onClose={closePreview}
        file={preview ? { url: preview.url, name: preview.name, mime: 'application/pdf' } : null} />
    </Box>
  );
}
