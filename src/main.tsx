import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';
import { installChunkReload } from './lib/chunkReload';

// Tự tải lại khi nạp động chunk thất bại do deploy mới đổi hash (tab cũ).
installChunkReload();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
