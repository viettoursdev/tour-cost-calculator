import { Alert, Box, Button, Slide } from '@mui/material';
import { useToastStore } from '@/stores/toastStore';
import { useEffect } from 'react';

/** Hàng toast không chặn, góc dưới — thay cho window.alert thông báo. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Tự ẩn sau vài giây (toast có action giữ lâu hơn để kịp bấm).
  useEffect(() => {
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), t.action ? 6000 : 3500));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts, dismiss]);

  if (!toasts.length) return null;
  return (
    <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: (t) => t.zIndex.snackbar, display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 420 }}>
      {toasts.map((t) => (
        <Slide key={t.id} direction="left" in mountOnEnter unmountOnExit>
          <Alert severity={t.severity} variant="filled" onClose={() => dismiss(t.id)}
            sx={{ boxShadow: 4, alignItems: 'center' }}
            action={t.action
              ? <Button color="inherit" size="small" onClick={() => { t.action!.onClick(); dismiss(t.id); }} sx={{ fontWeight: 800 }}>{t.action.label}</Button>
              : undefined}>
            {t.msg}
          </Alert>
        </Slide>
      ))}
    </Box>
  );
}
