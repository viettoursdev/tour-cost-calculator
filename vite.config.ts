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
        manualChunks: {
          mui: [
            '@mui/material',
            '@mui/icons-material',
            '@mui/x-data-grid',
            '@mui/x-date-pickers',
          ],
          firebase: ['firebase/app', 'firebase/firestore'],
          exports: ['xlsx', 'jspdf', 'html2canvas', 'docx', 'file-saver', 'exceljs'],
        },
      },
    },
  },
  server: { port: 5173 },
});
