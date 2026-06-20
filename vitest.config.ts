import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://localhost:54321'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('unit-test-anon-key'),
    // Lets dataBackend.test.ts import the real firebase.ts (it throws at load
    // without these). Store tests mock @/lib/firebase, so they're unaffected.
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('unit-test'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('unit-test.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('unit-test'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('unit-test.appspot.com'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('0'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:0:web:0'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
    passWithNoTests: true,
  },
});
