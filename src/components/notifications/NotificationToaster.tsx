import { useEffect, useRef, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { canReceivePush } from '@/auth/ROLES';
import { showPushNotif } from '@/lib/notifications';

const TYPE_ICON: Record<string, string> = {
  payment_approval: '🧾', payment_due: '💰', announcement: '📢',
  collab_comment: '💬', collab_invite: '🤝', task: '✅',
};

const SOUND_KEY = 'vte_notif_sound';

/**
 * Một AudioContext dùng chung. Tạo MỘT lần và "mở khoá" (resume) ở lần tương
 * tác đầu tiên của người dùng — trình duyệt chỉ cho phép phát âm thanh sau một
 * user gesture (xem chính sách autoplay). Tạo mới ctx cho mỗi tiếng ping sẽ
 * khiến trình duyệt log cảnh báo "AudioContext was not allowed to start".
 */
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctx();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/** Mở khoá AudioContext ngay khi người dùng tương tác lần đầu (một lần duy nhất). */
function primeAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  window.removeEventListener('pointerdown', primeAudio);
  window.removeEventListener('keydown', primeAudio);
}

/** Short "ting" via WebAudio — no asset needed. Respects the mute flag. */
function playPing(): void {
  try {
    if (localStorage.getItem(SOUND_KEY) === 'off') return;
    const ctx = getCtx();
    // Chưa có user gesture → ctx vẫn 'suspended'; bỏ qua thay vì để trình duyệt
    // cảnh báo. Tiếng ping kế tiếp (sau khi đã tương tác) sẽ phát bình thường.
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    /* ignore (autoplay blocked / no AudioContext) */
  }
}

/**
 * Toast + sound on every newly-arriving unread notification. Mounted ONCE
 * (AppShell). Clicking the toast opens the Notification Center.
 */
export function NotificationToaster() {
  const notifications = useNotificationStore((s) => s.notifications);
  const setCenterOpen = useNotificationStore((s) => s.setCenterOpen);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [toast, setToast] = useState<{ id: string; title: string; type: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  // Mở khoá AudioContext ở lần tương tác đầu tiên để tiếng ping phát được
  // mà không bị trình duyệt chặn (chính sách autoplay).
  useEffect(() => {
    window.addEventListener('pointerdown', primeAudio, { once: true });
    window.addEventListener('keydown', primeAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', primeAudio);
      window.removeEventListener('keydown', primeAudio);
    };
  }, []);

  useEffect(() => {
    // First pass after sign-in records existing ids without toasting, so we
    // don't fire a burst for the initial backlog.
    if (!primed.current) {
      notifications.forEach((n) => seen.current.add(n.id));
      primed.current = true;
      return;
    }
    const fresh = notifications.find((n) => !seen.current.has(n.id) && !n.read);
    notifications.forEach((n) => seen.current.add(n.id));
    if (fresh) {
      setToast({ id: fresh.id, title: fresh.title, type: fresh.type });
      playPing();
      // Bản tin sáng (digest từ Worker Cron) đến qua realtime → hiện OS notification
      // cho cấp ≥ Operations, kể cả khi app đang ở tab nền. Các sự kiện push khác đã
      // được dispatch tại nguồn (notifications.ts) nên không bắn lại ở đây.
      if (canReceivePush(currentUser) && fresh.title.includes('Bản tin sáng')) {
        showPushNotif(fresh.title, fresh.message ?? '', fresh.id);
      }
    }
  }, [notifications, currentUser]);

  if (!toast) return null;
  const icon = TYPE_ICON[toast.type] ?? '🔔';
  return (
    <Snackbar
      open
      autoHideDuration={6000}
      onClose={() => setToast(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        severity="info"
        variant="filled"
        onClose={() => setToast(null)}
        onClick={() => { setCenterOpen(true); setToast(null); }}
        sx={{ cursor: 'pointer', bgcolor: '#0d7a6a', fontWeight: 600, maxWidth: 380 }}
      >
        {icon} {toast.title}
      </Alert>
    </Snackbar>
  );
}
