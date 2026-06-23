/**
 * Service worker — Viettours Cost Calculator
 * --------------------------------------------------------------------------
 * Tối giản cho phương án push CLIENT-ONLY: chỉ phục vụ OS notification khi app
 * đang mở (kể cả tab chạy nền). KHÔNG nhận server push (không VAPID/PushManager).
 * Click vào thông báo → focus tab app đang mở, hoặc mở mới.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // scope của SW chính là base path của app (/tour-cost-calculator/).
  const target = self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(target) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});
