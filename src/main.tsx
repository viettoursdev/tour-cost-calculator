import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';
import { installChunkReload } from './lib/chunkReload';

// Tự tải lại khi nạp động chunk thất bại do deploy mới đổi hash (tab cũ).
installChunkReload();

// Đăng ký service worker để hiện OS notification (Web Push client-only) — chỉ phục
// vụ thông báo khi app đang mở/tab nền. Bọc try/catch (Safari/iOS có thể bỏ qua).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((e) => console.warn('SW register failed:', (e as Error).message));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
