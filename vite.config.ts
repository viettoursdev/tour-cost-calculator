import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: '/tour-cost-calculator/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep MUI in its own chunk.
          if (id.includes('node_modules/@mui') || id.includes('node_modules/@emotion')) {
            return 'mui';
          }
          if (id.includes('node_modules/firebase')) return 'firebase';
          // KHÔNG gộp thủ công thư viện xuất (jspdf/docx/xlsx/html2canvas/exceljs)
          // hay src/lib/exports/* nữa: mọi call site đã dùng dynamic import(), nên
          // Rollup tự tách chúng thành chunk ASYNC — chỉ nạp khi bấm Xuất, không
          // preload lúc khởi động. (Gộp thủ công vô tình tạo cạnh tĩnh qua dependency
          // dùng chung → kéo cả chunk nặng ~2MB vào bundle đầu.)
        },
      },
    },
  },
  server: { port: 5173 },
});
