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
          // Group third-party export libs (PDF, DOCX, Excel, etc.).
          if (
            id.includes('node_modules/xlsx')
            || id.includes('node_modules/jspdf')
            || id.includes('node_modules/html2canvas')
            || id.includes('node_modules/docx')
            || id.includes('node_modules/file-saver')
            || id.includes('node_modules/exceljs')
          ) {
            return 'exports';
          }
          // Group our own export source files (including the large embedded
          // DejaVu font and VTE_LOGO base64) so they're only loaded when an
          // export path runs, not in the initial app bundle.
          if (id.includes('/src/lib/exports/')) return 'exports';
        },
      },
    },
  },
  server: { port: 5173 },
});
