import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { numericChecks, reviewContractAI, type ContractReview, type ReviewSeverity } from './contractReview';
import type { Contract } from '@/types';

const SEV_COLOR: Record<ReviewSeverity, string> = { 'cao': '#dc3250', 'trung bình': '#d18a13', 'thấp': '#0d7a6a' };

export function ContractReviewDialog({ contract, onClose }: { contract: Contract | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<ContractReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (c: Contract) => {
    setLoading(true); setError(null); setReview(null);
    reviewContractAI(c)
      .then(setReview)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (contract) run(contract);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.id]);

  const checks = contract ? numericChecks(contract) : [];

  return (
    <Dialog open={!!contract} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>🤖 AI rà soát hợp đồng {contract?.contractNo ? `· ${contract.contractNo}` : ''}</DialogTitle>
      <DialogContent dividers>
        {/* Kiểm tra số liệu tức thì (không cần AI) */}
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Kiểm tra số liệu</Typography>
        <Stack spacing={0.5} sx={{ mt: 0.75, mb: 2 }}>
          {checks.map((c, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="baseline">
              <Box component="span" sx={{ color: c.level === 'warn' ? '#d18a13' : '#0d7a6a' }}>{c.level === 'warn' ? '⚠' : '✓'}</Box>
              <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 160 }}>{c.label}</Typography>
              <Typography variant="body2" color={c.level === 'warn' ? '#b9770f' : 'text.secondary'}>{c.detail}</Typography>
            </Stack>
          ))}
        </Stack>

        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>AI rà soát rủi ro & điều khoản</Typography>
        <Box sx={{ mt: 1 }}>
          {loading && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3, justifyContent: 'center', color: 'text.secondary' }}>
              <CircularProgress size={22} sx={{ color: '#14a08c' }} /><Typography variant="body2">AI đang đọc & rà soát hợp đồng…</Typography>
            </Stack>
          )}
          {error && !loading && (
            <Alert severity="error" action={contract && <Button size="small" onClick={() => run(contract)}>Thử lại</Button>}>{error}</Alert>
          )}
          {review && !loading && (
            <Stack spacing={1.25}>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>{review.summary}</Typography>
              {review.findings.length === 0 ? (
                <Alert severity="success">AI không phát hiện vấn đề đáng kể.</Alert>
              ) : review.findings.map((f, i) => (
                <Box key={i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25, borderLeft: `4px solid ${SEV_COLOR[f.severity] ?? '#999'}` }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Chip size="small" label={f.severity} sx={{ bgcolor: `${SEV_COLOR[f.severity] ?? '#999'}22`, color: SEV_COLOR[f.severity] ?? '#555', fontWeight: 700, height: 20 }} />
                    <Typography variant="caption" fontWeight={800} color="text.secondary">{f.category}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>{f.issue}</Typography>
                  <Typography variant="body2" color="#0d7a6a"><b>Đề xuất:</b> {f.suggestion}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
          ⚠ Gợi ý của AI chỉ để tham khảo, không thay thế tư vấn pháp lý. Nội dung hợp đồng được gửi qua AI Worker để phân tích.
        </Typography>
      </DialogContent>
      <DialogActions>
        {contract && <Button onClick={() => run(contract)} disabled={loading}>Rà soát lại</Button>}
        <Button onClick={onClose} variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
