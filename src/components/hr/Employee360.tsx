import { useMemo } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Link, Rating, Stack, Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useHrEvalStore } from '@/stores/hrEvalStore';
import { DEPT_LABEL } from '@/auth/departments';
import { daysUntil, fmtDate } from '@/lib/dateUtils';
import { openFilePreview } from '@/stores/filePreviewStore';
import {
  EMPLOYMENT_STATUS_LABEL, EVAL_STATUS_LABEL, type HrEmployee,
} from '@/types';
import { CAREER_LADDERS } from './hrSeed';

const deptLabel = (d: string) => (d ? (DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d) : '—');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{value || '—'}</Typography>
    </Box>
  );
}

export function Employee360({ employee, onClose }: { employee: HrEmployee; onClose: () => void }) {
  const allEvals = useHrEvalStore((s) => s.evaluations);
  const evals = useMemo(
    () => allEvals.filter((e) => e.employeeId === employee.id).sort((a, b) => (a.period < b.period ? 1 : -1)),
    [allEvals, employee.id],
  );

  // Lộ trình thăng tiến theo phòng ban; xác định bậc hiện tại theo cấp bậc/chức danh.
  const ladder = useMemo(
    () => (employee.department && CAREER_LADDERS[employee.department]) || [],
    [employee.department],
  );
  const curLadderIdx = useMemo(() => {
    const hay = `${employee.level} ${employee.title}`.toLowerCase();
    return ladder.findIndex((s) => hay.includes(s.toLowerCase()));
  }, [ladder, employee.level, employee.title]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>👤 {employee.fullName} {employee.employeeCode && <Typography component="span" variant="caption" color="text.secondary">· {employee.employeeCode}</Typography>}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Thông tin cơ bản */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Field label="Phòng ban" value={deptLabel(employee.department)} />
            <Field label="Chức danh" value={employee.title} />
            <Field label="Cấp bậc" value={employee.level} />
            <Field label="Trạng thái" value={<Chip size="small" label={EMPLOYMENT_STATUS_LABEL[employee.status]} />} />
            <Field label="Điện thoại" value={employee.phone} />
            <Field label="Email" value={employee.email} />
            <Field label="Ngày vào làm" value={employee.joinDate ? fmtDate(employee.joinDate) : ''} />
          </Box>
          {employee.emergencyContact?.name && (
            <Typography variant="body2" color="text.secondary">
              Liên hệ khẩn cấp: {employee.emergencyContact.name}{employee.emergencyContact.phone ? ` · ${employee.emergencyContact.phone}` : ''}{employee.emergencyContact.relation ? ` (${employee.emergencyContact.relation})` : ''}
            </Typography>
          )}

          {ladder.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography fontWeight={700} mb={1}>🪜 Lộ trình thăng tiến</Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                  {ladder.map((step, i) => (
                    <Stack key={step} direction="row" spacing={0.75} alignItems="center">
                      <Chip size="small" color={i === curLadderIdx ? 'primary' : 'default'} variant={i === curLadderIdx ? 'filled' : 'outlined'}
                        label={step} />
                      {i < ladder.length - 1 && <Typography color="text.disabled">→</Typography>}
                    </Stack>
                  ))}
                </Stack>
                {curLadderIdx < 0 && <Typography variant="caption" color="text.secondary">Chưa xác định bậc hiện tại (cập nhật “Cấp bậc” trong hồ sơ để gợi ý bậc kế tiếp).</Typography>}
                {curLadderIdx >= 0 && curLadderIdx < ladder.length - 1 && (
                  <Typography variant="caption" color="text.secondary">Bậc kế tiếp: <b>{ladder[curLadderIdx + 1]}</b></Typography>
                )}
              </Box>
            </>
          )}

          <Divider />

          {/* Giấy tờ */}
          <Box>
            <Typography fontWeight={700} mb={1}>📎 Giấy tờ ({employee.documents.length})</Typography>
            {employee.documents.length === 0 ? <Typography variant="body2" color="text.secondary">Chưa có.</Typography> : (
              <Stack spacing={0.5}>
                {employee.documents.map((d) => {
                  const n = d.expiresAt ? daysUntil(d.expiresAt) : null;
                  return (
                    <Stack key={d.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip size="small" variant="outlined" label={d.kind} />
                      <Typography variant="body2">{d.name || '—'}</Typography>
                      {d.expiresAt && (
                        <Chip size="small" color={n !== null && n < 0 ? 'error' : n !== null && n <= 90 ? 'warning' : 'default'} variant="outlined"
                          label={n !== null && n < 0 ? `hết hạn ${-n}n` : `HH ${fmtDate(d.expiresAt)}`} />
                      )}
                      {d.fileUrl && (
                        <Link component="button" variant="body2" onClick={() => openFilePreview({ key: d.fileUrl, name: d.name || d.kind })}>
                          <Stack direction="row" spacing={0.3} alignItems="center"><OpenInNewIcon fontSize="inherit" />Xem</Stack>
                        </Link>
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Box>

          <Divider />

          {/* Lịch sử đánh giá */}
          <Box>
            <Typography fontWeight={700} mb={1}>📊 Lịch sử đánh giá ({evals.length})</Typography>
            {evals.length === 0 ? <Typography variant="body2" color="text.secondary">Chưa có kỳ đánh giá nào.</Typography> : (
              <Stack spacing={0.75}>
                {evals.map((e) => (
                  <Box key={e.id} sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip size="small" variant="outlined" label={e.period} />
                      {e.overallScore ? <Rating size="small" value={e.overallScore} precision={0.5} readOnly /> : null}
                      <Chip size="small" color={e.status === 'finalized' ? 'success' : 'default'} label={EVAL_STATUS_LABEL[e.status]} />
                      {e.reviewerName && <Typography variant="caption" color="text.secondary">bởi {e.reviewerName}</Typography>}
                    </Stack>
                    {e.promotion && <Typography variant="caption" color="text.secondary" display="block">Đề xuất: {e.promotion}</Typography>}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
