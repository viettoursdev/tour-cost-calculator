import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, LinearProgress, Stack, Typography } from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { GUIDE_STEPS, CONTEXT_LABEL } from './guideSteps';
import { LEGACY } from '@/theme';

/** Ảnh minh hoạ: chỉ hiện khi có file thật trong public/guide/ — không có thì bỏ qua (không placeholder). */
function GuideImage({ src }: { src?: string }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [src]);
  if (!src || errored) return null;
  const url = `${import.meta.env.BASE_URL}guide/${src}`;
  return (
    <Box component="img" src={url} alt="" onError={() => setErrored(true)}
      sx={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover',
        borderBottom: '1px solid rgba(15,58,74,0.08)' }} />
  );
}

/**
 * Hướng dẫn nhanh. Truyền `contextTag` để mở guide NGỮ CẢNH (chỉ các bước liên
 * quan màn hình đang xem) — kèm nút "Xem toàn bộ hướng dẫn".
 */
export function OnboardingDialog({ open, onClose, contextTag }: { open: boolean; onClose: () => void; contextTag?: string }) {
  const [i, setI] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const steps = useMemo(() => {
    if (!contextTag || showAll) return GUIDE_STEPS;
    const filtered = GUIDE_STEPS.filter((s) => s.tags.includes(contextTag));
    return filtered.length ? filtered : GUIDE_STEPS;
  }, [contextTag, showAll]);

  // Mở mới / đổi ngữ cảnh → về bước đầu (và reset toggle xem-tất-cả khi mở).
  useEffect(() => { if (open) { setI(0); setShowAll(false); } }, [open, contextTag]);
  useEffect(() => { setI(0); }, [showAll]);

  const contextual = !!contextTag && !showAll;
  const heading = contextual && CONTEXT_LABEL[contextTag]
    ? `Hướng dẫn: ${CONTEXT_LABEL[contextTag]}`
    : 'Hướng dẫn nhanh';
  const canSeeAll = contextual && steps.length < GUIDE_STEPS.length;

  const last = i === steps.length - 1;
  const s = steps[Math.min(i, steps.length - 1)];
  if (!s) return null;

  const progress = ((i + 1) / steps.length) * 100;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, overflow: 'hidden' } } }}>
      {/* Thanh tiêu đề màu thương hiệu */}
      <Box sx={{ background: LEGACY.headerGradient, px: 3, pt: 2, pb: 1.75 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 800, letterSpacing: 0.6, fontSize: 12 }}>
            {heading.toUpperCase()}
          </Typography>
          <Box sx={{ px: 1.1, py: 0.25, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.18)' }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{i + 1}/{steps.length}</Typography>
          </Box>
        </Stack>
        <LinearProgress variant="determinate" value={progress}
          sx={{
            mt: 1.5, height: 5, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.22)',
            '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: '#fff', transition: 'transform .45s cubic-bezier(.4,0,.2,1)' },
          }} />
      </Box>

      <GuideImage src={s.image} />

      {/* Nội dung — remount theo bước để chạy hiệu ứng mượt */}
      <Box key={i} sx={{
        px: 3.5, pt: 3, pb: 2.5, textAlign: 'center',
        animation: 'guideStepIn 320ms cubic-bezier(.16,1,.3,1)',
        '@keyframes guideStepIn': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'none' },
        },
      }}>
        <Box sx={{
          width: 64, height: 64, mx: 'auto', mb: 1.75, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, lineHeight: 1,
          background: 'linear-gradient(135deg,#eef7f5,#dcefe9)',
          boxShadow: '0 6px 18px rgba(13,122,106,0.18)',
        }}>{s.icon}</Box>
        <Typography fontWeight={900} fontSize={20} sx={{ color: LEGACY.navy, letterSpacing: -0.2 }}>{s.title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1.25, minHeight: 96, fontSize: 14.5, lineHeight: 1.6 }}>{s.body}</Typography>
      </Box>

      {/* Điều hướng */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, pb: 1 }}>
        <Button size="small" disabled={i === 0} onClick={() => setI((v) => v - 1)}
          sx={{ color: 'text.secondary', fontWeight: 600, visibility: i === 0 ? 'hidden' : 'visible' }}>
          <KeyboardArrowLeft fontSize="small" />Trước
        </Button>
        {last
          ? <Button variant="contained" onClick={onClose}
              sx={{ background: LEGACY.headerGradient, fontWeight: 800, borderRadius: 999, px: 2.75, boxShadow: '0 4px 14px rgba(13,122,106,0.3)' }}>
              Bắt đầu
            </Button>
          : <Button variant="contained" onClick={() => setI((v) => v + 1)}
              sx={{ background: LEGACY.headerGradient, fontWeight: 800, borderRadius: 999, px: 2.5, boxShadow: '0 4px 14px rgba(13,122,106,0.3)' }}>
              Tiếp<KeyboardArrowRight fontSize="small" />
            </Button>}
      </Stack>

      <Stack alignItems="center" spacing={0.25} sx={{ pb: 1.75, pt: 0.5 }}>
        {canSeeAll && (
          <Button size="small" onClick={() => setShowAll(true)} sx={{ fontWeight: 700, color: LEGACY.teal }}>
            📚 Xem toàn bộ hướng dẫn
          </Button>
        )}
        {!last && <Button size="small" color="inherit" onClick={onClose} sx={{ color: 'text.disabled', fontWeight: 600 }}>Bỏ qua</Button>}
      </Stack>
    </Dialog>
  );
}
