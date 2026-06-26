import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * `lazyView` — như `React.lazy` nhưng có HẠN GIỜ. Nếu chunk nạp động không xong
 * trong `LOAD_TIMEOUT_MS` (mạng treo, request không bao giờ resolve/reject), ta
 * tự reject để <ChunkErrorBoundary> hiện nút "Tải lại trang" thay vì xoay vòng
 * mãi mãi. Lỗi nạp chunk thường (404 sau deploy mới) đã được `installChunkReload`
 * bắt qua sự kiện `vite:preloadError`; hạn giờ này phủ thêm trường hợp request
 * BỊ TREO (không phát preloadError, không reject).
 */
const LOAD_TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('CHUNK_LOAD_TIMEOUT')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

// `ComponentType<any>` giữ nguyên kiểu props của từng view (giống chữ ký gốc của
// React.lazy) — nếu dùng `unknown` sẽ làm mất props như onExit/open.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyView<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => withTimeout(factory(), LOAD_TIMEOUT_MS));
}
