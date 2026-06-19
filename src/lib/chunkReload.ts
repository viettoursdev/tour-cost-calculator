/**
 * Khi deploy mới đổi hash các chunk, tab cũ sẽ fail khi nạp động module
 * ("Failed to fetch dynamically imported module"). Vite phát sự kiện
 * `vite:preloadError` cho các lỗi này → tự tải lại trang để lấy bản mới,
 * có chặn lặp (không reload liên tục nếu file thật sự 404 vì lý do khác).
 */
const KEY = 'vte_preload_reload_at';
const GUARD_MS = 15000;

/** Chỉ tải lại nếu chưa tải lại trong `windowMs` gần đây. */
export function shouldReload(lastAt: number, now: number, windowMs = GUARD_MS): boolean {
  return now - lastAt >= windowMs;
}

export function installChunkReload(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', () => {
    let lastAt = 0;
    try { lastAt = Number(sessionStorage.getItem(KEY) || 0); } catch { /* ignore */ }
    const now = Date.now();
    if (!shouldReload(lastAt, now)) return;
    try { sessionStorage.setItem(KEY, String(now)); } catch { /* ignore */ }
    window.location.reload();
  });
}
