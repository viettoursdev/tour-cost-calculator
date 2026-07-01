import { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, LinearProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { sbGetPublicWorkflow } from '@/lib/supabase';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { PublicWorkflowDoc, WorkflowStatus } from '@/types';

type Lang = 'vi' | 'en';

const STATUS_META: Record<WorkflowStatus, { vi: string; en: string; color: string }> = {
  todo:    { vi: 'Sắp thực hiện', en: 'Upcoming',    color: '#64748b' },
  doing:   { vi: 'Đang thực hiện', en: 'In progress', color: '#2563eb' },
  done:    { vi: 'Hoàn tất',      en: 'Completed',   color: '#27ae60' },
  blocked: { vi: 'Tạm hoãn',      en: 'On hold',     color: '#dc3250' },
  skipped: { vi: '—',            en: '—',           color: '#94a3b8' },
};

const fmtDate = (iso?: string, lang: Lang = 'vi') =>
  iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

export function PublicWorkflowView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<PublicWorkflowDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('vi');
  const t = (vi: string, en: string) => (lang === 'en' ? en : vi);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sbGetPublicWorkflow(token)
      .then((d) => { if (!on) return; if (d) setDoc(d); else setError('Không tìm thấy tiến độ. Link có thể chưa được duyệt, đã bị gỡ hoặc hết hạn.'); })
      .catch((e) => { if (on) setError('Không tải được tiến độ: ' + (e as Error).message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [token]);

  if (loading) {
    return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0d7a6a' }} /></Box>;
  }
  if (error || !doc) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f4f7fb' }}>
        <Alert severity="warning" sx={{ maxWidth: 460 }}>{error ?? 'Không có dữ liệu.'}</Alert>
      </Box>
    );
  }

  const p = doc.progress;
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef3f8', py: { xs: 0, sm: 4 } }}>
      <Box sx={{ maxWidth: 820, mx: 'auto', bgcolor: '#fff', boxShadow: { sm: '0 12px 40px rgba(15,58,74,0.12)' }, borderRadius: { sm: 3 }, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 3 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 34, filter: 'brightness(0) invert(1)', mb: 1.5 }} />
            <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, v: Lang | null) => v && setLang(v)}
              sx={{ '& .MuiToggleButton-root': { color: '#fff', borderColor: 'rgba(255,255,255,0.5)', px: 1, py: 0.25 }, '& .Mui-selected': { bgcolor: 'rgba(255,255,255,0.22) !important', color: '#fff !important' } }}>
              <ToggleButton value="vi">VI</ToggleButton>
              <ToggleButton value="en">EN</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Typography sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 900, lineHeight: 1.15 }}>{doc.tourName}</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
            {t('Tiến độ chuẩn bị tour', 'Tour preparation progress')}
            {doc.dest ? ` · ${doc.dest}` : ''}{doc.departDate ? ` · ${t('Khởi hành', 'Departure')} ${fmtDate(doc.departDate, lang)}` : ''}
          </Typography>
          {/* Progress */}
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{t('Hoàn thành', 'Completed')} {p.done}/{p.total}</Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{p.pct}%</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={p.pct}
              sx={{ height: 9, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.25)', '& .MuiLinearProgress-bar': { bgcolor: '#fff' } }} />
          </Box>
        </Box>

        <Box sx={{ px: { xs: 1.5, sm: 4 }, py: 3 }}>
          {doc.note && <Typography sx={{ mb: 2, whiteSpace: 'pre-wrap', color: 'text.secondary' }}>{doc.note}</Typography>}

          <Stack spacing={1}>
            {doc.steps.map((s, i) => {
              const meta = STATUS_META[s.status];
              const label = lang === 'en' ? (s.labelEn || s.label) : s.label;
              const date = s.doneDate || s.dueDate;
              return (
                <Paper key={i} variant="outlined" sx={{ p: 1.5, borderLeft: `4px solid ${meta.color}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: meta.color + '22', color: meta.color, fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.status === 'done' ? '✓' : i + 1}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: s.status === 'done' ? 'text.secondary' : 'text.primary' }}>{label}</Typography>
                    {date && (
                      <Typography variant="caption" color="text.secondary">
                        {s.doneDate ? t('Hoàn tất', 'Completed') : t('Dự kiến', 'Planned')}: {fmtDate(date, lang)}
                      </Typography>
                    )}
                  </Box>
                  <Chip size="small" label={lang === 'en' ? meta.en : meta.vi} sx={{ bgcolor: meta.color + '1f', color: meta.color, fontWeight: 700, flexShrink: 0 }} />
                </Paper>
              );
            })}
          </Stack>

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
            {t('Cập nhật', 'Updated')}: {fmtDate(doc.publishedAt, lang)} · {t('cung cấp bởi', 'provided by')} {doc.publishedBy} · Viettours.
            {' '}{t('Mọi thắc mắc xin liên hệ nhân viên phụ trách.', 'Please contact your consultant for any questions.')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
