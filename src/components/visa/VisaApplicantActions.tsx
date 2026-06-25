import { useMemo, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { toast } from '@/stores/toastStore';
import {
  VISA_APPLICANT_STATUS_META, VISA_APPLICANT_STATUS_ORDER, deriveVisaStatus, legacyFromVisaStatus,
} from './constants';
import { REMINDER_META, buildReminder, type ReminderKind } from './visaReminders';
import type { Passenger, VisaApplicantStatus, VisaProjectDoc } from '@/types';

/** Đổi trạng thái visa cho NHIỀU khách cùng lúc (theo phạm vi). */
export function BulkStatusDialog({ applicants, onApply, onClose }: {
  applicants: Passenger[];
  onApply: (updated: Passenger[]) => void;
  onClose: () => void;
}) {
  const present = useMemo(
    () => VISA_APPLICANT_STATUS_ORDER.filter((s) => applicants.some((p) => deriveVisaStatus(p) === s)),
    [applicants],
  );
  const [scope, setScope] = useState<'all' | VisaApplicantStatus>('all');
  const [target, setTarget] = useState<VisaApplicantStatus>('collecting');

  const affected = scope === 'all' ? applicants.length : applicants.filter((p) => deriveVisaStatus(p) === scope).length;

  const apply = () => {
    const next = applicants.map((p) => {
      if (scope !== 'all' && deriveVisaStatus(p) !== scope) return p;
      return { ...p, visaStatus: target, ...legacyFromVisaStatus(target) };
    });
    onApply(next);
    toast(`✅ Đã đổi trạng thái cho ${affected} khách.`);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Đổi trạng thái hàng loạt</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Áp cho" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <MenuItem value="all">Tất cả khách ({applicants.length})</MenuItem>
            {present.map((s) => (
              <MenuItem key={s} value={s}>
                Đang “{VISA_APPLICANT_STATUS_META[s].label}” ({applicants.filter((p) => deriveVisaStatus(p) === s).length})
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Trạng thái mới" value={target} onChange={(e) => setTarget(e.target.value as VisaApplicantStatus)}>
            {VISA_APPLICANT_STATUS_ORDER.map((s) => (
              <MenuItem key={s} value={s} sx={{ color: VISA_APPLICANT_STATUS_META[s].color }}>
                {VISA_APPLICANT_STATUS_META[s].label}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            Sẽ cập nhật <strong>{affected}</strong> khách → “{VISA_APPLICANT_STATUS_META[target].label}”.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={affected === 0} onClick={apply}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Áp dụng
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Soạn tin nhắn nhắc khách (nộp hồ sơ / SLTH-PV / kết quả) — copy để gửi. */
export function ReminderDialog({ project, applicants, onClose }: {
  project: VisaProjectDoc;
  applicants: Passenger[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ReminderKind>('docs');
  const { text, count } = useMemo(() => buildReminder(kind, project, applicants), [kind, project, applicants]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('✅ Đã copy tin nhắn.'); }
    catch { toast('Không copy được — hãy chọn & sao chép thủ công.', 'warning'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Mẫu tin nhắn nhắc khách</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Loại tin" value={kind} onChange={(e) => setKind(e.target.value as ReminderKind)}>
            {(Object.keys(REMINDER_META) as ReminderKind[]).map((k) => (
              <MenuItem key={k} value={k}>{REMINDER_META[k].icon} {REMINDER_META[k].label}</MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">{count} khách phù hợp.</Typography>
          <TextField multiline minRows={8} value={text} InputProps={{ readOnly: true }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={() => void copy()}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Copy tin nhắn
        </Button>
      </DialogActions>
    </Dialog>
  );
}
