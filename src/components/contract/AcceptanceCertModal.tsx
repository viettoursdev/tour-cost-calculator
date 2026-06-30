import { useMemo, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Rating, Stack, TextField, Typography,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useAuthStore } from '@/stores/authStore';
import { fmtVND } from '@/components/quote/calc';
// exportAcceptanceCertPDF nạp động khi bấm.
import type { Contract, AcceptanceRecord, AcceptanceServiceItem } from '@/types';

type Props = {
  contract: Contract;
  onSave: (date: string, note: string, detail: AcceptanceRecord) => void;
  onClose: () => void;
};

/** Seed checklist dịch vụ: ưu tiên bản đã lưu, fallback từ includes của HĐ. */
function seedServices(c: Contract): AcceptanceServiceItem[] {
  if (c.acceptance?.services?.length) return c.acceptance.services;
  return (c.includes ?? []).filter((s) => s.trim()).map((label) => ({ label, delivered: true }));
}

export function AcceptanceCertModal({ contract, onSave, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const currentUser = useAuthStore((s) => s.currentUser);
  const readOnly = contract.hasAcceptance;

  const [date, setDate] = useState(contract.acceptanceDate ?? today);
  const [note, setNote] = useState(contract.acceptanceNote ?? '');
  const [services, setServices] = useState<AcceptanceServiceItem[]>(seedServices(contract));
  const [repA, setRepA] = useState(contract.acceptance?.repA ?? currentUser?.name ?? '');
  const [repB, setRepB] = useState(contract.acceptance?.repB ?? contract.partyB?.rep ?? '');
  const [satisfaction, setSatisfaction] = useState<number>(contract.acceptance?.satisfaction ?? 0);

  // ── Đối soát tài chính (số thật từ hợp đồng) ──
  const fin = useMemo(() => {
    const total = Math.round((contract.pricePerPax || 0) * (contract.contractPax || 0));
    const collected = (contract.payments ?? [])
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + ((p.receivedAmount ?? p.amount) || 0), 0);
    return { total, collected, remaining: total - collected };
  }, [contract]);

  const detail = (): AcceptanceRecord => ({ services, repA, repB, satisfaction: satisfaction || undefined });

  const toggleSvc = (i: number) =>
    setServices((list) => list.map((s, idx) => (idx === i ? { ...s, delivered: !s.delivered } : s)));

  const handleExportPDF = () => {
    if (!currentUser) return;
    void import('@/lib/exports/exportAcceptanceCert').then((m) =>
      m.exportAcceptanceCertPDF(
        contract,
        { date, note, detail: detail() },
        { name: currentUser.name, role: currentUser.role },
      ),
    );
  };

  const deliveredCount = services.filter((s) => s.delivered).length;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>📋 Biên bản nghiệm thu {readOnly ? '(đã phát hành)' : ''}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Hợp đồng: <strong>{contract.contractNo || contract.id}</strong> — {contract.tourName}
          </Typography>

          {/* Đối soát tài chính */}
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Đối soát tài chính</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Giá trị HĐ: ${fmtVND(fin.total)}`} variant="outlined" />
              <Chip size="small" color="success" variant="outlined" label={`Đã thu: ${fmtVND(fin.collected)}`} />
              <Chip size="small" color={fin.remaining > 0 ? 'warning' : 'default'} variant="outlined"
                label={fin.remaining > 0 ? `Còn lại: ${fmtVND(fin.remaining)}` : '✓ Đã thu đủ'} />
            </Stack>
            {fin.remaining > 0 && (
              <Typography variant="caption" color="#b9770f" sx={{ display: 'block', mt: 0.5 }}>
                ⚠ Khách còn nợ {fmtVND(fin.remaining)} — nên thu nốt trước khi đóng hồ sơ.
              </Typography>
            )}
          </Box>

          <Divider />

          {/* Checklist dịch vụ đã giao */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="caption" fontWeight={800} color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Dịch vụ đã giao</Typography>
              <Typography variant="caption" color="text.secondary">{deliveredCount}/{services.length}</Typography>
            </Stack>
            {services.length === 0 ? (
              <Typography variant="caption" color="text.disabled">(Hợp đồng chưa khai báo dịch vụ bao gồm)</Typography>
            ) : (
              <Stack sx={{ mt: 0.5 }}>
                {services.map((s, i) => (
                  <FormControlLabel
                    key={i}
                    sx={{ alignItems: 'flex-start', m: 0 }}
                    control={<Checkbox size="small" checked={s.delivered} disabled={readOnly}
                      onChange={() => toggleSvc(i)} sx={{ pt: 0.25 }} />}
                    label={<Typography variant="body2" sx={{ textDecoration: s.delivered ? 'none' : 'line-through',
                      color: s.delivered ? 'text.primary' : 'text.disabled' }}>{s.label}</Typography>}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Divider />

          {/* Mức hài lòng */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" fontWeight={600}>Mức hài lòng của khách:</Typography>
            <Rating value={satisfaction} readOnly={readOnly}
              onChange={(_, v) => setSatisfaction(v ?? 0)} />
          </Stack>

          {/* Ngày + chữ ký 2 bên */}
          <Stack direction="row" spacing={2}>
            <TextField label="Ngày nghiệm thu" type="date" value={date} disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} required sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Đại diện Bên A (Viettours)" value={repA} disabled={readOnly}
              onChange={(e) => setRepA(e.target.value)} sx={{ flex: 1 }} size="small" />
            <TextField label="Đại diện Bên B (khách)" value={repB} disabled={readOnly}
              onChange={(e) => setRepB(e.target.value)} sx={{ flex: 1 }} size="small" />
          </Stack>

          <TextField label="Ghi chú / Kết luận" multiline rows={2} value={note} disabled={readOnly}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Các bên đã hoàn thành đầy đủ nghĩa vụ theo hợp đồng..." />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {date && (
          <Button startIcon={<PictureAsPdfIcon />} onClick={handleExportPDF} color="error">
            Xuất PDF
          </Button>
        )}
        {!readOnly && (
          <Button variant="contained" disabled={!date} onClick={() => onSave(date, note, detail())}>
            ✅ Xác nhận nghiệm thu
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
