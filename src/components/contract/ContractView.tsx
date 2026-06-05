import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress,
  MenuItem, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import { exportContractPDF } from '@/lib/exports/exportContractPDF';
import { exportContractDocx } from '@/lib/exports/exportContractDocx';
import { useContractStore } from '@/stores/contractStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { CONTRACT_STATUS, emptyContract, contractFromQuote, ContractStatusKey } from './constants';
import { ContractModal } from './ContractModal';
import { PaymentPanel } from './PaymentPanel';
import { AcceptanceCertModal } from './AcceptanceCertModal';
import { QuotePickerDialog } from './QuotePickerDialog';
import { fmtVND } from '@/components/quote/calc';
import type { Contract, CloudQuoteEntry } from '@/types';

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
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageContracts');

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quotePicker, setQuotePicker] = useState(false);
  const [modal, setModal] = useState<Contract | null>(null);
  const [acceptanceTarget, setAcceptanceTarget] = useState<Contract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filterStatus && (c.contractStatus || 'draft') !== filterStatus) return false;
      if (!q) return true;
      return (
        c.contractNo?.toLowerCase().includes(q) ||
        c.tourName?.toLowerCase().includes(q) ||
        c.partyB?.name?.toLowerCase().includes(q) ||
        c.tourDest?.toLowerCase().includes(q)
      );
    });
  }, [contracts, search, filterStatus]);

  const totalValue = contracts.reduce((s, c) => s + Math.round((+c.pricePerPax || 0) * (+c.contractPax || 0)), 0);
  const totalPaid = contracts.reduce(
    (s, c) => s + (c.payments ?? []).filter((p) => p.status === 'paid').reduce((ss, p) => ss + ((p.receivedAmount ?? +p.amount) || 0), 0),
    0,
  );

  const handlePickQuote = (quote: CloudQuoteEntry | null) => {
    setQuotePicker(false);
    const u = currentUser!;
    setModal(quote ? contractFromQuote(quote, u.name) : emptyContract(u.name));
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1280, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={800}>📄 Danh sách Hợp đồng</Typography>
          <Typography variant="caption" color="text.secondary">
            {loading ? 'Đang tải...' : `${contracts.length} hợp đồng · Tổng: ${fmtVND(totalValue)} · Đã TT: ${fmtVND(totalPaid)}`}
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
          const cnt = contracts.filter((c) => (c.contractStatus || 'draft') === k).length;
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
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
        <Select size="small" value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Tất cả trạng thái</MenuItem>
          {Object.entries(CONTRACT_STATUS).map(([k, s]) => (
            <MenuItem key={k} value={k}>{s.icon} {s.label}</MenuItem>
          ))}
        </Select>
        {(search || filterStatus) && (
          <Button size="small" color="error" variant="outlined"
            onClick={() => { setSearch(''); setFilterStatus(''); }}>
            ✕ Xoá lọc
          </Button>
        )}
      </Stack>

      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <Typography variant="h2">📄</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mt: 1 }}>
            {contracts.length === 0 ? 'Chưa có hợp đồng nào' : 'Không tìm thấy kết quả'}
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
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  color="error"
                  variant="outlined"
                  onClick={() => exportContractPDF(c)}
                >
<<<<<<< HEAD
                  PDF
                </Button>
                <Button
                  size="small"
                  startIcon={<ArticleIcon />}
                  color="primary"
                  variant="outlined"
                  onClick={() => void exportContractDocx(c)}
                >
                  Word (.docx)
=======
                  Xuất hợp đồng PDF
>>>>>>> origin/main
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
    </Box>
  );
}
