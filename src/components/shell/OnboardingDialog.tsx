import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, MobileStepper, Stack, Typography } from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { GUIDE_STEPS, CONTEXT_LABEL } from './guideSteps';
import { LEGACY } from '@/theme';

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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <Box sx={{ pt: 1.5, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: LEGACY.teal, fontWeight: 800, letterSpacing: 0.5 }}>{heading.toUpperCase()}</Typography>
      </Box>
      <Box sx={{ px: 3, pb: 1, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 52, lineHeight: 1 }}>{s.icon}</Typography>
        <Typography fontWeight={900} fontSize={19} sx={{ mt: 1.25, color: LEGACY.navy }}>{s.title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, minHeight: 120 }}>{s.body}</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>{i + 1}/{steps.length}</Typography>
      </Box>
      <MobileStepper variant="dots" steps={steps.length} position="static" activeStep={i}
        sx={{ background: 'transparent', '& .MuiMobileStepper-dotActive': { bgcolor: LEGACY.teal } }}
        nextButton={
          last
            ? <Button variant="contained" onClick={onClose} sx={{ background: LEGACY.headerGradient, fontWeight: 800 }}>Bắt đầu</Button>
            : <Button size="small" onClick={() => setI((v) => v + 1)}>Tiếp<KeyboardArrowRight /></Button>
        }
        backButton={<Button size="small" disabled={i === 0} onClick={() => setI((v) => v - 1)}><KeyboardArrowLeft />Trước</Button>}
      />
      <Stack alignItems="center" spacing={0.25} sx={{ pb: 1.5 }}>
        {canSeeAll && (
          <Button size="small" onClick={() => setShowAll(true)} sx={{ fontWeight: 700, color: LEGACY.teal }}>
            📚 Xem toàn bộ hướng dẫn
          </Button>
        )}
        {!last && <Button size="small" color="inherit" onClick={onClose} sx={{ color: 'text.disabled' }}>Bỏ qua</Button>}
      </Stack>
    </Dialog>
  );
}
